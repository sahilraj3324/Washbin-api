import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Category } from '../../categories/schemas/category.schema';

/**
 * How basePrice should be read:
 * - `fixed`         - basePrice is the whole job.
 * - `hourly`        - basePrice is charged per hour of work.
 * - `starting_from` - basePrice is a floor; the final price is quoted later.
 *
 * Kept as a const tuple so Mongoose and class-validator have the values at
 * runtime while `PricingType` stays a plain union for callers.
 */
export const PRICING_TYPES = ['fixed', 'hourly', 'starting_from'] as const;

export type PricingType = (typeof PRICING_TYPES)[number];

@Schema({ timestamps: true, collection: 'services' })
export class Service {
  /** Category this service is listed under. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Category.name,
    required: true,
    index: true,
  })
  categoryId!: Types.ObjectId;

  /** Display name, e.g. "Deep Cleaning". */
  @Prop({ required: true, trim: true })
  name!: string;

  /**
   * URL/lookup key derived from the name when the client does not send one.
   * Lowercased so a service resolves the same however the app cases it.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  slug!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  /** Banner or thumbnail for the service detail screen. */
  @Prop({ trim: true })
  imageUrl?: string;

  /** Icon shown in the service list. */
  @Prop({ trim: true })
  iconUrl?: string;

  /** How basePrice should be read at booking time. */
  @Prop({ type: String, enum: PRICING_TYPES, required: true })
  pricingType!: PricingType;

  /** Price in rupees, interpreted according to pricingType. */
  @Prop({ required: true, min: 0 })
  basePrice!: number;

  /** Shown to the customer and used to size the booking slot. */
  @Prop({ min: 1 })
  estimatedDurationMinutes?: number;

  /** Hidden from customer-facing listings when false. */
  @Prop({ default: true, index: true })
  isActive!: boolean;

  /** Ascending display order within the category; ties fall back to name. */
  @Prop({ default: 0, index: true })
  sortOrder!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ServiceDocument = HydratedDocument<Service>;
export const ServiceSchema = SchemaFactory.createForClass(Service);

// The category screen lists active services in display order.
ServiceSchema.index({ categoryId: 1, isActive: 1, sortOrder: 1 });
