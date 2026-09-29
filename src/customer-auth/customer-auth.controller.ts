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
import {
  CustomerAuthService,
  CustomerLoginResult,
} from './customer-auth.service';

export class PhoneSignInDto {
  @ApiProperty({
    description:
      'Firebase ID token from the app, obtained after the SMS code was verified.',
  })
  @IsString()
  @IsNotEmpty()
  firebaseIdToken!: string;

  @ApiPropertyOptional({
    example: 'Rahul Sharma',
    description:
      'Required only when the number has no account yet. The first call may omit it: a 404 with code PROFILE_REQUIRED means "ask for a name and call again".',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'someone@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

@ApiTags('customer-auth')
@Controller('customer-auth')
export class CustomerAuthController {
  constructor(private readonly customerAuthService: CustomerAuthService) {}

  @Post('phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in or register a customer with a verified phone number',
    description:
      'Exchanges a Firebase phone-auth ID token for a Washbin access token, creating the customer on first use.',
  })
  signInWithPhone(@Body() dto: PhoneSignInDto): Promise<CustomerLoginResult> {
    return this.customerAuthService.signInWithPhone(dto);
  }
}
