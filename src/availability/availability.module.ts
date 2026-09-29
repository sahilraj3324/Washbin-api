import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PartnerAuthModule } from '../partner-auth/partner-auth.module';
import {
  PartnerService,
  PartnerServiceSchema,
} from '../partner-services/schemas/partner-service.schema';
import { Partner, PartnerSchema } from '../partners/partner.schema';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import {
  PartnerAvailability,
  PartnerAvailabilitySchema,
} from './schemas/partner-availability.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PartnerAvailability.name, schema: PartnerAvailabilitySchema },
      // Registered here so a row is only created for a partner that exists.
      { name: Partner.name, schema: PartnerSchema },
      // Used to ensure a partner has at least one active offering before they
      // can make themselves eligible for matching.
      { name: PartnerService.name, schema: PartnerServiceSchema },
    ]),
    // Provides PartnerAuthGuard for the /me routes.
    PartnerAuthModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  // Exported for partner-assignment, which needs findAvailableNear.
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
