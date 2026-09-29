import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { Service } from '../services/schemas/service.schema';
import { CheckServiceabilityDto } from './dto/check-serviceability.dto';
import { CreateOperationalAreaDto } from './dto/create-operational-area.dto';
import { UpdateOperationalAreaDto } from './dto/update-operational-area.dto';
import {
  OperationalArea,
  OperationalAreaDocument,
} from './schemas/operational-area.schema';

const DUPLICATE_KEY = 11000;
const METRES_PER_KM = 1000;

export interface ServiceabilityResult {
  serviceable: boolean;
}

@Injectable()
export class OperationalAreasService {
  constructor(
    @InjectModel(OperationalArea.name)
    private readonly operationalAreaModel: Model<OperationalArea>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<Service>,
  ) {}

  /**
   * True when the point falls inside at least one active area that covers the
   * service. An inactive or unknown service is never serviceable, so the app
   * cannot start a booking for something it cannot deliver.
   */
  async checkServiceability(
    dto: CheckServiceabilityDto,
  ): Promise<ServiceabilityResult> {
    const service = await this.serviceModel
      .findById(dto.serviceId)
      .select('isActive')
      .exec();

    if (!service) {
      throw new BadRequestException(`Service ${dto.serviceId} not found`);
    }
    if (!service.isActive) {
      return { serviceable: false };
    }

    const serviceId = new Types.ObjectId(dto.serviceId);

    // $geoNear computes the distance so the $match can compare it against
    // each area's own radiusKm - a plain $geoWithin cannot read a doc field.
    const matches = await this.operationalAreaModel
      .aggregate<{ _id: Types.ObjectId }>([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [dto.longitude, dto.latitude],
            },
            distanceField: 'distanceMetres',
            spherical: true,
            query: {
              isActive: true,
              // An empty serviceIds list means the area covers everything.
              $or: [{ serviceIds: { $size: 0 } }, { serviceIds: serviceId }],
            },
          },
        },
        {
          $match: {
            $expr: {
              $lte: [
                '$distanceMetres',
                { $multiply: ['$radiusKm', METRES_PER_KM] },
              ],
            },
          },
        },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ])
      .exec();

    return { serviceable: matches.length > 0 };
  }

  async create(dto: CreateOperationalAreaDto): Promise<OperationalArea> {
    await this.assertServicesExist(dto.serviceIds);

    try {
      return await this.operationalAreaModel.create(dto);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An operational area with that name already exists',
        );
      }
      throw error;
    }
  }

  async findAll(isActive?: boolean): Promise<OperationalArea[]> {
    const filter: FilterQuery<OperationalArea> = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    return this.operationalAreaModel.find(filter).sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<OperationalArea> {
    return this.loadOne(id);
  }

  async update(
    id: string,
    dto: UpdateOperationalAreaDto,
  ): Promise<OperationalArea> {
    const area = await this.loadOne(id);
    await this.assertServicesExist(dto.serviceIds);

    // Saved through the document so the pre-validate hook rebuilds `centre`
    // whenever the centre coordinates move.
    area.set(dto);

    try {
      return await area.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'An operational area with that name already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const area = await this.loadOne(id);
    await area.deleteOne();
  }

  /** Drops every operational area. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.operationalAreaModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /** An area scoped to a service that does not exist would never match. */
  private async assertServicesExist(serviceIds?: string[]): Promise<void> {
    if (!serviceIds?.length) {
      return;
    }

    const found = await this.serviceModel
      .countDocuments({ _id: { $in: serviceIds } })
      .exec();

    if (found !== new Set(serviceIds).size) {
      throw new BadRequestException('One or more serviceIds do not exist');
    }
  }

  private async loadOne(id: string): Promise<OperationalAreaDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Operational area ${id} not found`);
    }

    const area = await this.operationalAreaModel.findById(id).exec();

    if (!area) {
      throw new NotFoundException(`Operational area ${id} not found`);
    }
    return area;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === DUPLICATE_KEY
    );
  }
}
