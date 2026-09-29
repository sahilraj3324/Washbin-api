import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
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
import { CurrentPartner } from '../partner-auth/current-partner.decorator';
import { PartnerAuthGuard } from '../partner-auth/partner-auth.guard';
import type { PartnerTokenPayload } from '../partner-auth/partner-auth.guard';
import { CreateMyPartnerServiceDto } from './dto/create-my-partner-service.dto';
import { CreatePartnerServiceDto } from './dto/create-partner-service.dto';
import { UpdatePartnerServiceDto } from './dto/update-partner-service.dto';
import { PartnerServicesService } from './partner-services.service';
import { PartnerService } from './schemas/partner-service.schema';

@ApiTags('partner-services')
@Controller('partner-services')
export class PartnerServicesController {
  constructor(
    private readonly partnerServicesService: PartnerServicesService,
  ) {}

  // The /me routes are declared before ':id' so that path does not swallow
  // "me" as an object id.

  @Get('me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "View the signed-in partner's services" })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findMine(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Query('isActive', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
  ): Promise<PartnerService[]> {
    return this.partnerServicesService.findAllForPartner(partner.sub, isActive);
  }

  @Post('me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a service to the signed-in partner' })
  createMine(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Body() dto: CreateMyPartnerServiceDto,
  ): Promise<PartnerService> {
    return this.partnerServicesService.createForPartner(partner.sub, dto);
  }

  @Patch('me/:id')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Activate or pause one of the partner's services" })
  updateMine(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePartnerServiceDto,
  ): Promise<PartnerService> {
    return this.partnerServicesService.updateForPartner(partner.sub, id, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Add a service to a partner' })
  create(@Body() dto: CreatePartnerServiceDto): Promise<PartnerService> {
    return this.partnerServicesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'View partner services by partner, service or flag',
  })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('partnerId') partnerId?: string,
    @Query('serviceId') serviceId?: string,
    @Query('isActive', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
  ): Promise<PartnerService[]> {
    return this.partnerServicesService.findAll({
      partnerId,
      serviceId,
      isActive,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one partner service by id' })
  findOne(@Param('id') id: string): Promise<PartnerService> {
    return this.partnerServicesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Activate or pause a partner service by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerServiceDto,
  ): Promise<PartnerService> {
    return this.partnerServicesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a service from a partner by id' })
  remove(@Param('id') id: string): Promise<void> {
    return this.partnerServicesService.remove(id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all partner services' })
  removeAll(): Promise<{ deleted: number }> {
    return this.partnerServicesService.removeAll();
  }
}
