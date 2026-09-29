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
import { OperationalAreasService } from '../addresses/operational-areas.service';
import { Address } from '../addresses/schemas/address.schema';
import { Customer } from '../customers/customer.schema';
import {
  BOOKING_EVENT,
  BookingEventPayload,
  STATUS_EVENT,
} from '../notifications/booking-events';
import { PartnerAssignmentService } from '../partner-assignment/partner-assignment.service';
import { Service } from '../services/schemas/service.schema';
import {
  ACTIVE_BOOKING_STATUSES,
  BookingStatus,
  canTransition,
  initialStatus,
  STATUS_TIMESTAMP_FIELD,
} from './booking-status';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Booking, BookingDocument } from './schemas/booking.schema';

/** Nothing may be booked closer than this, to leave dispatch a chance. */
const MIN_SCHEDULE_LEAD_MINUTES = 15;
/** Nor further out than this, which keeps the schedule queue bounded. */
const MAX_SCHEDULE_HORIZON_DAYS = 60;
/** Assumed job length when a service does not state one. */
const DEFAULT_SLOT_MINUTES = 60;
/**
 * How early dispatch starts looking for a partner for a scheduled booking.
 * Matching is sequential with a 60s window per offer, so starting at the slot
 * itself would make every scheduled booking late.
 */
const SCHEDULED_DISPATCH_LEAD_MINUTES = 30;
/**
 * How long after its slot a scheduled booking that found nobody is still
 * worth retrying. Bounded so a booking nobody can serve stops costing work
 * rather than being retried forever.
 */
const SCHEDULED_RETRY_GRACE_MINUTES = 30;
/** Keeps one cron invocation inside a serverless time limit. */
const SCHEDULED_DISPATCH_BATCH = 50;
const MS_PER_MINUTE = 60_000;
const DEFAULT_CURRENCY = 'INR';

export interface BookingTransitionChanges {
  /** An ObjectId assigns the partner; null clears the assignment. */
  assignedPartnerId?: Types.ObjectId | null;
}

export interface FindBookingsFilter {
  status?: BookingStatus;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<Service>,
    @InjectModel(Address.name)
    private readonly addressModel: Model<Address>,
    private readonly operationalAreasService: OperationalAreasService,
    // forwardRef: partner-assignment drives booking status while booking
    // creation kicks off matching.
    @Inject(forwardRef(() => PartnerAssignmentService))
    private readonly partnerAssignmentService: PartnerAssignmentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Validates the request end to end, then stores it in the status its type
   * calls for. Deliberately does no partner matching: this creates the
   * request, partner-assignment fulfils it.
   */
  async createForCustomer(
    customerId: string,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    await this.assertCustomerExists(customerId);

    const service = await this.loadActiveService(dto.serviceId);
    const address = await this.loadUsableAddress(customerId, dto.addressId);

    this.assertScheduleValid(dto);

    // Checked against the address's own coordinates, not anything the client
    // sent, so a customer cannot book past the serviceable boundary.
    const { serviceable } =
      await this.operationalAreasService.checkServiceability({
        latitude: address.latitude,
        longitude: address.longitude,
        serviceId: dto.serviceId,
      });

    if (!serviceable) {
      throw new BadRequestException(
        'That location is not serviceable for this service',
      );
    }

    await this.assertNoConflictingBooking(customerId, dto, service);

    const booking = await this.bookingModel.create({
      customerId,
      serviceId: dto.serviceId,
      addressId: dto.addressId,
      addressSnapshot: {
        fullAddress: address.fullAddress,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },
      bookingType: dto.bookingType,
      scheduledAt: dto.scheduledAt,
      status: initialStatus(dto.bookingType),
      price: {
        baseAmount: service.basePrice,
        // Only fixed pricing is knowable now; hourly and starting_from are
        // settled when the work is done.
        finalAmount:
          service.pricingType === 'fixed' ? service.basePrice : undefined,
        currency: DEFAULT_CURRENCY,
      },
      notes: dto.notes,
    });

    this.emitBookingEvent(BOOKING_EVENT.Created, {
      bookingId: booking._id.toString(),
      customerId,
    });

    if (dto.bookingType === 'instant') {
      await this.startMatchingQuietly(booking._id.toString());
      // Matching has probably moved the status on already, so answer with the
      // stored state rather than this pre-match snapshot.
      return this.loadOne(booking._id.toString());
    }

    return booking;
  }

  /**
   * Matching runs after the booking exists, so a matching failure must not
   * fail the request or lose the booking. It stays in searching_partner and
   * the expiry sweep will pick it up.
   */
  private async startMatchingQuietly(bookingId: string): Promise<void> {
    try {
      await this.partnerAssignmentService.startMatching(bookingId);
    } catch (error) {
      this.logger.error(
        `Booking ${bookingId} created but matching failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Scheduled bookings that dispatch should act on now.
   *
   * Two kinds, and they need different windows:
   *
   * - `pending` — never dispatched. Anything at or past its lead time counts,
   *   with no lower bound, so a booking missed while dispatch was down is
   *   still attempted rather than stranded.
   * - `no_partner_found` — dispatched and came up empty. Worth another go
   *   while the slot is still near, because partners come online; past the
   *   grace period it is left alone.
   *
   * Both queries are covered by the `{bookingType, status, scheduledAt}`
   * index. Ordered by slot so the most urgent go first, and capped so one
   * invocation cannot run past a serverless time limit.
   */
  async findDueScheduledIds(): Promise<string[]> {
    const now = Date.now();
    const dueBy = new Date(
      now + SCHEDULED_DISPATCH_LEAD_MINUTES * MS_PER_MINUTE,
    );
    const retryFrom = new Date(
      now - SCHEDULED_RETRY_GRACE_MINUTES * MS_PER_MINUTE,
    );

    const due = await this.bookingModel
      .find({
        bookingType: 'scheduled',
        $or: [
          { status: 'pending', scheduledAt: { $lte: dueBy } },
          {
            status: 'no_partner_found',
            scheduledAt: { $lte: dueBy, $gte: retryFrom },
          },
        ],
      })
      .select('_id')
      .sort({ scheduledAt: 1 })
      .limit(SCHEDULED_DISPATCH_BATCH)
      .exec();

    return due.map((booking) => booking._id.toString());
  }

  /** The customer's own bookings, newest first. */
  async findAllForCustomer(
    customerId: string,
    filter: FindBookingsFilter = {},
  ): Promise<Booking[]> {
    const query: FilterQuery<Booking> = { customerId };

    if (filter.status !== undefined) {
      query.status = filter.status;
    }

    return this.bookingModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** Ownership is part of the lookup, so another customer's booking 404s. */
  async findOneForCustomer(customerId: string, id: string): Promise<Booking> {
    return this.loadOwned(customerId, id);
  }

  /**
   * Customer-initiated cancellation. Allowed only from a status the
   * transition table says may reach `cancelled`.
   */
  async cancelForCustomer(customerId: string, id: string): Promise<Booking> {
    const booking = await this.loadOwned(customerId, id);

    if (!canTransition(booking.status, 'cancelled')) {
      throw new ConflictException(
        `A booking that is ${booking.status} cannot be cancelled`,
      );
    }

    const previousPartnerId = booking.assignedPartnerId?.toString();

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.assignedPartnerId = undefined;
    const cancelled = await booking.save();

    this.emitBookingEvent(BOOKING_EVENT.Cancelled, {
      bookingId: id,
      customerId,
      partnerId: previousPartnerId,
    });

    // An offer left open would keep a partner out of the matching pool.
    await this.partnerAssignmentService.cancelOpenOffers(id);

    return cancelled;
  }

  /**
   * The only way any caller may move a booking's status, so the transition
   * table is the single gate. partner-assignment will drive this.
   */
  async transitionTo(
    id: string,
    next: BookingStatus,
    changes: BookingTransitionChanges = {},
  ): Promise<Booking> {
    const booking = await this.loadOne(id);

    if (booking.status === next) {
      return booking;
    }

    if (!canTransition(booking.status, next)) {
      throw new ConflictException(
        `Cannot move a booking from ${booking.status} to ${next}`,
      );
    }

    // null clears the field, which is what a fallen-through offer needs.
    // `set` skips undefined, so it cannot express that on its own.
    if (changes.assignedPartnerId === null) {
      booking.assignedPartnerId = undefined;
    } else if (changes.assignedPartnerId !== undefined) {
      booking.assignedPartnerId = changes.assignedPartnerId;
    }

    booking.status = next;

    // Same stamping rule as the partner-driven transitions, so a booking
    // accepted through partner-assignment still gets its acceptedAt.
    const stamp = STATUS_TIMESTAMP_FIELD[next];
    if (stamp) {
      booking.set(stamp, new Date());
    }

    const saved = await booking.save();

    // Status landings are the domain events, so publishing here means no
    // caller has to remember to announce a transition it made.
    const event = STATUS_EVENT[next];
    if (event) {
      this.emitBookingEvent(event, {
        bookingId: id,
        customerId: saved.customerId.toString(),
        partnerId: saved.assignedPartnerId?.toString(),
      });
    }

    return saved;
  }

  /**
   * Fire-and-forget. Listeners swallow their own errors, and this never
   * awaits, so notification work cannot slow or fail a booking write.
   */
  private emitBookingEvent(event: string, payload: BookingEventPayload): void {
    this.eventEmitter.emit(event, payload);
  }

  private async loadActiveService(serviceId: string): Promise<Service> {
    const service = await this.serviceModel.findById(serviceId).exec();

    if (!service) {
      throw new BadRequestException(`Service ${serviceId} not found`);
    }
    if (!service.isActive) {
      throw new BadRequestException(`Service ${serviceId} is not available`);
    }
    return service;
  }

  /** Must exist, belong to this customer, and not be retired. */
  private async loadUsableAddress(
    customerId: string,
    addressId: string,
  ): Promise<Address> {
    const address = await this.addressModel.findById(addressId).exec();

    if (!address) {
      throw new BadRequestException(`Address ${addressId} not found`);
    }

    // Compared as strings: both sides are ObjectIds and === would be false.
    if (address.customerId.toString() !== customerId) {
      throw new BadRequestException(
        `Address ${addressId} does not belong to this customer`,
      );
    }

    if (!address.isActive) {
      throw new BadRequestException(`Address ${addressId} is no longer in use`);
    }
    return address;
  }

  private assertScheduleValid(dto: CreateBookingDto): void {
    if (dto.bookingType === 'instant') {
      if (dto.scheduledAt !== undefined) {
        throw new BadRequestException(
          'scheduledAt is not allowed on an instant booking',
        );
      }
      return;
    }

    if (dto.scheduledAt === undefined) {
      throw new BadRequestException(
        'scheduledAt is required for a scheduled booking',
      );
    }

    const earliest = Date.now() + MIN_SCHEDULE_LEAD_MINUTES * MS_PER_MINUTE;
    const latest =
      Date.now() + MAX_SCHEDULE_HORIZON_DAYS * 24 * 60 * MS_PER_MINUTE;

    if (dto.scheduledAt.getTime() < earliest) {
      throw new BadRequestException(
        `scheduledAt must be at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes from now`,
      );
    }
    if (dto.scheduledAt.getTime() > latest) {
      throw new BadRequestException(
        `scheduledAt cannot be more than ${MAX_SCHEDULE_HORIZON_DAYS} days from now`,
      );
    }
  }

  /**
   * A customer cannot be in two places at once.
   *
   * An instant booking conflicts with any active booking. A scheduled one
   * conflicts with another active scheduled booking close enough in time to
   * overlap, where "close enough" is the service's own estimated duration.
   */
  private async assertNoConflictingBooking(
    customerId: string,
    dto: CreateBookingDto,
    service: Service,
  ): Promise<void> {
    const active = { $in: ACTIVE_BOOKING_STATUSES };

    if (dto.bookingType === 'instant') {
      const existing = await this.bookingModel
        .exists({ customerId, status: active })
        .exec();

      if (existing) {
        throw new ConflictException(
          'You already have a booking in progress. Finish or cancel it first.',
        );
      }
      return;
    }

    const slotMinutes =
      service.estimatedDurationMinutes ?? DEFAULT_SLOT_MINUTES;
    const scheduledAt = dto.scheduledAt as Date;
    const window = slotMinutes * MS_PER_MINUTE;

    const clash = await this.bookingModel
      .exists({
        customerId,
        status: active,
        bookingType: 'scheduled',
        scheduledAt: {
          $gt: new Date(scheduledAt.getTime() - window),
          $lt: new Date(scheduledAt.getTime() + window),
        },
      })
      .exec();

    if (clash) {
      throw new ConflictException(
        'You already have a booking around that time',
      );
    }
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel.exists({ _id: customerId }).exec();

    if (!exists) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
  }

  private async loadOwned(
    customerId: string,
    id: string,
  ): Promise<BookingDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Booking ${id} not found`);
    }

    const booking = await this.bookingModel
      .findOne({ _id: id, customerId })
      .exec();

    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  private async loadOne(id: string): Promise<BookingDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Booking ${id} not found`);
    }

    const booking = await this.bookingModel.findById(id).exec();

    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }
}
