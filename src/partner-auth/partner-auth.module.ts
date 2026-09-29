import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FirebaseModule } from '../firebase/firebase.module';
import { PartnersModule } from '../partners/partners.module';
import { PartnerAuthController } from './partner-auth.controller';
import { PartnerAuthGuard } from './partner-auth.guard';
import { PartnerAuthService } from './partner-auth.service';

@Module({
  imports: [
    // forwardRef on both sides: partners imports this module for the guard.
    forwardRef(() => PartnersModule),
    FirebaseModule,
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
            // Seconds, so the value needs no `ms` string-format parsing.
            expiresIn: Number(
              config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? 604800,
            ),
          },
        };
      },
    }),
  ],
  controllers: [PartnerAuthController],
  providers: [PartnerAuthService, PartnerAuthGuard],
  // JwtModule is re-exported because @UseGuards(PartnerAuthGuard) in another
  // module instantiates the guard in that module's injector, where JwtService
  // would otherwise be missing.
  exports: [PartnerAuthService, PartnerAuthGuard, JwtModule],
})
export class PartnerAuthModule {}
