import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminModule } from '../admin/admin.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';

@Module({
  imports: [
    AdminModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not defined');
        }
        return {
          secret,
          signOptions: {
            expiresIn: Number(
              config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? 604800,
            ),
          },
        };
      },
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard],
  exports: [AdminAuthService, AdminAuthGuard, JwtModule],
})
export class AdminAuthModule {}
