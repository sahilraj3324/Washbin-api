import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Address } from '../../addresses/schemas/address.schema';
import { Customer } from '../../customers/customer.schema';
import { Partner } from '../../partners/partner.schema';
import { Service } from '../../services/schemas/service.schema';
import { BOOKING_STATUSES, BOOKING_TYPES } from '../booking-status';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { BookingStatus, BookingType } from '../booking-status';

/**
 * Where the work is, copied at booking time. The customer may later edit or
 * delete the saved address; the historical booking must still say where the
 * partner actually went.
 */
@Schema({ _id: false })
export class AddressSnapshot {
  @Prop({ required: true, trim: true })
  fullAddress!: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  state!: string;

  @Prop({ required: true, trim: true })
  pincode!: string;

  @Prop({ required: true })
  latitude!: number;

  @Prop({ required: true })
  longitude!: number;
}

export const AddressSnapshotSchema =
  SchemaFactory.createForClass(AddressSnapshot);

@Schema({ _id: false })
export class BookingPrice {
  /** The service's basePrice at booking time, not read live. */
  @Prop({ required: true, min: 0 })
  baseAmount!: number;

  /**
   * What is actually owed. Set at creation only for `fixed` pricing; hourly
   * and starting_from services are settled once the work is done.
   */
  @Prop({ min: 0 })
  finalAmount?: number;

  @Prop({ required: true, trim: true })
  currency!: string;
}

export const BookingPriceSchema = SchemaFactory.createForClass(BookingPrice);

@Schema({ timestamps: true, collection: 'bookings' })
export class Booking {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Customer.name,
    required: true,
  })
  customerId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Service.name,
    required: true,
  })
  serviceId!: Types.ObjectId;

  /** Kept alongside the snapshot so a live address can still be re-read. */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Address.name,
    required: true,
  })
  addressId!: Types.ObjectId;

  @Prop({ type: AddressSnapshotSchema, required: true })
  addressSnapshot!: AddressSnapshot;

  @Prop({ type: String, enum: BOOKING_TYPES, required: true })
  bookingType!: BookingType;

  /** Required for scheduled bookings, absent for instant ones. */
  @Prop()
  scheduledAt?: Date;

  @Prop({
    type: String,
    enum: BOOKING_STATUSES,
    required: true,
    index: true,
  })
  status!: BookingStatus;

  /** Written by partner-assignment, not by the customer. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Partner.name })
  assignedPartnerId?: Types.ObjectId;

  @Prop({ type: BookingPriceSchema })
  price?: BookingPrice;

  /** Free text from the customer, e.g. gate code or "call on arrival". */
  @Prop({ trim: true })
  notes?: string;

  // Lifecycle stamps, written by the transition that reaches each status.
  // Together they give response time, travel time, service duration and the
  // customer's total wait without reconstructing anything from logs.

  @Prop()
  acceptedAt?: Date;

  @Prop()
  onTheWayAt?: Date;

  @Prop()
  arrivedAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  /**
   * Shown to the customer once the partner marks arrival, and quoted back by
   * the partner to start the service. Proof the partner actually reached the
   * address.
   *
   * Stored in the clear because the customer's app has to display it; it is
   * stripped from every partner-facing response, and expires.
   */
  @Prop()
  serviceStartOtp?: string;

  @Prop()
  serviceStartOtpExpiresAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type BookingDocument = HydratedDocument<Booking>;
export const BookingSchema = SchemaFactory.createForClass(Booking);

// The customer's booking list.
BookingSchema.index({ customerId: 1, createdAt: -1 });

// The conflict check: this customer's active bookings around a given time.
BookingSchema.index({ customerId: 1, status: 1, scheduledAt: 1 });

// The assignment engine's queue, and a partner's own job list.
BookingSchema.index({ status: 1, createdAt: 1 });
BookingSchema.index({ assignedPartnerId: 1, status: 1 });

// Dispatch waking scheduled bookings when their time comes.
BookingSchema.index({ bookingType: 1, status: 1, scheduledAt: 1 });
