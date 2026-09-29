import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  FilterQuery,
  isValidObjectId,
  Model,
  PipelineStage,
  Types,
} from 'mongoose';
import { toGeoPoint } from '../common/geo-point.schema';
import { PartnerService } from '../partner-services/schemas/partner-service.schema';
import {
  Partner,
  PartnerStatus,
  VerificationStatus,
} from '../partners/partner.schema';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import {
  PartnerAvailability,
  PartnerAvailabilityDocument,
} from './schemas/partner-availability.schema';

const METRES_PER_KM = 1000;
const MS_PER_MINUTE = 60_000;

export interface FindAvailableNearOptions {
  latitude: number;
  longitude: number;
  /** Caps the search. Each partner's own serviceRadiusKm still applies. */
  maxDistanceKm?: number;
  /** Ignores positions older than this, when given. */
  maxLocationAgeMinutes?: number;
  /** Restricts to these partners, e.g. the ones offering a given service. */
  partnerIds?: Types.ObjectId[];
  limit?: number;
}

export interface AvailablePartner {
  partnerId: Types.ObjectId;
  distanceKm: number;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(PartnerAvailability.name)
    private readonly availabilityModel: Model<PartnerAvailability>,
    @InjectModel(Partner.name)
    private readonly partnerModel: Model<Partner>,
    @InjectModel(PartnerService.name)
    private readonly partnerServiceModel: Model<PartnerService>,
  ) {}

  /**
   * Reads a partner's own state, creating the row on first look so the app
   * never has to handle "not set up yet". A fresh row is offline.
   */
  async findForPartner(partnerId: string): Promise<PartnerAvailability> {
    await this.assertPartnerExists(partnerId);

    return this.availabilityModel
      .findOneAndUpdate(
        { partnerId },
        { $setOnInsert: { isOnline: false, isAvailable: false } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  /** Applies the flag rules, then saves. */
  async updateForPartner(
    partnerId: string,
    dto: UpdateAvailabilityDto,
  ): Promise<PartnerAvailability> {
    const availability = await this.loadForPartner(partnerId);

    const isOnline = dto.isOnline ?? availability.isOnline;
    let isAvailable = dto.isAvailable ?? availability.isAvailable;
    const hasLocationUpdate =
      dto.latitude !== undefined || dto.longitude !== undefined;

    if (hasLocationUpdate) {
      if (dto.latitude === undefined || dto.longitude === undefined) {
        throw new BadRequestException(
          'latitude and longitude must be sent together',
        );
      }
      availability.currentLocation = toGeoPoint(dto.latitude, dto.longitude);
      availability.lastLocationUpdatedAt = new Date();
    }

    // Rejected rather than silently ignored: a partner asking to take work
    // while offline has a stale UI, and quietly storing false would hide it.
    if (!isOnline && dto.isAvailable === true) {
      throw new BadRequestException(
        'Go online before marking yourself available',
      );
    }

    // Offline is offline. Storing isAvailable:true behind isOnline:false
    // would leave a row that reads as bookable to anyone who checks one flag.
    if (!isOnline) {
      isAvailable = false;
    }

    if (isOnline) {
      await this.assertCanGoOnline(partnerId);

      if (!availability.currentLocation) {
        throw new BadRequestException(
          'Current location is required before going online',
        );
      }
    }

    const from = dto.availableFrom ?? availability.availableFrom;
    const until = dto.availableUntil ?? availability.availableUntil;

    if (from && until && until.getTime() <= from.getTime()) {
      throw new BadRequestException(
        'availableUntil must be after availableFrom',
      );
    }

    availability.set({
      ...dto,
      latitude: undefined,
      longitude: undefined,
      isOnline,
      isAvailable,
    });
    return availability.save();
  }

  /** Stores the reported position and stamps when it arrived. */
  async updateLocationForPartner(
    partnerId: string,
    dto: UpdateLocationDto,
  ): Promise<PartnerAvailability> {
    const availability = await this.loadForPartner(partnerId);

    availability.currentLocation = toGeoPoint(dto.latitude, dto.longitude);
    availability.lastLocationUpdatedAt = new Date();

    return availability.save();
  }

  /**
   * Atomically reserves the partner after they accept an offer. The caller
   * should only do this after validating the offer still belongs to them.
   */
  async markBusyForAcceptedJob(partnerId: string): Promise<void> {
    if (!isValidObjectId(partnerId)) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }

    const updated = await this.availabilityModel
      .findOneAndUpdate(
        {
          partnerId,
          isOnline: true,
          isAvailable: true,
        },
        { isAvailable: false },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        'You must be online and available to accept this job',
      );
    }
  }

  async restoreAvailableAfterFailedAcceptance(
    partnerId: string,
  ): Promise<void> {
    if (!isValidObjectId(partnerId)) {
      return;
    }

    await this.availabilityModel
      .updateOne(
        { partnerId, isOnline: true, isAvailable: false },
        { isAvailable: true },
      )
      .exec();
  }

  async markAvailableAfterCompletedJob(partnerId: string): Promise<void> {
    if (!isValidObjectId(partnerId)) {
      return;
    }

    await this.availabilityModel
      .updateOne({ partnerId, isOnline: true }, { isAvailable: true })
      .exec();
  }

  /**
   * Nearest bookable partners to a point, for partner-assignment.
   *
   * Both radii apply: `maxDistanceKm` caps how far the search looks, and each
   * partner's own `serviceRadiusKm` caps how far they agreed to travel. A
   * partner with no radius set is treated as unbounded.
   */
  async findAvailableNear(
    options: FindAvailableNearOptions,
  ): Promise<AvailablePartner[]> {
    const query: FilterQuery<PartnerAvailability> = {
      // Both flags, always. This is the rule the whole model rests on.
      isOnline: true,
      isAvailable: true,
    };

    if (options.partnerIds?.length) {
      query.partnerId = { $in: options.partnerIds };
    }

    if (options.maxLocationAgeMinutes !== undefined) {
      query.lastLocationUpdatedAt = {
        $gte: new Date(
          Date.now() - options.maxLocationAgeMinutes * MS_PER_MINUTE,
        ),
      };
    }

    const now = new Date();
    // An unset window means "no window", not "closed".
    query.$and = [
      { $or: [{ availableFrom: null }, { availableFrom: { $lte: now } }] },
      { $or: [{ availableUntil: null }, { availableUntil: { $gte: now } }] },
    ];

    const geoNear: PipelineStage.GeoNear['$geoNear'] = {
      near: {
        type: 'Point',
        coordinates: [options.longitude, options.latitude],
      },
      distanceField: 'distanceMetres',
      spherical: true,
      query,
    };

    if (options.maxDistanceKm !== undefined) {
      geoNear.maxDistance = options.maxDistanceKm * METRES_PER_KM;
    }

    const stages: PipelineStage[] = [
      { $geoNear: geoNear },
      {
        // $expr so the comparison can read each row's own serviceRadiusKm.
        $match: {
          $expr: {
            $or: [
              { $eq: [{ $ifNull: ['$serviceRadiusKm', null] }, null] },
              {
                $lte: [
                  '$distanceMetres',
                  { $multiply: ['$serviceRadiusKm', METRES_PER_KM] },
                ],
              },
            ],
          },
        },
      },
      { $limit: options.limit ?? 20 },
      { $project: { _id: 0, partnerId: 1, distanceMetres: 1 } },
    ];

    const rows = await this.availabilityModel
      .aggregate<{ partnerId: Types.ObjectId; distanceMetres: number }>(stages)
      .exec();

    return rows.map((row) => ({
      partnerId: row.partnerId,
      distanceKm: row.distanceMetres / METRES_PER_KM,
    }));
  }

  /** Admin view: every partner's live state, newest activity first. */
  async findAll(
    filter: {
      isOnline?: boolean;
      isAvailable?: boolean;
    } = {},
  ): Promise<PartnerAvailability[]> {
    const query: FilterQuery<PartnerAvailability> = {};

    if (filter.isOnline !== undefined) {
      query.isOnline = filter.isOnline;
    }
    if (filter.isAvailable !== undefined) {
      query.isAvailable = filter.isAvailable;
    }

    return this.availabilityModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findOneByPartner(partnerId: string): Promise<PartnerAvailability> {
    return this.loadForPartner(partnerId);
  }

  private async loadForPartner(
    partnerId: string,
  ): Promise<PartnerAvailabilityDocument> {
    if (!isValidObjectId(partnerId)) {
      throw new NotFoundException(
        `Availability for partner ${partnerId} not found`,
      );
    }

    const existing = await this.availabilityModel.findOne({ partnerId }).exec();

    if (existing) {
      return existing;
    }

    await this.assertPartnerExists(partnerId);
    return this.availabilityModel.create({ partnerId });
  }

  private async assertPartnerExists(partnerId: string): Promise<void> {
    if (!isValidObjectId(partnerId)) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }

    const exists = await this.partnerModel.exists({ _id: partnerId }).exec();

    if (!exists) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }
  }

  private async assertCanGoOnline(partnerId: string): Promise<void> {
    if (!isValidObjectId(partnerId)) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }

    const partner = await this.partnerModel.findById(partnerId).exec();

    if (!partner) {
      throw new NotFoundException(`Partner ${partnerId} not found`);
    }
    if (partner.status !== PartnerStatus.Active) {
      throw new ForbiddenException('Only active partners can go online');
    }
    if (partner.verificationStatus !== VerificationStatus.Verified) {
      throw new ForbiddenException('Only approved partners can go online');
    }

    const hasActiveService = await this.partnerServiceModel
      .exists({ partnerId, isActive: true })
      .exec();

    if (!hasActiveService) {
      throw new BadRequestException(
        'Choose at least one active service before going online',
      );
    }
  }
}
