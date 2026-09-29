import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ADDRESS_LABELS } from '../schemas/address.schema';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { AddressLabel } from '../schemas/address.schema';

export class CreateAddressDto {
  @ApiProperty({ description: 'Id of the customer this address belongs to.' })
  @IsMongoId()
  customerId!: string;

  @ApiProperty({ enum: ADDRESS_LABELS })
  @IsIn(ADDRESS_LABELS)
  label!: AddressLabel;

  @ApiProperty({ example: '221B Baker Street, Marylebone' })
  @IsString()
  @MinLength(5)
  fullAddress!: string;

  @ApiPropertyOptional({ example: 'Flat 4B' })
  @IsOptional()
  @IsString()
  houseNumber?: string;

  @ApiPropertyOptional({ example: 'Opposite the metro station' })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @MinLength(2)
  city!: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @MinLength(2)
  state!: string;

  @ApiProperty({ example: '400001', description: 'Six-digit Indian PIN code.' })
  @IsString()
  @Matches(/^[1-9][0-9]{5}$/, {
    message: 'pincode must be a six-digit Indian PIN code',
  })
  pincode!: string;

  @ApiProperty({ example: 19.076 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Retired addresses cannot be used for new bookings.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Makes this the default address, demoting the previous one. The first address a customer saves becomes the default regardless.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDefault?: boolean;
}
