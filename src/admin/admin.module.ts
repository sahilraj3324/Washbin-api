import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { CustomersModule } from '../customers/customers.module';
import { ServicesModule } from '../services/services.module';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { Admin, AdminSchema } from './admin.schema';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCustomersController } from './admin-customers.controller';
import { AdminServicesController } from './admin-services.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is not defined');
        return { secret };
      },
    }),
    CustomersModule,
    CategoriesModule,
    ServicesModule,
  ],
  controllers: [
    AdminCustomersController,
    AdminCategoriesController,
    AdminServicesController,
  ],
  providers: [AdminService, AdminAuthGuard],
  exports: [AdminService],
})
export class AdminModule {}
