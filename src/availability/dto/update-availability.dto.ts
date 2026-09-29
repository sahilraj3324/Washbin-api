import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({
    description:
      'The partner on/off switch. Going offline also clears isAvailable.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOnline?: boolean;

  @ApiPropertyOptional({
    description: 'Free to take a job. Rejected while the partner is offline.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    example: 10,
    description: 'How far the partner will travel, in kilometres.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({
    example: 28.6139,
    description:
      'Current latitude. When provided with longitude, the location is updated in the same availability change.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    example: 77.209,
    description:
      'Current longitude. When provided with latitude, the location is updated in the same availability change.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Start of the shift window, ISO 8601.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  availableFrom?: Date;

  @ApiPropertyOptional({ description: 'End of the shift window, ISO 8601.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  availableUntil?: Date;
}
