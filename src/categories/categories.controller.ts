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
import { Service } from '../services/schemas/service.schema';
import { ServicesService } from '../services/services.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './schemas/category.schema';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly servicesService: ServicesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'View all categories' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('isActive', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
  ): Promise<Category[]> {
    return this.categoriesService.findAll(isActive);
  }

  @Get(':id/services')
  @ApiOperation({ summary: 'View the services in one category' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findServices(
    @Param('id') id: string,
    @Query('isActive', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
  ): Promise<Service[]> {
    // 404s on an unknown category rather than returning an empty list, so the
    // app can tell "no services yet" apart from "bad link".
    await this.categoriesService.findOne(id);
    return this.servicesService.findAll({ categoryId: id, isActive });
  }

  @Get(':id')
  @ApiOperation({ summary: 'View one category by id' })
  findOne(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category by id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category by id' })
  remove(@Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(id);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all categories' })
  removeAll(): Promise<{ deleted: number }> {
    return this.categoriesService.removeAll();
  }
}
