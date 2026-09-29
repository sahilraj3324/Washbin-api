import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteDeviceTokenDto {
  @ApiProperty({ example: 'firebase-device-token' })
  @IsString()
  @MinLength(10)
  token!: string;
}
