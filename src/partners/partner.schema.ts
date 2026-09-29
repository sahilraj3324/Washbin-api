import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum PartnerStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended',
}

export enum VerificationStatus {
  Pending = 'pending',
  Submitted = 'submitted',
  Verified = 'verified',
  Rejected = 'rejected',
}

@Schema({ _id: false })
export class PartnerDocumentFile {
  /** e.g. 'gst', 'pan', 'licence', 'id-proof'. */
  @Prop({ required: true, trim: true })
  type!: string;

  @Prop({ required: true, trim: true })
  url!: string;

  @Prop({ default: Date.now })
  uploadedAt!: Date;

  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.Pending,
  })
  status!: VerificationStatus;
}

export const PartnerDocumentFileSchema =
  SchemaFactory.createForClass(PartnerDocumentFile);

/**
 * Kept as a const tuple so Mongoose and class-validator have the values at
 * runtime while `Gender` stays a plain union for callers — the same shape as
 * PRICING_TYPES on Service.
 */
export const GENDERS = [
  'male',
  'female',
  'other',
  'prefer_not_to_say',
] as const;

export type Gender = (typeof GENDERS)[number];

/** Where the partner is based. Not a service area — see ServiceArea below. */
@Schema({ _id: false })
export class PartnerAddress {
  @Prop({ required: true, trim: true })
  line1!: string;

  @Prop({ trim: true })
  line2?: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  state!: string;

  /** Six digits, as Indian pincodes are. */
  @Prop({ required: true, trim: true, match: /^[1-9][0-9]{5}$/ })
  pincode!: string;
}

export const PartnerAddressSchema =
  SchemaFactory.createForClass(PartnerAddress);

/** Who Washbin calls if something happens on a job. Optional. */
@Schema({ _id: false })
export class EmergencyContact {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  phone!: string;

  @Prop({ trim: true })
  relationship?: string;
}

export const EmergencyContactSchema =
  SchemaFactory.createForClass(EmergencyContact);

@Schema({ _id: false })
export class ServiceArea {
  @Prop({ type: [String], default: [] })
  cities!: string[];

  @Prop({ type: [String], default: [] })
  pincodes!: string[];

  @Prop({ min: 0 })
  radiusKm?: number;
}

export const ServiceAreaSchema = SchemaFactory.createForClass(ServiceArea);

@Schema({ timestamps: true, collection: 'partners' })
export class Partner {
  /** Firebase Auth uid, set when the phone number is first verified. */
  @Prop({ required: true, unique: true, index: true, trim: true })
  authUserId!: string;

  @Prop({ required: true, trim: true })
  businessName!: string;

  @Prop({ required: true, trim: true })
  ownerName!: string;

  /**
   * E.164 phone number Firebase verified by OTP. This is the account
   * identity — a partner signs in with it and nothing else.
   */
  @Prop({ required: true, unique: true, index: true, trim: true })
  phone!: string;

  /** Optional: partners sign in by phone, so this is contact detail only. */
  @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
  email?: string;

  /** References into the services collection. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Service' }], default: [] })
  services!: Types.ObjectId[];

  /** Avatar URL. The app displays one; uploading is not built yet. */
  @Prop({ trim: true })
  profileImage?: string;

  @Prop({ type: String, enum: GENDERS })
  gender?: Gender;

  /** Whole years in the trade. Zero is meaningful — everyone starts there. */
  @Prop({ min: 0, max: 70 })
  experienceYears?: number;

  @Prop({ type: PartnerAddressSchema })
  address?: PartnerAddress;

  @Prop({ type: EmergencyContactSchema })
  emergencyContact?: EmergencyContact;

  @Prop({ type: [PartnerDocumentFileSchema], default: [] })
  documents!: PartnerDocumentFile[];

  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.Pending,
    index: true,
  })
  verificationStatus!: VerificationStatus;

  /**
   * Why the last review was refused, for the app to show the partner. Set by
   * whoever rejects; cleared when they resubmit.
   */
  @Prop({ trim: true })
  rejectionReason?: string;

  /** When the partner last put themselves forward for review. */
  @Prop()
  submittedAt?: Date;

  @Prop({ type: ServiceAreaSchema, default: () => ({}) })
  serviceArea!: ServiceArea;

  @Prop({ default: 0, min: 0, max: 5 })
  rating!: number;

  @Prop({ type: String, enum: PartnerStatus, default: PartnerStatus.Active })
  status!: PartnerStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PartnerDocument = HydratedDocument<Partner>;
export const PartnerSchema = SchemaFactory.createForClass(Partner);
