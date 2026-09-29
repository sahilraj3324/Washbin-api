import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPartner } from '../partner-auth/current-partner.decorator';
import { PartnerAuthGuard } from '../partner-auth/partner-auth.guard';
import type { PartnerTokenPayload } from '../partner-auth/partner-auth.guard';
import { StartMatchingDto } from './dto/start-matching.dto';
import { PartnerAssignmentService } from './partner-assignment.service';
import type {
  StartMatchingResult,
  SweepResult,
} from './partner-assignment.service';
import { PartnerAssignment } from './schemas/partner-assignment.schema';

@ApiTags('partner-assignment')
@Controller('partner-assignment')
export class PartnerAssignmentController {
  constructor(
    private readonly partnerAssignmentService: PartnerAssignmentService,
  ) {}

  // Literal paths first, so ':assignmentId' cannot swallow them.

  @Get('offers/me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The signed-in partner's open offers",
    description:
      'Sweeps lapsed offers before answering, so nothing dead is listed.',
  })
  findMyOffers(
    @CurrentPartner() partner: PartnerTokenPayload,
  ): Promise<PartnerAssignment[]> {
    return this.partnerAssignmentService.findOpenOffersForPartner(partner.sub);
  }

  @Post('sweep-expired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the due work: lapsed offers, then scheduled dispatch',
    description:
      'Intended for a platform cron. Offers also lapse lazily whenever a ' +
      'partner reads their offer list, but nothing else wakes a scheduled ' +
      'booking, so this has to run on a timer.',
  })
  sweepExpired(): Promise<SweepResult> {
    return this.partnerAssignmentService.sweepDue();
  }

  @Get('sweep-expired')
  @ApiOperation({
    summary: 'The same sweep, for platform crons that can only issue a GET',
    description:
      'Vercel cron jobs invoke their path with GET, so the same work is ' +
      'reachable both ways rather than the schedule needing a proxy.',
  })
  sweepExpiredViaGet(): Promise<SweepResult> {
    return this.partnerAssignmentService.sweepDue();
  }

  @Post('bookings/:bookingId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run matching for a booking',
    description:
      'Booking creation triggers this automatically for instant bookings. ' +
      'Use it to dispatch a scheduled booking or retry no_partner_found.',
  })
  startMatching(
    @Param('bookingId') bookingId: string,
    @Body() dto: StartMatchingDto,
  ): Promise<StartMatchingResult> {
    return this.partnerAssignmentService.startMatching(bookingId, dto);
  }

  @Post(':assignmentId/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an offer and take the booking' })
  accept(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('assignmentId') assignmentId: string,
  ): Promise<PartnerAssignment> {
    return this.partnerAssignmentService.accept(partner.sub, assignmentId);
  }

  @Post(':assignmentId/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Decline an offer',
    description: 'The booking is then offered to the next nearest partner.',
  })
  reject(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('assignmentId') assignmentId: string,
  ): Promise<PartnerAssignment> {
    return this.partnerAssignmentService.reject(partner.sub, assignmentId);
  }
}
