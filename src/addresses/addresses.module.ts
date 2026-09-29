import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Service, ServiceSchema } from '../services/schemas/service.schema';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { OperationalAreasController } from './operational-areas.controller';
import { OperationalAreasService } from './operational-areas.service';
import { Address, AddressSchema } from './schemas/address.schema';
import {
  OperationalArea,
  OperationalAreaSchema,
} from './schemas/operational-area.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Address.name, schema: AddressSchema },
      // Registered here so create/update can verify the customer exists.
      { name: Customer.name, schema: CustomerSchema },
      { name: OperationalArea.name, schema: OperationalAreaSchema },
      // Serviceability rejects an unknown or inactive service.
      { name: Service.name, schema: ServiceSchema },
    ]),
    // Provides CustomerAuthGuard for the /me routes.
    CustomerAuthModule,
  ],
  controllers: [AddressesController, OperationalAreasController],
  providers: [AddressesService, OperationalAreasService],
  exports: [AddressesService, OperationalAreasService],
})
export class AddressesModule {}
