import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  /** Display name, e.g. "Home Cleaning". */
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  /**
   * URL/lookup key derived from the name when the client does not send one.
   * Lowercased so a category resolves the same however the app cases it.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  })
  slug!: string;

  @Prop({ trim: true })
  description?: string;

  /** Banner or thumbnail for the category detail screen. */
  @Prop({ trim: true })
  imageUrl?: string;

  /** Icon shown in the category grid. */
  @Prop({ trim: true })
  iconUrl?: string;

  /** Ascending display order; ties fall back to name. */
  @Prop({ default: 0, index: true })
  sortOrder!: number;

  /** Hidden from customer-facing listings when false. */
  @Prop({ default: true, index: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
