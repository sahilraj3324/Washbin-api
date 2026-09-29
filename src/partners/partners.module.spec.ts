import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { PartnerService } from '../partner-services/schemas/partner-service.schema';
import { Partner } from './partner.schema';
import { PartnersController } from './partners.controller';
import { PartnersModule } from './partners.module';
import { PartnersService } from './partners.service';

/**
 * The /me routes put PartnerAuthGuard on PartnersController, which makes
 * partners <-> partner-auth a module cycle. A cycle with forwardRef on only
 * one side resolves or fails depending on module load order, and `tsc` sees
 * nothing wrong either way — so the graph is compiled here rather than
 * discovered at boot.
 */
describe('PartnersModule', () => {
  it('resolves the partners <-> partner-auth cycle', async () => {
    process.env.JWT_SECRET ??= 'test-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PartnersModule],
    })
      // Stand in for the Mongoose models so no database is needed; nothing
      // here calls them.
      .overrideProvider(getModelToken(Partner.name))
      .useValue({})
      .overrideProvider(getModelToken(PartnerService.name))
      .useValue({})
      .compile();

    expect(moduleRef.get(PartnersService)).toBeInstanceOf(PartnersService);
    expect(moduleRef.get(PartnersController)).toBeInstanceOf(
      PartnersController,
    );

    await moduleRef.close();
  });
});
