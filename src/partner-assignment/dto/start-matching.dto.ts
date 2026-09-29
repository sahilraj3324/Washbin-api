import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Ops override for a booking that needs another pass, e.g. retrying one that
 * ended up in no_partner_found with a wider search.
 */
export class StartMatchingDto {
  @ApiPropertyOptional({
    example: 25,
    description: 'How far to look, in kilometres. Defaults to 15.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  maxDistanceKm?: number;

  @ApiPropertyOptional({
    example: 30,
    description:
      'How stale a reported position may be, in minutes. Defaults to 15.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxLocationAgeMinutes?: number;
}
