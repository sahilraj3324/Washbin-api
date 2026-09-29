import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { USER_TYPES } from '../../common/user-principal';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { UserType } from '../../common/user-principal';
import { Booking } from '../../bookings/schemas/booking.schema';

@Schema({
  // The model has no updatedAt: a notification is written once and only ever
  // flips isRead.
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'notifications',
})
export class Notification {
  /**
   * A customer or a partner id. Left unreferenced because the target
   * collection depends on userType, so there is no single `ref` to populate.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: USER_TYPES, required: true })
  userType!: UserType;

  /** e.g. PARTNER_ACCEPTED. Also sent to the app in the FCM data payload. */
  @Prop({ required: true, trim: true })
  type!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  body!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Booking.name })
  bookingId?: Types.ObjectId;

  /** FCM data values must be strings, so this map is string -> string. */
  @Prop({ type: Object })
  data?: Record<string, string>;

  @Prop({ default: false })
  isRead!: boolean;

  createdAt!: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

// The inbox, newest first.
NotificationSchema.index({ userId: 1, userType: 1, createdAt: -1 });

// The unread badge count and the unread filter.
NotificationSchema.index({ userId: 1, userType: 1, isRead: 1 });
