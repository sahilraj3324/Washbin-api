import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import { CreateAddressDto } from './dto/create-address.dto';
import { CreateMyAddressDto } from './dto/create-my-address.dto';
import { UpdateMyAddressDto } from './dto/update-my-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { Address, AddressDocument } from './schemas/address.schema';
import type { AddressLabel } from './schemas/address.schema';

const DUPLICATE_KEY = 11000;

export interface FindAllAddressesFilter {
  customerId?: string;
  label?: AddressLabel;
}

@Injectable()
export class AddressesService {
  constructor(
    @InjectModel(Address.name)
    private readonly addressModel: Model<Address>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
  ) {}

  async create(dto: CreateAddressDto): Promise<Address> {
    await this.assertCustomerExists(dto.customerId);

    const existing = await this.addressModel
      .countDocuments({ customerId: dto.customerId })
      .exec();

    // The first address is the default whatever the body says, so checkout
    // always has one to preselect.
    const isDefault = dto.isDefault === true || existing === 0;

    // Demote before inserting: the partial unique index rejects a second
    // isDefault:true row for the customer.
    if (isDefault) {
      await this.clearDefault(dto.customerId);
    }

    return this.addressModel.create({ ...dto, isDefault });
  }

  /** The address book, and admin lookups by customer or label. */
  async findAll(filter: FindAllAddressesFilter = {}): Promise<Address[]> {
    const query: FilterQuery<Address> = {};

    if (filter.customerId !== undefined) {
      if (!isValidObjectId(filter.customerId)) {
        throw new BadRequestException(
          `customerId ${filter.customerId} is not valid`,
        );
      }
      query.customerId = filter.customerId;
    }
    if (filter.label !== undefined) {
      query.label = filter.label;
    }

    // Default first, then newest, which is the order the picker shows.
    return this.addressModel
      .find(query)
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();
  }

  /** POST /addresses/me — customerId comes from the token. */
  async createForCustomer(
    customerId: string,
    dto: CreateMyAddressDto,
  ): Promise<Address> {
    return this.create({ ...dto, customerId });
  }

  /** GET /addresses/me — the customer's address book. */
  async findAllForCustomer(customerId: string): Promise<Address[]> {
    return this.findAll({ customerId });
  }

  /**
   * PATCH /addresses/me/:id. Ownership is part of the lookup, so one customer
   * cannot edit another's address and a row they do not own reads as "not
   * found" rather than "forbidden".
   */
  async updateForCustomer(
    customerId: string,
    id: string,
    dto: UpdateMyAddressDto,
  ): Promise<Address> {
    const address = await this.loadOwned(customerId, id);

    if (dto.isDefault === true) {
      await this.clearDefault(customerId, address._id);
    }

    if (dto.isDefault === false && address.isDefault) {
      throw new BadRequestException(
        'Set another address as the default instead of clearing this one',
      );
    }

    address.set(dto);

    try {
      return await address.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('You already have a default address');
      }
      throw error;
    }
  }

  /** DELETE /addresses/me/:id, scoped the same way. */
  async removeForCustomer(customerId: string, id: string): Promise<void> {
    const address = await this.loadOwned(customerId, id);
    await address.deleteOne();

    if (address.isDefault) {
      await this.promoteNewest(customerId);
    }
  }

  async findOne(id: string): Promise<Address> {
    return this.loadOne(id);
  }

  async update(id: string, dto: UpdateAddressDto): Promise<Address> {
    const address = await this.loadOne(id);

    if (dto.customerId !== undefined) {
      await this.assertCustomerExists(dto.customerId);
    }

    if (dto.isDefault === true) {
      await this.clearDefault(address.customerId.toString(), address._id);
    }

    // Letting the only default be switched off would leave checkout with
    // nothing preselected; promoting another address is the way to move it.
    if (dto.isDefault === false && address.isDefault) {
      throw new BadRequestException(
        'Set another address as the default instead of clearing this one',
      );
    }

    // Saved through the document, not findByIdAndUpdate, so the pre-validate
    // hook rebuilds `location` whenever the coordinates move.
    address.set(dto);

    try {
      return await address.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'That customer already has a default address',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const address = await this.loadOne(id);
    await this.addressModel.findByIdAndDelete(id).exec();

    if (address.isDefault) {
      await this.promoteNewest(address.customerId.toString());
    }
  }

  /** Drops every address document. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.addressModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /** Takes the default off whichever row currently holds it. */
  private async clearDefault(
    customerId: string,
    exceptId?: Types.ObjectId,
  ): Promise<void> {
    const filter: FilterQuery<Address> = { customerId, isDefault: true };

    if (exceptId) {
      filter._id = { $ne: exceptId };
    }

    await this.addressModel.updateMany(filter, { isDefault: false }).exec();
  }

  /** After deleting the default, the newest remaining address takes over. */
  private async promoteNewest(customerId: string): Promise<void> {
    const newest = await this.addressModel
      .findOne({ customerId })
      .sort({ createdAt: -1 })
      .exec();

    if (newest) {
      newest.isDefault = true;
      await newest.save();
    }
  }

  private async assertCustomerExists(customerId: string): Promise<void> {
    const exists = await this.customerModel.exists({ _id: customerId }).exec();

    if (!exists) {
      throw new BadRequestException(`Customer ${customerId} not found`);
    }
  }

  /** Looks an address up by id and owner together, never by id alone. */
  private async loadOwned(
    customerId: string,
    id: string,
  ): Promise<AddressDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Address ${id} not found`);
    }

    const address = await this.addressModel
      .findOne({ _id: id, customerId })
      .exec();

    if (!address) {
      throw new NotFoundException(`Address ${id} not found`);
    }
    return address;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === DUPLICATE_KEY
    );
  }

  private async loadOne(id: string): Promise<AddressDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Address ${id} not found`);
    }

    const address = await this.addressModel.findById(id).exec();

    if (!address) {
      throw new NotFoundException(`Address ${id} not found`);
    }
    return address;
  }
}
