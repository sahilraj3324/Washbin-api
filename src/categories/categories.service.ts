import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './schemas/category.schema';

const DUPLICATE_KEY = 11000;

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    try {
      return await this.categoryModel.create({
        ...dto,
        slug: dto.slug ?? this.toSlug(dto.name),
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A category with that name or slug already exists',
        );
      }
      throw error;
    }
  }

  /** The app passes isActive=true; admin screens leave it off to see all. */
  async findAll(isActive?: boolean): Promise<Category[]> {
    const filter: FilterQuery<Category> = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    return this.categoryModel
      .find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Category> {
    this.assertValidId(id);
    const category = await this.categoryModel.findById(id).exec();

    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    this.assertValidId(id);

    try {
      const updated = await this.categoryModel
        .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
        .exec();

      if (!updated) {
        throw new NotFoundException(`Category ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A category with that name or slug already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    const result = await this.categoryModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Category ${id} not found`);
    }
  }

  /** Drops every category document. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.categoryModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /** "Home Cleaning" -> "home-cleaning". */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Category ${id} not found`);
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
