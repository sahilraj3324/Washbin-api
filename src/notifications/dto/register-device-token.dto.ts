import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';
import { DEVICE_PLATFORMS } from '../schemas/device-token.schema';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { DevicePlatform } from '../schemas/device-token.schema';

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'firebase-device-token' })
  @IsString()
  @MinLength(10)
  token!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS, example: 'android' })
  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;
}
