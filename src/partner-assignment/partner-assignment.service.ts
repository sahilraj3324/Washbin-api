import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { AvailabilityService } from '../availability/availability.service';
import { PARTNER_ENGAGED_STATUSES } from '../bookings/booking-status';
import { BookingsService } from '../bookings/bookings.service';
import { Booking, BookingDocument } from '../bookings/schemas/booking.schema';
import { BOOKING_EVENT } from '../notifications/booking-events';
import {
  Partner,
  PartnerStatus,
  VerificationStatus,
} from '../partners/partner.schema';
import { AssignmentStatus } from './assignment-status';
import { MatchingService } from './matching.service';
import {
  PartnerAssignment,
  PartnerAssignmentDocument,
} from './schemas/partner-assignment.schema';

/** How long a partner has to answer before the offer moves on. */
export const OFFER_WINDOW_SECONDS = 60;
const MS_PER_SECOND = 1000;
const DUPLICATE_KEY = 11000;

export type MatchingOutcome = 'offered' | 'no_partner_found' | 'already_open';

export interface StartMatchingResult {
  outcome: MatchingOutcome;
  assignment?: PartnerAssignment;
  /** How many partners passed the funnel on this pass. */
  candidatesConsidered: number;
}

export interface StartMatchingOptions {
  maxDistanceKm?: number;
  maxLocationAgeMinutes?: number;
}

/**
 * Owns the offer lifecycle: who gets asked, for how long, and what happens
 * to the booking when they answer. Selection itself lives in MatchingService.
 */
export interface SweepResult {
  /** Offers whose window had passed. */
  expired: number;
  /** Bookings re-offered to the next partner after a lapse. */
  readvanced: number;
  /** Scheduled bookings woken because their time had come. */
  dispatched: number;
}

@Injectable()
export class PartnerAssignmentService {
  private readonly logger = new Logger(PartnerAssignmentService.name);

  constructor(
    @InjectModel(PartnerAssignment.name)
    private readonly assignmentModel: Model<PartnerAssignment>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Partner.name)
    private readonly partnerModel: Model<Partner>,
    private readonly matchingService: MatchingService,
    private readonly availabilityService: AvailabilityService,
    // forwardRef on both sides of the bookings <-> assignment cycle. With it
    // on only one side the graph resolves or fails depending on which module
    // Nest instantiates first, which is module load order.
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Offers a booking to its nearest eligible partner.
   *
   * Called on booking creation and again each time an offer falls through.
   * Moves the booking to partner_assigned on success, or no_partner_found
   * when the funnel comes up empty.
   */
  async startMatching(
    bookingId: string,
    options: StartMatchingOptions = {},
  ): Promise<StartMatchingResult> {
    const booking = await this.loadBooking(bookingId);

    // A live offer is already out; let it run its window.
    const open = await this.assignmentModel
      .exists({
        bookingId: booking._id,
        status: 'offered',
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (open) {
      return { outcome: 'already_open', candidatesConsidered: 0 };
    }

    await this.ensureSearching(booking);

    const candidates = await this.matchingService.findCandidates(
      booking,
      options,
    );

    if (!candidates.length) {
      await this.bookingsService.transitionTo(bookingId, 'no_partner_found', {
        assignedPartnerId: null,
      });
      this.logger.log(`Booking ${bookingId}: no eligible partner found`);
      return { outcome: 'no_partner_found', candidatesConsidered: 0 };
    }

    // Nearest first, so the head of the list is the offer.
    const [nearest] = candidates;
    const now = new Date();

    let assignment: PartnerAssignmentDocument;
    try {
      assignment = await this.assignmentModel.create({
        bookingId: booking._id,
        partnerId: nearest.partnerId,
        status: 'offered',
        offeredAt: now,
        expiresAt: new Date(
          now.getTime() + OFFER_WINDOW_SECONDS * MS_PER_SECOND,
        ),
        distanceKm: nearest.distanceKm,
      });
    } catch (error) {
      // The partial unique index rejected a second open offer, so another
      // call won the race. Its offer stands.
      if (this.isDuplicateKeyError(error)) {
        return {
          outcome: 'already_open',
          candidatesConsidered: candidates.length,
        };
      }
      throw error;
    }

    await this.bookingsService.transitionTo(bookingId, 'partner_assigned', {
      assignedPartnerId: nearest.partnerId,
    });

    // Tells the offered partner specifically, which the booking's own
    // status event cannot do.
    this.eventEmitter.emit(BOOKING_EVENT.PartnerOffered, {
      bookingId,
      customerId: booking.customerId.toString(),
      partnerId: nearest.partnerId.toString(),
    });

    this.logger.log(
      `Booking ${bookingId} offered to partner ${String(nearest.partnerId)} ` +
        `at ${nearest.distanceKm.toFixed(2)}km`,
    );

    return {
      outcome: 'offered',
      assignment,
      candidatesConsidered: candidates.length,
    };
  }

  /** A partner's live offers, expired ones swept out first. */
  async findOpenOffersForPartner(
    partnerId: string,
  ): Promise<PartnerAssignment[]> {
    await this.sweepExpired();

    return this.assignmentModel
      .find({
        partnerId,
        status: 'offered',
        expiresAt: { $gt: new Date() },
      })
      .sort({ offeredAt: 1 })
      .populate(this.offerPopulate())
      .exec();
  }

  /**
   * The partner takes the job. The status guard is inside the update filter,
   * so two racing accepts cannot both win.
   */
  async accept(
    partnerId: string,
    assignmentId: string,
  ): Promise<PartnerAssignment> {
    const openOffer = await this.loadOpenOfferForAcceptance(
      partnerId,
      assignmentId,
    );

    await this.assertPartnerCanAccept(partnerId, openOffer.bookingId);
    await this.availabilityService.markBusyForAcceptedJob(partnerId);

    let assignment: PartnerAssignmentDocument;
    try {
      assignment = await this.claim(partnerId, assignmentId, 'accepted');

      await this.bookingsService.transitionTo(
        assignment.bookingId.toString(),
        'accepted',
        { assignedPartnerId: assignment.partnerId },
      );
    } catch (error) {
      await this.availabilityService.restoreAvailableAfterFailedAcceptance(
        partnerId,
      );
      throw error;
    }

    this.logger.log(
      `Partner ${partnerId} accepted booking ${assignment.bookingId.toString()}`,
    );
    return this.loadAssignmentForPartner(partnerId, assignmentId);
  }

  /** The partner declines, and the next nearest partner is offered. */
  async reject(
    partnerId: string,
    assignmentId: string,
  ): Promise<PartnerAssignment> {
    const assignment = await this.claim(partnerId, assignmentId, 'rejected');
    await this.offerNext(assignment.bookingId.toString());
    return this.loadAssignmentForPartner(partnerId, assignmentId);
  }

  private offerPopulate() {
    return {
      path: 'bookingId',
      select:
        'customerId serviceId addressSnapshot bookingType scheduledAt status price notes assignedPartnerId createdAt acceptedAt',
      populate: [
        {
          path: 'customerId',
          select: 'name phone profileImage',
        },
        {
          path: 'serviceId',
          select:
            'name pricingType basePrice estimatedDurationMinutes iconUrl imageUrl',
        },
      ],
    };
  }

  /**
   * Closes offers whose window has passed and moves those bookings on.
   *
   * Lazy rather than scheduled: this runs whenever offers are read, and is
   * also exposed as an endpoint so a platform cron can drive it for bookings
   * nobody is currently looking at.
   */
  async sweepExpired(): Promise<{ expired: number; readvanced: number }> {
    const stale = await this.assignmentModel
      .find({ status: 'offered', expiresAt: { $lte: new Date() } })
      .select('_id bookingId')
      .exec();

    if (!stale.length) {
      return { expired: 0, readvanced: 0 };
    }

    await this.assignmentModel
      .updateMany(
        { _id: { $in: stale.map((row) => row._id) }, status: 'offered' },
        { status: 'expired', respondedAt: new Date() },
      )
      .exec();

    // De-duplicated: several stale offers can belong to one booking only if
    // the index was bypassed, but advancing twice would be wasteful anyway.
    const bookingIds = [
      ...new Set(stale.map((row) => row.bookingId.toString())),
    ];

    let readvanced = 0;
    for (const bookingId of bookingIds) {
      const moved = await this.offerNext(bookingId);
      if (moved) {
        readvanced += 1;
      }
    }

    this.logger.log(
      `Swept ${stale.length} expired offer(s), re-advanced ${readvanced} booking(s)`,
    );
    return { expired: stale.length, readvanced };
  }

  /**
   * Starts looking for a partner for every scheduled booking whose time has
   * come, and retries those that recently found nobody.
   *
   * This is the other half of scheduling: creation deliberately leaves a
   * scheduled booking in `pending`, and without something to wake it there it
   * would stay there for ever. `startMatching` moves it on, so this only has
   * to decide which bookings are due.
   *
   * Driven by the platform cron, not a timer: a `@nestjs/schedule` interval
   * would not survive between serverless invocations.
   */
  async dispatchDueScheduled(): Promise<{ dispatched: number }> {
    const bookingIds = await this.bookingsService.findDueScheduledIds();

    if (!bookingIds.length) {
      return { dispatched: 0 };
    }

    let dispatched = 0;
    for (const bookingId of bookingIds) {
      try {
        const result = await this.startMatching(bookingId);

        // 'already_open' means an offer was out; the booking was not waiting
        // after all. Everything else left `pending` behind, which is the
        // point of this sweep even when the outcome is no_partner_found.
        if (result.outcome !== 'already_open') {
          dispatched += 1;
        }
      } catch (error) {
        // One booking that cannot be dispatched — cancelled mid-sweep, say —
        // must not stop the rest of the batch.
        this.logger.error(
          `Could not dispatch scheduled booking ${bookingId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Dispatched ${dispatched} of ${bookingIds.length} due scheduled booking(s)`,
    );
    return { dispatched };
  }

  /**
   * Everything the platform cron should do on a tick: close lapsed offers,
   * advance those bookings, then dispatch scheduled bookings whose time has
   * come.
   *
   * Offers are swept first so a partner freed by a lapsed offer is available
   * to the scheduled bookings dispatched immediately after.
   */
  async sweepDue(): Promise<SweepResult> {
    const swept = await this.sweepExpired();
    const { dispatched } = await this.dispatchDueScheduled();

    return { ...swept, dispatched };
  }

  /** Cancels the open offer for a booking, e.g. the customer cancelled. */
  async cancelOpenOffers(bookingId: string): Promise<{ cancelled: number }> {
    const result = await this.assignmentModel
      .updateMany(
        { bookingId, status: 'offered' },
        { status: 'cancelled', respondedAt: new Date() },
      )
      .exec();

    return { cancelled: result.modifiedCount };
  }

  /**
   * Puts the booking back to searching and offers the next partner. Failures
   * are swallowed: an offer that cannot be advanced leaves the booking in
   * searching_partner for the next sweep rather than failing the response the
   * partner is waiting on.
   */
  private async offerNext(bookingId: string): Promise<boolean> {
    try {
      await this.bookingsService.transitionTo(bookingId, 'searching_partner', {
        assignedPartnerId: null,
      });
      const result = await this.startMatching(bookingId);
      return result.outcome === 'offered';
    } catch (error) {
      this.logger.error(
        `Could not advance booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Moves an offer out of `offered` atomically. The filter carries the
   * partner, the status and the deadline, so an offer that belongs to someone
   * else, was already answered, or has lapsed cannot be claimed.
   */
  private async claim(
    partnerId: string,
    assignmentId: string,
    next: Extract<AssignmentStatus, 'accepted' | 'rejected'>,
  ): Promise<PartnerAssignmentDocument> {
    if (!isValidObjectId(assignmentId)) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    const claimed = await this.assignmentModel
      .findOneAndUpdate(
        {
          _id: assignmentId,
          partnerId,
          status: 'offered',
          expiresAt: { $gt: new Date() },
        },
        { status: next, respondedAt: new Date() },
        { new: true },
      )
      .exec();

    if (claimed) {
      return claimed;
    }

    // Nothing matched, so say why rather than a bare 404.
    const existing = await this.assignmentModel
      .findOne({ _id: assignmentId, partnerId })
      .exec();

    if (!existing) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    if (existing.status !== 'offered') {
      throw new ConflictException(`That offer was already ${existing.status}`);
    }
    throw new ConflictException('That offer has expired');
  }

  private async loadAssignmentForPartner(
    partnerId: string,
    assignmentId: string,
  ): Promise<PartnerAssignment> {
    if (!isValidObjectId(assignmentId)) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    const assignment = await this.assignmentModel
      .findOne({ _id: assignmentId, partnerId })
      .populate(this.offerPopulate())
      .exec();

    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    return assignment;
  }

  private async loadOpenOfferForAcceptance(
    partnerId: string,
    assignmentId: string,
  ): Promise<PartnerAssignmentDocument> {
    if (!isValidObjectId(assignmentId)) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }

    const assignment = await this.assignmentModel
      .findOne({ _id: assignmentId, partnerId })
      .exec();

    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    if (assignment.status !== 'offered') {
      throw new ConflictException(
        `That offer was already ${assignment.status}`,
      );
    }
    if (assignment.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('That offer has expired');
    }

    const booking = await this.loadBooking(assignment.bookingId.toString());
    if (
      booking.status !== 'partner_assigned' ||
      booking.assignedPartnerId?.toString() !== partnerId
    ) {
      throw new ConflictException('This job is no longer available.');
    }

    return assignment;
  }

  private async assertPartnerCanAccept(
    partnerId: string,
    bookingId: Types.ObjectId,
  ): Promise<void> {
    if (!isValidObjectId(partnerId)) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }

    const partner = await this.partnerModel.findById(partnerId).exec();

    if (!partner) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }
    if (
      partner.status !== PartnerStatus.Active ||
      partner.verificationStatus !== VerificationStatus.Verified
    ) {
      throw new BadRequestException(
        'Only approved active partners can accept jobs',
      );
    }

    const engagedQuery: FilterQuery<Booking> = {
      assignedPartnerId: partnerId,
      status: { $in: PARTNER_ENGAGED_STATUSES },
      _id: { $ne: bookingId },
    };

    const alreadyEngaged = await this.bookingModel.exists(engagedQuery).exec();

    if (alreadyEngaged) {
      throw new ConflictException(
        'You already have an active job. Finish it before accepting another.',
      );
    }
  }

  /**
   * Matching only runs from searching_partner. A scheduled booking sitting in
   * pending, or a retry of no_partner_found, is moved there first.
   */
  private async ensureSearching(booking: BookingDocument): Promise<void> {
    if (booking.status === 'searching_partner') {
      return;
    }

    if (booking.status === 'pending' || booking.status === 'no_partner_found') {
      await this.bookingsService.transitionTo(
        booking._id.toString(),
        'searching_partner',
        { assignedPartnerId: null },
      );
      booking.status = 'searching_partner';
      return;
    }

    throw new ConflictException(
      `Cannot match a booking that is ${booking.status}`,
    );
  }

  private async loadBooking(bookingId: string): Promise<BookingDocument> {
    if (!isValidObjectId(bookingId)) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    const booking = await this.bookingModel.findById(bookingId).exec();

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }
    return booking;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === DUPLICATE_KEY
    );
  }
}
