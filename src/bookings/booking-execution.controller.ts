import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPartner } from '../partner-auth/current-partner.decorator';
import { PartnerAuthGuard } from '../partner-auth/partner-auth.guard';
import type { PartnerTokenPayload } from '../partner-auth/partner-auth.guard';
import { BookingExecutionService } from './booking-execution.service';
import type { PartnerDashboard } from './booking-execution.service';
import { VerifyStartOtpDto } from './dto/verify-start-otp.dto';
import { Booking } from './schemas/booking.schema';

const HISTORY_STATUSES = ['completed', 'cancelled'] as const;
type PartnerHistoryStatus = (typeof HISTORY_STATUSES)[number];

/**
 * What the partner does after accepting. One endpoint per step rather than a
 * generic status route, so an invalid state is not even expressible.
 *
 * Every response has the customer's start code stripped.
 */
@ApiTags('booking-execution')
@ApiBearerAuth()
@UseGuards(PartnerAuthGuard)
@Controller('bookings')
export class BookingExecutionController {
  constructor(
    private readonly bookingExecutionService: BookingExecutionService,
  ) {}

  @Get('me/active')
  @ApiOperation({
    summary: "View the signed-in partner's current active job",
    description: 'Returns null when the partner has no active accepted job.',
  })
  findActive(
    @CurrentPartner() partner: PartnerTokenPayload,
  ): Promise<Booking | null> {
    return this.bookingExecutionService.findActiveForPartner(partner.sub);
  }

  @Get('me/dashboard')
  @ApiOperation({
    summary: "View the signed-in partner's dashboard summary",
    description:
      'Read-only counts and earnings calculated by the backend from assigned bookings.',
  })
  dashboard(
    @CurrentPartner() partner: PartnerTokenPayload,
  ): Promise<PartnerDashboard> {
    return this.bookingExecutionService.dashboardForPartner(partner.sub);
  }

  @Get('me/history')
  @ApiOperation({ summary: "View the signed-in partner's job history" })
  findHistory(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Query('status') status?: PartnerHistoryStatus,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
  ): Promise<Booking[]> {
    return this.bookingExecutionService.findHistoryForPartner(partner.sub, {
      status,
      limit,
      skip,
    });
  }

  @Post(':id/on-the-way')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Partner has set off (accepted -> on_the_way)' })
  onTheWay(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingExecutionService.markOnTheWay(partner.sub, id);
  }

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Partner has arrived (on_the_way -> arrived)',
    description:
      "Mints the customer's start code. The code is shown in the customer's " +
      'app and is never returned here.',
  })
  arrive(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingExecutionService.markArrived(partner.sub, id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start the service (arrived -> in_progress)',
    description:
      'Refused when SERVICE_START_OTP_REQUIRED is on; use verify-start-otp.',
  })
  start(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingExecutionService.startService(partner.sub, id);
  }

  @Post(':id/verify-start-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start the service with the customer’s code',
    description: 'Proves the partner reached the customer before work began.',
  })
  verifyStartOtp(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('id') id: string,
    @Body() dto: VerifyStartOtpDto,
  ): Promise<Booking> {
    return this.bookingExecutionService.verifyStartOtp(
      partner.sub,
      id,
      dto.otp,
    );
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish the service (in_progress -> completed)' })
  complete(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('id') id: string,
  ): Promise<Booking> {
    return this.bookingExecutionService.completeService(partner.sub, id);
  }
}
