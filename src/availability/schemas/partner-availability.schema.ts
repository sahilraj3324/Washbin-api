import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { GeoPoint, GeoPointSchema } from '../../common/geo-point.schema';
import { Partner } from '../../partners/partner.schema';

/**
 * Answers "can this partner take work right now?". What a partner is *able*
 * to do lives in partner-services; this is only the live state.
 *
 * The two flags read together:
 *   isOnline false                    -> never considered, whatever isAvailable says
 *   isOnline true,  isAvailable false -> online but busy
 *   isOnline true,  isAvailable true  -> can receive requests
 */
@Schema({ timestamps: true, collection: 'partner_availability' })
export class PartnerAvailability {
  /** One row per partner; see the unique index below. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Partner.name,
    required: true,
  })
  partnerId!: Types.ObjectId;

  /** The partner's own on/off switch. */
  @Prop({ default: false, index: true })
  isOnline!: boolean;

  /** Free to take a job, as opposed to mid-booking. */
  @Prop({ default: false, index: true })
  isAvailable!: boolean;

  /**
   * Last reported position. Left unset until the partner reports one, so the
   * 2dsphere index simply skips partners with no known location.
   */
  @Prop({ type: GeoPointSchema })
  currentLocation?: GeoPoint;

  /** How far the partner will travel from currentLocation for a job. */
  @Prop({ min: 0 })
  serviceRadiusKm?: number;

  /** Optional shift window; outside it the partner is not bookable. */
  @Prop()
  availableFrom?: Date;

  @Prop()
  availableUntil?: Date;

  /** Lets assignment discount a position that is too old to trust. */
  @Prop()
  lastLocationUpdatedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PartnerAvailabilityDocument = HydratedDocument<PartnerAvailability>;
export const PartnerAvailabilitySchema =
  SchemaFactory.createForClass(PartnerAvailability);

// One availability row per partner - the row is the partner's live state, not
// a history of it.
PartnerAvailabilitySchema.index(
  { partnerId: 1 },
  { unique: true, name: 'one_row_per_partner' },
);

// Nearest-partner queries for partner-assignment.
PartnerAvailabilitySchema.index({ currentLocation: '2dsphere' });

// Narrows to bookable partners before the geo stage does any work.
PartnerAvailabilitySchema.index({ isOnline: 1, isAvailable: 1 });
