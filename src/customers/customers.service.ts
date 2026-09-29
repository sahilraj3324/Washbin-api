import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Customer } from './customer.schema';

const DUPLICATE_KEY = 11000;

export interface CreateCustomerInput {
  authUserId: string;
  name: string;
  phone: string;
  email?: string;
  profileImage?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
  ) {}

  async create(input: CreateCustomerInput): Promise<Customer> {
    try {
      return await this.customerModel.create(input);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A customer with that phone, email or authUserId already exists',
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<Customer[]> {
    return this.customerModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Customer> {
    this.assertValidId(id);
    const customer = await this.customerModel.findById(id).exec();

    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    this.assertValidId(id);

    try {
      const updated = await this.customerModel
        .findByIdAndUpdate(id, input, { new: true, runValidators: true })
        .exec();

      if (!updated) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A customer with that phone, email or authUserId already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    const result = await this.customerModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
  }

  /** Drops every customer document. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.customerModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /**
   * Looks a customer up the way sign-in does. The uid is checked first because
   * it is the account's real key; phone is the fallback so a customer created
   * before this device ever saw Firebase still resolves to one account rather
   * than a duplicate.
   */
  async findByAuthUserIdOrPhone(
    authUserId: string,
    phone: string,
  ): Promise<Customer | null> {
    return this.customerModel
      .findOne({ $or: [{ authUserId }, { phone }] })
      .exec();
  }

  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Customer ${id} not found`);
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
