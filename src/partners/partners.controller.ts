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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentPartner } from '../partner-auth/current-partner.decorator';
import { PartnerAuthGuard } from '../partner-auth/partner-auth.guard';
import type { PartnerTokenPayload } from '../partner-auth/partner-auth.guard';
import { UpdateMyPartnerDto } from './dto/update-my-partner.dto';
import { Partner } from './partner.schema';
import { PartnersService } from './partners.service';
import type { SubmitForReviewResult } from './partners.service';

export class CreatePartnerDto {
  @ApiProperty({ description: 'Firebase Auth uid.' })
  @IsString()
  authUserId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  businessName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  ownerName!: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @MinLength(7)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}

@ApiTags('partners')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  // The /me routes are declared before ':id' so that path does not swallow
  // "me" as an object id.

  @Get('me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View the signed-in partner' })
  findMine(@CurrentPartner() partner: PartnerTokenPayload): Promise<Partner> {
    return this.partnersService.findMe(partner.sub);
  }

  @Patch('me')
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update the signed-in partner's own profile",
    description:
      'Accepts only the fields a partner may change about themselves. ' +
      "verificationStatus and status are Washbin's to set and are rejected.",
  })
  updateMine(
    @CurrentPartner() partner: PartnerTokenPayload,
    @Body() dto: UpdateMyPartnerDto,
  ): Promise<Partner> {
    return this.partnersService.updateMe(partner.sub, dto);
  }

  @Post('me/submit-for-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PartnerAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Put the signed-in partner forward for verification',
    description:
      'Moves pending or rejected to submitted. Refused with 400 when the ' +
      'profile is incomplete or no service has been chosen.',
  })
  submitForReview(
    @CurrentPartner() partner: PartnerTokenPayload,
  ): Promise<SubmitForReviewResult> {
    return this.partnersService.submitForReview(partner.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create a partner' })
  create(@Body() dto: CreatePartnerDto): Promise<Partner> {
    return this.partnersService.create(dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a partner',
    description:
      'Marks the partner verification status as verified. Account status is unchanged.',
  })
  approve(@Param('id') id: string): Promise<Partner> {
    return this.partnersService.approve(id);
  }

  @Get()
  @ApiOperation({ summary: 'View all partners' })
  findAll(): Promise<Partner[]> {
    return this.partnersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one partner by id' })
  findOne(@Param('id') id: string): Promise<Partner> {
    return this.partnersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a partner by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ): Promise<Partner> {
    return this.partnersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a partner by id' })
  remove(@Param('id') id: string): Promise<void> {
    return this.partnersService.remove(id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all partners' })
  removeAll(): Promise<{ deleted: number }> {
    return this.partnersService.removeAll();
  }
}
