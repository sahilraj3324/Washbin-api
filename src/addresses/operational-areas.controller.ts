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
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateOperationalAreaDto } from './dto/create-operational-area.dto';
import { UpdateOperationalAreaDto } from './dto/update-operational-area.dto';
import { OperationalAreasService } from './operational-areas.service';
import { OperationalArea } from './schemas/operational-area.schema';

@ApiTags('operational-areas')
@Controller('operational-areas')
export class OperationalAreasController {
  constructor(
    private readonly operationalAreasService: OperationalAreasService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an operational area' })
  create(@Body() dto: CreateOperationalAreaDto): Promise<OperationalArea> {
    return this.operationalAreasService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'View all operational areas' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('isActive', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
  ): Promise<OperationalArea[]> {
    return this.operationalAreasService.findAll(isActive);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one operational area by id' })
  findOne(@Param('id') id: string): Promise<OperationalArea> {
    return this.operationalAreasService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an operational area by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOperationalAreaDto,
  ): Promise<OperationalArea> {
    return this.operationalAreasService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an operational area by id' })
  remove(@Param('id') id: string): Promise<void> {
    return this.operationalAreasService.remove(id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all operational areas' })
  removeAll(): Promise<{ deleted: number }> {
    return this.operationalAreasService.removeAll();
  }
}
