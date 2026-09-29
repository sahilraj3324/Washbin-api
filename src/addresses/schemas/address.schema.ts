import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  GeoPoint,
  GeoPointSchema,
  toGeoPoint,
} from '../../common/geo-point.schema';
import { Customer } from '../../customers/customer.schema';

/**
 * Kept as a const tuple so Mongoose and class-validator have the values at
 * runtime while `AddressLabel` stays a plain union for callers.
 */
export const ADDRESS_LABELS = ['home', 'work', 'other'] as const;

export type AddressLabel = (typeof ADDRESS_LABELS)[number];

@Schema({ timestamps: true, collection: 'addresses' })
export class Address {
  /** Customer this address belongs to. */
  // No `index: true` here: the compound index below already covers
  // customerId-prefixed lookups, and a second { customerId: 1 } index would
  // collide by name with the partial unique index.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Customer.name,
    required: true,
  })
  customerId!: Types.ObjectId;

  @Prop({ type: String, enum: ADDRESS_LABELS, required: true })
  label!: AddressLabel;

  /** The whole address as one string, usually from the place picker. */
  @Prop({ required: true, trim: true })
  fullAddress!: string;

  /** Flat or house number, which map results routinely miss. */
  @Prop({ trim: true })
  houseNumber?: string;

  @Prop({ trim: true })
  landmark?: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  state!: string;

  @Prop({ required: true, trim: true })
  pincode!: string;

  @Prop({ required: true, min: -90, max: 90 })
  latitude!: number;

  @Prop({ required: true, min: -180, max: 180 })
  longitude!: number;

  /**
   * Derived from latitude/longitude by the hook below. Stored separately
   * because $near and $geoWithin cannot read two scalar fields, and partner
   * matching by distance needs them.
   */
  @Prop({ type: GeoPointSchema })
  location!: GeoPoint;

  /** At most one per customer; see the partial unique index below. */
  @Prop({ default: false })
  isDefault!: boolean;

  /**
   * Lets a customer retire an address without deleting it, so bookings that
   * reference it keep resolving. Booking creation rejects an inactive one.
   */
  @Prop({ default: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AddressDocument = HydratedDocument<Address>;
export const AddressSchema = SchemaFactory.createForClass(Address);

// Runs on create and on save, so no write path can leave location stale.
// Service code updates addresses through a loaded document for this reason.
AddressSchema.pre('validate', function (next) {
  if (
    this.isModified('latitude') ||
    this.isModified('longitude') ||
    !this.location
  ) {
    this.location = toGeoPoint(this.latitude, this.longitude);
  }
  next();
});

// Radius queries for serviceability and partner matching.
AddressSchema.index({ location: '2dsphere' });

// Enforces "one default per customer" in the database rather than trusting
// every write path to keep it true. Only rows with isDefault:true collide.
AddressSchema.index(
  { customerId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    // Named explicitly: an auto-generated "customerId_1" would clash with any
    // other index on the same key.
    name: 'one_default_per_customer',
  },
);

// The address book lists a customer's addresses newest first.
AddressSchema.index({ customerId: 1, createdAt: -1 });
