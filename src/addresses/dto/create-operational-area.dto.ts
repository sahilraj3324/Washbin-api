import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOperationalAreaDto {
  @ApiProperty({ example: 'Delhi NCR' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'New Delhi' })
  @IsString()
  @MinLength(2)
  city!: string;

  @ApiProperty({ example: 28.6139 })
  @Type(() => Number)
  @IsLatitude()
  centreLatitude!: number;

  @ApiProperty({ example: 77.209 })
  @Type(() => Number)
  @IsLongitude()
  centreLongitude!: number;

  @ApiProperty({ example: 25, description: 'Radius in kilometres.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  radiusKm!: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'Services this area covers. Empty or omitted means all.',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  serviceIds?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
