import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GENDERS } from '../partner.schema';
import type { Gender } from '../partner.schema';

export class PartnerAddressDto {
  @ApiPropertyOptional({ example: '14 Shivaji Road' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  line1!: string;

  @ApiPropertyOptional({ example: 'Near the water tank' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  line2?: string;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsString()
  @MinLength(2)
  city!: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsString()
  @MinLength(2)
  state!: string;

  @ApiPropertyOptional({ example: '400020' })
  @Matches(/^[1-9][0-9]{5}$/, { message: 'pincode must be 6 digits' })
  pincode!: string;
}

export class EmergencyContactDto {
  @ApiPropertyOptional({ example: 'Sunita Sharma' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: '+919876543211' })
  @IsString()
  @MinLength(7)
  phone!: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;
}

/**
 * Body for PATCH /partners/me.
 *
 * Deliberately not `PartialType(CreatePartnerDto)`: that would inherit
 * `authUserId` and `phone`, letting a partner repoint their own record at
 * another Firebase account or another number. Everything a partner may change
 * about themselves is listed here, and nothing else is accepted — the global
 * ValidationPipe runs with `forbidNonWhitelisted`, so `verificationStatus` or
 * `status` in the body is a 400 rather than a quiet self-approval.
 */
export class UpdateMyPartnerDto {
  @ApiPropertyOptional({ example: 'Sharma Home Services' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  businessName?: string;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  ownerName?: string;

  @ApiPropertyOptional({ example: 'partner@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/a.jpg' })
  @IsOptional()
  @IsUrl()
  profileImage?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  experienceYears?: number;

  @ApiPropertyOptional({ type: PartnerAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartnerAddressDto)
  address?: PartnerAddressDto;

  @ApiPropertyOptional({ type: EmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;
}
