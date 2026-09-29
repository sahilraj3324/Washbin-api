import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PartnerAuthModule } from '../partner-auth/partner-auth.module';
import {
  PartnerService,
  PartnerServiceSchema,
} from '../partner-services/schemas/partner-service.schema';
import { Partner, PartnerSchema } from './partner.schema';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Partner.name, schema: PartnerSchema },
      // Registered here so submit-for-review can count the partner's chosen
      // services without depending on PartnerServicesModule.
      { name: PartnerService.name, schema: PartnerServiceSchema },
    ]),
    // Provides PartnerAuthGuard for the /me routes. forwardRef because
    // partner-auth needs PartnersService to sign a partner in, while partners
    // needs partner-auth's guard to let one through — see PartnerAuthService.
    forwardRef(() => PartnerAuthModule),
  ],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
