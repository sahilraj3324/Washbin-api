import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyStartOtpDto {
  @ApiProperty({
    example: '482915',
    description: 'The code the customer reads out.',
  })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'otp must be six digits' })
  otp!: string;
}
