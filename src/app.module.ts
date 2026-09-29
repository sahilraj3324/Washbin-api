import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AddressesModule } from './addresses/addresses.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { DatabaseModule } from './database/database.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomerAuthModule } from './customer-auth/customer-auth.module';
import { CustomersModule } from './customers/customers.module';
import { PartnerAuthModule } from './partner-auth/partner-auth.module';
import { PartnerAssignmentModule } from './partner-assignment/partner-assignment.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PartnerServicesModule } from './partner-services/partner-services.module';
import { PartnersModule } from './partners/partners.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    CustomersModule,
    CustomerAuthModule,
    PartnersModule,
    PartnerAuthModule,
    CategoriesModule,
    ServicesModule,
    PartnerServicesModule,
    AddressesModule,
    AvailabilityModule,
    BookingsModule,
    PartnerAssignmentModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
