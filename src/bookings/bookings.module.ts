import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AddressesModule } from '../addresses/addresses.module';
import { Address, AddressSchema } from '../addresses/schemas/address.schema';
import { AvailabilityModule } from '../availability/availability.module';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { PartnerAuthModule } from '../partner-auth/partner-auth.module';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { PartnerAssignmentModule } from '../partner-assignment/partner-assignment.module';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { BookingExecutionController } from './booking-execution.controller';
import { BookingExecutionService } from './booking-execution.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Booking, BookingSchema } from './schemas/booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      // Registered for the create-time validations.
      { name: Customer.name, schema: CustomerSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: Address.name, schema: AddressSchema },
    ]),
    // Provides CustomerAuthGuard.
    CustomerAuthModule,
    // Provides PartnerAuthGuard for the execution routes.
    PartnerAuthModule,
    AvailabilityModule,
    // Provides OperationalAreasService for the serviceability check.
    AddressesModule,
    // forwardRef: see the note on the constructor in BookingsService.
    forwardRef(() => PartnerAssignmentModule),
  ],
  controllers: [BookingsController, BookingExecutionController],
  providers: [BookingsService, BookingExecutionService],
  // Exported for partner-assignment, which drives transitionTo.
  exports: [BookingsService, BookingExecutionService],
})
export class BookingsModule {}
