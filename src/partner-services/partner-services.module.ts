import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PartnerAuthModule } from '../partner-auth/partner-auth.module';
import { Partner, PartnerSchema } from '../partners/partner.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { PartnerServicesController } from './partner-services.controller';
import { PartnerServicesService } from './partner-services.service';
import {
  PartnerService,
  PartnerServiceSchema,
} from './schemas/partner-service.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PartnerService.name, schema: PartnerServiceSchema },
      // Registered here so create can verify both sides of the join exist.
      { name: Partner.name, schema: PartnerSchema },
      { name: Service.name, schema: ServiceSchema },
    ]),
    // Provides PartnerAuthGuard for the /me routes.
    PartnerAuthModule,
  ],
  controllers: [PartnerServicesController],
  providers: [PartnerServicesService],
  exports: [PartnerServicesService],
})
export class PartnerServicesModule {}
