import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCustomer } from '../customer-auth/current-customer.decorator';
import { CustomerAuthGuard } from '../customer-auth/customer-auth.guard';
import type { CustomerTokenPayload } from '../customer-auth/customer-auth.guard';
import { BOOKING_STATUSES } from './booking-status';
import type { BookingStatus } from './booking-status';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Booking } from './schemas/booking.schema';

/**
 * Every route is scoped to the signed-in customer. There is deliberately no
 * generic status route: status only moves through cancel here, or through
 * BookingsService.transitionTo from partner-assignment.
 */
@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Validates the customer, service, address ownership, serviceability ' +
      'and schedule, then stores the request. Instant bookings start in ' +
      'searching_partner, scheduled ones in pending.',
  })
  create(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Body() dto: CreateBookingDto,
  ): Promise<Booking> {
    return this.bookingsService.createForCustomer(customer.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: "View the signed-in customer's bookings" })
  @ApiQuery({ name: 'status', required: false, enum: BOOKING_STATUSES })
  findAll(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Query('status') status?: BookingStatus,
  ): Promise<Booking[]> {
    return this.bookingsService.findAllForCustomer(customer.sub, { status });
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one of the customer’s own bookings' })
  findOne(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingsService.findOneForCustomer(customer.sub, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a booking',
    description:
      'Rejected with 409 from a status the transition table does not allow ' +
      'cancelling from, such as in_progress or completed.',
  })
  cancel(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingsService.cancelForCustomer(customer.sub, id);
  }
}
