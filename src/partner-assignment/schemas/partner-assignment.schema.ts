import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Booking } from '../../bookings/schemas/booking.schema';
import { Partner } from '../../partners/partner.schema';
import { ASSIGNMENT_STATUSES } from '../assignment-status';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { AssignmentStatus } from '../assignment-status';

/** One offer of one booking to one partner. */
@Schema({ timestamps: true, collection: 'partner_assignments' })
export class PartnerAssignment {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Booking.name,
    required: true,
  })
  bookingId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Partner.name,
    required: true,
  })
  partnerId!: Types.ObjectId;

  @Prop({ type: String, enum: ASSIGNMENT_STATUSES, required: true })
  status!: AssignmentStatus;

  @Prop({ required: true })
  offeredAt!: Date;

  /** After this the offer is dead, whether or not anything swept it. */
  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  respondedAt?: Date;

  /** Distance at offer time, kept for ranking audits and payouts. */
  @Prop({ min: 0 })
  distanceKm?: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PartnerAssignmentDocument = HydratedDocument<PartnerAssignment>;
export const PartnerAssignmentSchema =
  SchemaFactory.createForClass(PartnerAssignment);

// A partner is offered a given booking at most once, so a fallen-through
// offer is never re-sent to the same partner.
PartnerAssignmentSchema.index(
  { bookingId: 1, partnerId: 1 },
  { unique: true, name: 'one_offer_per_booking_partner' },
);

// At most one live offer per booking: the offers are sequential, and this is
// what stops two concurrent startMatching calls double-offering.
PartnerAssignmentSchema.index(
  { bookingId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'offered' },
    name: 'one_open_offer_per_booking',
  },
);

// The partner's own inbox, and the expiry sweep.
PartnerAssignmentSchema.index({ partnerId: 1, status: 1, expiresAt: 1 });
PartnerAssignmentSchema.index({ status: 1, expiresAt: 1 });
