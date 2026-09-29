import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { Partner } from '../partners/partner.schema';
import { Service } from '../services/schemas/service.schema';
import { CreateMyPartnerServiceDto } from './dto/create-my-partner-service.dto';
import { CreatePartnerServiceDto } from './dto/create-partner-service.dto';
import { UpdatePartnerServiceDto } from './dto/update-partner-service.dto';
import { PartnerService } from './schemas/partner-service.schema';

const DUPLICATE_KEY = 11000;

export interface FindAllPartnerServicesFilter {
  partnerId?: string;
  serviceId?: string;
  isActive?: boolean;
}

@Injectable()
export class PartnerServicesService {
  constructor(
    @InjectModel(PartnerService.name)
    private readonly partnerServiceModel: Model<PartnerService>,
    @InjectModel(Partner.name)
    private readonly partnerModel: Model<Partner>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<Service>,
  ) {}

  async create(dto: CreatePartnerServiceDto): Promise<PartnerService> {
    await this.assertRefsExist(dto.partnerId, dto.serviceId);

    try {
      return await this.partnerServiceModel.create(dto);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('That partner already offers that service');
      }
      throw error;
    }
  }

  /**
   * Both directions are needed: a partner's own offerings list, and the pool
   * of partners for a service at assignment time.
   */
  async findAll(
    filter: FindAllPartnerServicesFilter = {},
  ): Promise<PartnerService[]> {
    const query: FilterQuery<PartnerService> = {};

    if (filter.partnerId !== undefined) {
      query.partnerId = this.assertValidRefId('partnerId', filter.partnerId);
    }
    if (filter.serviceId !== undefined) {
      query.serviceId = this.assertValidRefId('serviceId', filter.serviceId);
    }
    if (filter.isActive !== undefined) {
      query.isActive = filter.isActive;
    }

    return this.partnerServiceModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** POST /partner-services/me — partnerId comes from the token. */
  async createForPartner(
    partnerId: string,
    dto: CreateMyPartnerServiceDto,
  ): Promise<PartnerService> {
    return this.create({ ...dto, partnerId });
  }

  /** GET /partner-services/me — the partner's own offerings. */
  async findAllForPartner(
    partnerId: string,
    isActive?: boolean,
  ): Promise<PartnerService[]> {
    return this.findAll({ partnerId, isActive });
  }

  /**
   * PATCH /partner-services/me/:id. Scoped by partnerId in the filter so one
   * partner cannot toggle another's row, and so a row owned by someone else
   * reads as "not found" rather than "forbidden".
   */
  async updateForPartner(
    partnerId: string,
    id: string,
    dto: UpdatePartnerServiceDto,
  ): Promise<PartnerService> {
    this.assertValidId(id);

    const updated = await this.partnerServiceModel
      .findOneAndUpdate({ _id: id, partnerId }, dto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Partner service ${id} not found`);
    }
    return updated;
  }

  async findOne(id: string): Promise<PartnerService> {
    this.assertValidId(id);
    const row = await this.partnerServiceModel.findById(id).exec();

    if (!row) {
      throw new NotFoundException(`Partner service ${id} not found`);
    }
    return row;
  }

  async update(
    id: string,
    dto: UpdatePartnerServiceDto,
  ): Promise<PartnerService> {
    this.assertValidId(id);

    const updated = await this.partnerServiceModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Partner service ${id} not found`);
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    const result = await this.partnerServiceModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Partner service ${id} not found`);
    }
  }

  /** Drops every partner service row. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.partnerServiceModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /**
   * A join row is only meaningful if both sides exist, and a dangling one
   * would hand assignment a partner or service it cannot resolve.
   */
  private async assertRefsExist(
    partnerId: string,
    serviceId: string,
  ): Promise<void> {
    const [partner, service] = await Promise.all([
      this.partnerModel.exists({ _id: partnerId }).exec(),
      this.serviceModel.exists({ _id: serviceId }).exec(),
    ]);

    if (!partner) {
      throw new BadRequestException(`Partner ${partnerId} not found`);
    }
    if (!service) {
      throw new BadRequestException(`Service ${serviceId} not found`);
    }
  }

  private assertValidRefId(field: string, id: string): string {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`${field} ${id} is not valid`);
    }
    return id;
  }

  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Partner service ${id} not found`);
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
