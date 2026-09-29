import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CustomersModule } from '../customers/customers.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerAuthService } from './customer-auth.service';

@Module({
  imports: [
    CustomersModule,
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
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerAuthGuard],
  // JwtModule is re-exported because @UseGuards(CustomerAuthGuard) in another
  // module instantiates the guard in that module's injector, where JwtService
  // would otherwise be missing.
  exports: [CustomerAuthService, CustomerAuthGuard, JwtModule],
})
export class CustomerAuthModule {}
