import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingsModule } from '../bookings/bookings.module';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { PartnerAuthModule } from '../partner-auth/partner-auth.module';
import {
  PartnerService,
  PartnerServiceSchema,
} from '../partner-services/schemas/partner-service.schema';
import { Partner, PartnerSchema } from '../partners/partner.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { MatchingService } from './matching.service';
import { PartnerAssignmentController } from './partner-assignment.controller';
import { PartnerAssignmentService } from './partner-assignment.service';
import {
  PartnerAssignment,
  PartnerAssignmentSchema,
} from './schemas/partner-assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PartnerAssignment.name, schema: PartnerAssignmentSchema },
      // Read directly by the matching funnel.
      { name: Booking.name, schema: BookingSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Partner.name, schema: PartnerSchema },
      { name: PartnerService.name, schema: PartnerServiceSchema },
      { name: Service.name, schema: ServiceSchema },
    ]),
    AvailabilityModule,
    PartnerAuthModule,
    // forwardRef because bookings triggers matching while matching drives
    // booking status: the two modules genuinely depend on each other.
    forwardRef(() => BookingsModule),
  ],
  controllers: [PartnerAssignmentController],
  providers: [MatchingService, PartnerAssignmentService],
  exports: [PartnerAssignmentService, MatchingService],
})
export class PartnerAssignmentModule {}
