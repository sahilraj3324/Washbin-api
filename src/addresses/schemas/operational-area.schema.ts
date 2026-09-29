import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Service } from '../../services/schemas/service.schema';
import { GeoPoint, GeoPointSchema } from '../../common/geo-point.schema';

/**
 * A circle the business operates in: a centre point plus a radius. This is
 * what serviceability is checked against, and the same distance maths will
 * drive partner matching.
 */
@Schema({ timestamps: true, collection: 'operational_areas' })
export class OperationalArea {
  /** Operator-facing label, e.g. "Delhi NCR". */
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  /** Informational; the radius is what actually decides serviceability. */
  @Prop({ required: true, trim: true })
  city!: string;

  /** Derived from centreLatitude/centreLongitude by the hook below. */
  @Prop({ type: GeoPointSchema })
  centre!: GeoPoint;

  @Prop({ required: true, min: -90, max: 90 })
  centreLatitude!: number;

  @Prop({ required: true, min: -180, max: 180 })
  centreLongitude!: number;

  /** How far from the centre the business will travel. */
  @Prop({ required: true, min: 0 })
  radiusKm!: number;

  /**
   * Which services this area covers. Empty means every service, which is the
   * common case — a city is usually either live or it is not.
   */
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: Service.name }],
    default: [],
  })
  serviceIds!: Types.ObjectId[];

  /** Lets an area be switched off without deleting it. */
  @Prop({ default: true, index: true })
  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OperationalAreaDocument = HydratedDocument<OperationalArea>;
export const OperationalAreaSchema =
  SchemaFactory.createForClass(OperationalArea);

// Same derived-point rule as Address: the scalars are the input, `centre` is
// what the geo index reads.
OperationalAreaSchema.pre('validate', function (next) {
  if (
    this.isModified('centreLatitude') ||
    this.isModified('centreLongitude') ||
    !this.centre
  ) {
    this.centre = {
      type: 'Point',
      coordinates: [this.centreLongitude, this.centreLatitude],
    };
  }
  next();
});

// Required by the $geoNear stage the serviceability check runs.
OperationalAreaSchema.index({ centre: '2dsphere' });
