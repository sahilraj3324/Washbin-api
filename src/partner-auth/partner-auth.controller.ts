import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PartnerAuthService, PartnerLoginResult } from './partner-auth.service';

export class PartnerPhoneSignInDto {
  @ApiProperty({
    description:
      'Firebase ID token from the partner app, obtained after the SMS code was verified.',
  })
  @IsString()
  @IsNotEmpty()
  firebaseIdToken!: string;

  @ApiPropertyOptional({
    example: 'Sharma Home Services',
    description:
      'Required only when the number has no account yet. The first call may omit it: a 404 with code PROFILE_REQUIRED means "collect the business details and call again".',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  businessName?: string;

  @ApiPropertyOptional({ example: 'Rahul Sharma' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  ownerName?: string;

  @ApiPropertyOptional({ example: 'partner@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

@ApiTags('partner-auth')
@Controller('partner-auth')
export class PartnerAuthController {
  constructor(private readonly partnerAuthService: PartnerAuthService) {}

  @Post('phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in or register a partner with a verified phone number',
    description:
      'Exchanges a Firebase phone-auth ID token for a Washbin access token, creating the partner (verification pending) on first use.',
  })
  signInWithPhone(
    @Body() dto: PartnerPhoneSignInDto,
  ): Promise<PartnerLoginResult> {
    return this.partnerAuthService.signInWithPhone(dto);
  }
}
