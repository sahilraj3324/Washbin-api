import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AvailabilityService } from '../availability/availability.service';
import { PARTNER_ENGAGED_STATUSES } from '../bookings/booking-status';
import { Booking, BookingDocument } from '../bookings/schemas/booking.schema';
import { PartnerService } from '../partner-services/schemas/partner-service.schema';
import {
  Partner,
  PartnerStatus,
  VerificationStatus,
} from '../partners/partner.schema';
import { OPEN_ASSIGNMENT_STATUS } from './assignment-status';
import { PartnerAssignment } from './schemas/partner-assignment.schema';

/** How far out to look for a partner unless the caller says otherwise. */
export const DEFAULT_MAX_MATCH_DISTANCE_KM = 15;
/** A position older than this is not trusted for matching. */
export const DEFAULT_MAX_LOCATION_AGE_MINUTES = 15;
/** Ranked candidates returned per pass; the offer only uses the first. */
export const DEFAULT_CANDIDATE_LIMIT = 20;

export interface MatchCandidate {
  partnerId: Types.ObjectId;
  distanceKm: number;
}

export interface FindCandidatesOptions {
  maxDistanceKm?: number;
  maxLocationAgeMinutes?: number;
  limit?: number;
}

/**
 * Works out who could take a booking, ranked nearest first. Pure selection:
 * it makes no offers and writes nothing.
 *
 * The funnel, narrowing cheaply before the geo stage runs:
 *   provides the service -> account active/approved -> not already engaged
 *   -> no live offer elsewhere -> not already offered this booking
 *   -> online, available, in range (AvailabilityService)
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectModel(PartnerService.name)
    private readonly partnerServiceModel: Model<PartnerService>,
    @InjectModel(Partner.name)
    private readonly partnerModel: Model<Partner>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(PartnerAssignment.name)
    private readonly assignmentModel: Model<PartnerAssignment>,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async findCandidates(
    booking: BookingDocument,
    options: FindCandidatesOptions = {},
  ): Promise<MatchCandidate[]> {
    // 1. Partners who offer this service. The partner_services collection is
    //    the source of truth, not the legacy Partner.services array.
    const offering = await this.partnerServiceModel
      .distinct('partnerId', {
        serviceId: booking.serviceId,
        isActive: true,
      })
      .exec();

    if (!offering.length) {
      return [];
    }

    // 2. Only live, approved accounts.
    // distinct('_id') comes back untyped, unlike the ref paths above.
    const approved = (await this.partnerModel
      .distinct('_id', {
        _id: { $in: offering },
        status: PartnerStatus.Active,
        verificationStatus: VerificationStatus.Verified,
      })
      .exec()) as Types.ObjectId[];

    if (!approved.length) {
      return [];
    }

    const excluded = await this.collectExcluded(booking, approved);
    const eligible = approved.filter((id) => !excluded.has(id.toString()));

    if (!eligible.length) {
      return [];
    }

    // 3. Online, available, inside both radii, inside the shift window, with
    //    a fresh enough position - and sorted nearest first.
    const nearby = await this.availabilityService.findAvailableNear({
      latitude: booking.addressSnapshot.latitude,
      longitude: booking.addressSnapshot.longitude,
      maxDistanceKm: options.maxDistanceKm ?? DEFAULT_MAX_MATCH_DISTANCE_KM,
      maxLocationAgeMinutes:
        options.maxLocationAgeMinutes ?? DEFAULT_MAX_LOCATION_AGE_MINUTES,
      partnerIds: eligible,
      limit: options.limit ?? DEFAULT_CANDIDATE_LIMIT,
    });

    this.logger.debug(
      `Booking ${booking._id.toString()}: ${offering.length} offer the service, ` +
        `${eligible.length} eligible, ${nearby.length} in range`,
    );

    return nearby.map((row) => ({
      partnerId: row.partnerId,
      distanceKm: row.distanceKm,
    }));
  }

  /**
   * Partner ids to skip: already committed to a job, holding a live offer for
   * some other booking, or already offered this one.
   */
  private async collectExcluded(
    booking: BookingDocument,
    candidates: Types.ObjectId[],
  ): Promise<Set<string>> {
    const bookingId = booking._id;

    const [engaged, otherOffers, alreadyOffered] = await Promise.all([
      this.bookingModel
        .distinct('assignedPartnerId', {
          assignedPartnerId: { $in: candidates },
          status: { $in: PARTNER_ENGAGED_STATUSES },
        })
        .exec(),
      this.assignmentModel
        .distinct('partnerId', {
          partnerId: { $in: candidates },
          status: OPEN_ASSIGNMENT_STATUS,
          bookingId: { $ne: bookingId },
          expiresAt: { $gt: new Date() },
        })
        .exec(),
      // Any prior row for this booking, whatever its outcome: a partner who
      // rejected or let it expire does not get asked again.
      this.assignmentModel.distinct('partnerId', { bookingId }).exec(),
    ]);

    return new Set(
      [...engaged, ...otherOffers, ...alreadyOffered].map(
        (id: Types.ObjectId) => id.toString(),
      ),
    );
  }
}
