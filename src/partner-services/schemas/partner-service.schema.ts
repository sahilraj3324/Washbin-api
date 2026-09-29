import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Partner } from '../../partners/partner.schema';
import { Service } from '../../services/schemas/service.schema';

/** Join row: one service a partner has opted in to deliver. */
@Schema({ timestamps: true, collection: 'partner_services' })
export class PartnerService {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Partner.name,
    required: true,
    index: true,
  })
  partnerId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Service.name,
    required: true,
    index: true,
  })
  serviceId!: Types.ObjectId;

  /**
   * Lets a partner pause a service without losing the row, so assignment
   * skips them while the offering stays on their profile.
   */
  @Prop({ default: true, index: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PartnerServiceDocument = HydratedDocument<PartnerService>;
export const PartnerServiceSchema =
  SchemaFactory.createForClass(PartnerService);

// A partner offers a given service once; this is the row's real identity.
PartnerServiceSchema.index({ partnerId: 1, serviceId: 1 }, { unique: true });

// Assignment asks "who can currently take this service?".
PartnerServiceSchema.index({ serviceId: 1, isActive: 1 });
