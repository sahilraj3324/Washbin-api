import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum AdminRole {
  SuperAdmin = 'superadmin',
  Admin = 'admin',
}

@Schema({ timestamps: true, collection: 'admins' })
export class Admin {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: AdminRole, default: AdminRole.Admin })
  role!: AdminRole;

  @Prop({ default: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AdminDocument = HydratedDocument<Admin>;
export const AdminSchema = SchemaFactory.createForClass(Admin);
