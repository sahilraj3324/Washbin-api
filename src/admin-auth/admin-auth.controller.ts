import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import type { AdminTokenPayload } from './admin-auth.guard';
import { CurrentAdmin } from './current-admin.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';

@ApiTags('Admin Auth')
@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  async login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentAdmin() admin: AdminTokenPayload) {
    return this.adminAuthService.getProfile(admin.sub);
  }
}
