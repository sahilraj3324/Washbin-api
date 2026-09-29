import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPartner } from '../partner-auth/current-partner.decorator';
import { PartnerAuthGuard } from '../partner-auth/partner-auth.guard';
import type { PartnerTokenPayload } from '../partner-auth/partner-auth.guard';
import { AvailabilityService } from './availability.service';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { PartnerAvailability } from './schemas/partner-availability.schema';

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // The /me routes are declared before ':partnerId' so that path does not
  // swallow "me" as an object id.

  @Get('me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "View the signed-in partner's availability",
    description: 'Creates the row on first look; a fresh row is offline.',
  })
  findMine(
    @CurrentPartner() partner: PartnerTokenPayload,
  ): Promise<PartnerAvailability> {
    return this.availabilityService.findForPartner(partner.sub);
  }

  @Patch('me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Go online/offline, or set busy, radius and shift window',
    description:
      'Going offline also clears isAvailable. Asking for isAvailable:true ' +
      'while offline is rejected.',
  })
  updateMine(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Body() dto: UpdateAvailabilityDto,
  ): Promise<PartnerAvailability> {
    return this.availabilityService.updateForPartner(partner.sub, dto);
  }

  @Patch('me/location')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Report the partner's current location" })
  updateMyLocation(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Body() dto: UpdateLocationDto,
  ): Promise<PartnerAvailability> {
    return this.availabilityService.updateLocationForPartner(partner.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'View every partner’s availability' })
  @ApiQuery({ name: 'isOnline', required: false, type: Boolean })
  @ApiQuery({ name: 'isAvailable', required: false, type: Boolean })
  findAll(
    @Query('isOnline', new ParseBoolPipe({ optional: true }))
    isOnline?: boolean,
    @Query('isAvailable', new ParseBoolPipe({ optional: true }))
    isAvailable?: boolean,
  ): Promise<PartnerAvailability[]> {
    return this.availabilityService.findAll({ isOnline, isAvailable });
  }

  @Get(':partnerId')
  @ApiOperation({ summary: "View one partner's availability" })
  findOne(@Param('partnerId') partnerId: string): Promise<PartnerAvailability> {
    return this.availabilityService.findOneByPartner(partnerId);
  }
}
