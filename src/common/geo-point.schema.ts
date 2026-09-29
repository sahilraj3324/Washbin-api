import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** GeoJSON Point, the only shape Mongo's 2dsphere index understands. */
@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  type!: 'Point';

  /** [longitude, latitude] - GeoJSON order, the reverse of how we read it. */
  @Prop({ type: [Number], required: true })
  coordinates!: [number, number];
}

export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);

/** Callers hold latitude/longitude; the index needs [lng, lat]. */
export function toGeoPoint(latitude: number, longitude: number): GeoPoint {
  return { type: 'Point', coordinates: [longitude, latitude] };
}
