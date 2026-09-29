import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum CustomerStatus {
  Active = 'active',
  Inactive = 'inactive',
  Blocked = 'blocked',
}

@Schema({ _id: false })
export class CustomerAddress {
  @Prop({ trim: true })
  label?: string;

  @Prop({ required: true, trim: true })
  line1!: string;

  @Prop({ trim: true })
  line2?: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ trim: true })
  state?: string;

  @Prop({ required: true, trim: true })
  pincode!: string;

  @Prop({ default: false })
  isDefault!: boolean;
}

export const CustomerAddressSchema =
  SchemaFactory.createForClass(CustomerAddress);

@Schema({ timestamps: true, collection: 'customers' })
export class Customer {
  /** Firebase Auth uid, set when the phone number is first verified. */
  @Prop({ required: true, unique: true, index: true, trim: true })
  authUserId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /**
   * E.164 phone number Firebase verified by OTP. This is the account
   * identity — a customer signs in with it and nothing else.
   */
  @Prop({ required: true, unique: true, index: true, trim: true })
  phone!: string;

  /** Optional: customers sign in by phone, so this is profile data only. */
  @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  profileImage?: string;

  @Prop({ type: [CustomerAddressSchema], default: [] })
  addresses!: CustomerAddress[];

  @Prop({ type: String, enum: CustomerStatus, default: CustomerStatus.Active })
  status!: CustomerStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
