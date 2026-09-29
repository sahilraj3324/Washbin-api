import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnyUserAuthGuard } from '../common/any-user-auth.guard';
// Imported for its re-exported JwtModule: customer and partner tokens are
// signed with the same secret, so one JwtService verifies both.
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { BookingEventsListener } from './booking-events.listener';
import { DeviceTokensService } from './device-tokens.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { DeviceToken, DeviceTokenSchema } from './schemas/device-token.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),
    FirebaseModule,
    CustomerAuthModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    DeviceTokensService,
    PushService,
    BookingEventsListener,
    AnyUserAuthGuard,
  ],
  exports: [NotificationsService, DeviceTokensService],
})
export class NotificationsModule {}
