import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from './admin.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<Admin>,
  ) {}

  async findByEmail(email: string): Promise<AdminDocument | null> {
    return this.adminModel.findOne({ email: email.toLowerCase().trim() });
  }

  async findById(id: string): Promise<AdminDocument | null> {
    return this.adminModel.findById(id);
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role?: Admin['role'];
  }): Promise<AdminDocument> {
    return this.adminModel.create({
      ...data,
      email: data.email.toLowerCase().trim(),
    });
  }

  async count(): Promise<number> {
    return this.adminModel.countDocuments();
  }
}
