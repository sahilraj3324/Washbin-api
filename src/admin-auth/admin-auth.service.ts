import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminService } from '../admin/admin.service';
import { AdminDocument } from '../admin/admin.schema';

export interface AdminLoginResult {
  accessToken: string;
  id: string;
  name: string;
  email: string;
  role: string;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminService: AdminService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<AdminLoginResult> {
    const admin = await this.adminService.findByEmail(email);

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const passwordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createLoginResult(admin);
  }

  async getProfile(adminId: string): Promise<AdminLoginResult> {
    const admin = await this.adminService.findById(adminId);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin not found');
    }
    return this.createLoginResult(admin);
  }

  private async createLoginResult(
    admin: AdminDocument,
  ): Promise<AdminLoginResult> {
    const id = admin._id.toString();

    const accessToken = await this.jwtService.signAsync({
      sub: id,
      type: 'admin',
      email: admin.email,
      role: admin.role,
    });

    return {
      accessToken,
      id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    };
  }
}
