import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

/** The partner app reports latitude/longitude; storage is GeoJSON. */
export class UpdateLocationDto {
  @ApiProperty({ example: 28.6139 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 77.209 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;
}
