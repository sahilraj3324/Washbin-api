import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CheckServiceabilityDto } from './dto/check-serviceability.dto';
import { CreateMyAddressDto } from './dto/create-my-address.dto';
import { UpdateMyAddressDto } from './dto/update-my-address.dto';
import { OperationalAreasService } from './operational-areas.service';
import type { ServiceabilityResult } from './operational-areas.service';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { ADDRESS_LABELS, Address } from './schemas/address.schema';
import type { AddressLabel } from './schemas/address.schema';

@ApiTags('addresses')
@Controller('addresses')
export class AddressesController {
  constructor(
    private readonly addressesService: AddressesService,
    private readonly operationalAreasService: OperationalAreasService,
  ) {}

  @Post('check-serviceability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check whether a point is serviceable for a service',
    description:
      'Takes raw coordinates so it answers for a saved address and for the ' +
      "customer's current location alike.",
  })
  checkServiceability(
    @Body() dto: CheckServiceabilityDto,
  ): Promise<ServiceabilityResult> {
    return this.operationalAreasService.checkServiceability(dto);
  }

  // The /me routes are declared before ':id' so that path does not swallow
  // "me" as an object id.

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "View the signed-in customer's addresses" })
  findMine(
    @CurrentCustomer() customer: CustomerTokenPayload,
  ): Promise<Address[]> {
    return this.addressesService.findAllForCustomer(customer.sub);
  }

  @Post('me')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save an address for the signed-in customer' })
  createMine(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Body() dto: CreateMyAddressDto,
  ): Promise<Address> {
    return this.addressesService.createForCustomer(customer.sub, dto);
  }

  @Patch('me/:id')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update one of the customer's own addresses" })
  updateMine(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMyAddressDto,
  ): Promise<Address> {
    return this.addressesService.updateForCustomer(customer.sub, id, dto);
  }

  @Delete('me/:id')
  @UseGuards(CustomerAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete one of the customer's own addresses" })
  removeMine(
    @CurrentCustomer() customer: CustomerTokenPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.addressesService.removeForCustomer(customer.sub, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an address' })
  create(@Body() dto: CreateAddressDto): Promise<Address> {
    return this.addressesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'View addresses by customer or label' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'label', required: false, enum: ADDRESS_LABELS })
  findAll(
    @Query('customerId') customerId?: string,
    @Query('label') label?: AddressLabel,
  ): Promise<Address[]> {
    return this.addressesService.findAll({ customerId, label });
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one address by id' })
  findOne(@Param('id') id: string): Promise<Address> {
    return this.addressesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an address by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.addressesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address by id' })
  remove(@Param('id') id: string): Promise<void> {
    return this.addressesService.remove(id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all addresses' })
  removeAll(): Promise<{ deleted: number }> {
    return this.addressesService.removeAll();
  }
}
