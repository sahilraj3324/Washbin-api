import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { PRICING_TYPES } from '../schemas/service.schema';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { PricingType } from '../schemas/service.schema';

export class CreateServiceDto {
  @ApiProperty({ description: 'Id of the category this service belongs to.' })
  @IsMongoId()
  categoryId!: string;

  @ApiProperty({ example: 'Deep Cleaning' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({
    example: 'deep-cleaning',
    description: 'Lowercase slug. Derived from the name when omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  slug?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  description!: string;

  @ApiPropertyOptional({ description: 'Banner or thumbnail URL.' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Icon URL shown in the service list.' })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiProperty({ enum: PRICING_TYPES })
  @IsIn(PRICING_TYPES)
  pricingType!: PricingType;

  @ApiProperty({ example: 999, description: 'Price in rupees.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDurationMinutes?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Hidden from customer-facing listings when false.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Ascending display order.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
