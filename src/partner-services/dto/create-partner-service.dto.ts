import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class CreatePartnerServiceDto {
  @ApiProperty({ description: 'Id of the partner offering the service.' })
  @IsMongoId()
  partnerId!: string;

  @ApiProperty({ description: 'Id of the service being offered.' })
  @IsMongoId()
  serviceId!: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Skipped by partner assignment when false.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
