import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { Category } from '../categories/schemas/category.schema';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './schemas/service.schema';

const DUPLICATE_KEY = 11000;

export interface FindAllServicesFilter {
  categoryId?: string;
  isActive?: boolean;
}

@Injectable()
export class ServicesService {
  constructor(
    @InjectModel(Service.name)
    private readonly serviceModel: Model<Service>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) {}

  async create(dto: CreateServiceDto): Promise<Service> {
    await this.assertCategoryExists(dto.categoryId);

    try {
      return await this.serviceModel.create({
        ...dto,
        slug: dto.slug ?? this.toSlug(dto.name),
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('A service with that slug already exists');
      }
      throw error;
    }
  }

  /**
   * Scoped to one category for the category screen, and to isActive=true for
   * anything customer-facing; admin screens leave both off.
   */
  async findAll(filter: FindAllServicesFilter = {}): Promise<Service[]> {
    const query: FilterQuery<Service> = {};

    if (filter.categoryId !== undefined) {
      if (!isValidObjectId(filter.categoryId)) {
        throw new BadRequestException(
          `categoryId ${filter.categoryId} is not valid`,
        );
      }
      query.categoryId = filter.categoryId;
    }
    if (filter.isActive !== undefined) {
      query.isActive = filter.isActive;
    }

    return this.serviceModel.find(query).sort({ sortOrder: 1, name: 1 }).exec();
  }

  async findOne(id: string): Promise<Service> {
    this.assertValidId(id);
    const service = await this.serviceModel.findById(id).exec();

    if (!service) {
      throw new NotFoundException(`Service ${id} not found`);
    }
    return service;
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    this.assertValidId(id);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    try {
      const updated = await this.serviceModel
        .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
        .exec();

      if (!updated) {
        throw new NotFoundException(`Service ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('A service with that slug already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    const result = await this.serviceModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Service ${id} not found`);
    }
  }

  /** Drops every service document. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.serviceModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /**
   * A service pointing at a category that does not exist is bad data the
   * customer app cannot render, so reject it at write time.
   */
  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categoryModel.exists({ _id: categoryId }).exec();

    if (!exists) {
      throw new BadRequestException(`Category ${categoryId} not found`);
    }
  }

  /** "Deep Cleaning" -> "deep-cleaning". */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Service ${id} not found`);
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === DUPLICATE_KEY
    );
  }
}
