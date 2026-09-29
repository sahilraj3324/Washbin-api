import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { USER_TYPES } from '../../common/user-principal';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { UserType } from '../../common/user-principal';

export const DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/**
 * One FCM token per device. Kept in its own collection rather than on the
 * profile because a user signs in on several devices, and a single field
 * would silently drop every device but the last one to register.
 */
@Schema({ timestamps: true, collection: 'device_tokens' })
export class DeviceToken {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: USER_TYPES, required: true })
  userType!: UserType;

  /** The FCM registration token. Globally unique: it identifies a device. */
  @Prop({ required: true, unique: true, trim: true })
  token!: string;

  @Prop({ type: String, enum: DEVICE_PLATFORMS, required: true })
  platform!: DevicePlatform;

  /** Cleared when the device signs out or FCM reports the token as dead. */
  @Prop({ default: true })
  isActive!: boolean;

  /** Last time a push was actually delivered to this device. */
  @Prop()
  lastUsedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type DeviceTokenDocument = HydratedDocument<DeviceToken>;
export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);

// Fetching a user's live devices when a push goes out.
DeviceTokenSchema.index({ userId: 1, userType: 1, isActive: 1 });
