import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BOOKING_TYPES } from '../booking-status';
// `import type` is required: emitDecoratorMetadata cannot emit a bare union.
import type { BookingType } from '../booking-status';

/**
 * customerId is absent on purpose: it comes from the bearer token, so a
 * customer cannot open a booking in someone else's name.
 */
export class CreateBookingDto {
  @ApiProperty({ description: 'Service being booked.' })
  @IsMongoId()
  serviceId!: string;

  @ApiProperty({ description: "One of the customer's saved addresses." })
  @IsMongoId()
  addressId!: string;

  @ApiProperty({ enum: BOOKING_TYPES })
  @IsIn(BOOKING_TYPES)
  bookingType!: BookingType;

  @ApiPropertyOptional({
    description:
      'Required for scheduled bookings and rejected for instant ones. ISO 8601.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @ApiPropertyOptional({ example: 'Gate code 4821, please call on arrival.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
