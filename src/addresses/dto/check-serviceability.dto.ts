import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsMongoId } from 'class-validator';

/**
 * Takes raw coordinates rather than an address id, so the same endpoint
 * answers both branches of the flow: a saved address and "use my current
 * location", which has nothing stored yet.
 */
export class CheckServiceabilityDto {
  @ApiProperty({ example: 28.6139 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 77.209 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiProperty({ description: 'Service the customer is trying to book.' })
  @IsMongoId()
  serviceId!: string;
}
