import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AnyUserAuthGuard } from '../common/any-user-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { UserPrincipal } from '../common/user-principal';
import { DeviceTokensService } from './device-tokens.service';
import { DeleteDeviceTokenDto } from './dto/delete-device-token.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsService } from './notifications.service';
import { DeviceToken } from './schemas/device-token.schema';
import { Notification } from './schemas/notification.schema';

/** Serves customers and partners alike; the token says which. */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AnyUserAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly deviceTokensService: DeviceTokensService,
  ) {}

  @Post('device-token')
  @ApiOperation({
    summary: 'Register or refresh this device for push',
    description:
      'Upserted on the token, so re-registering the same device updates it ' +
      'rather than creating a duplicate.',
  })
  registerDevice(
    @CurrentUser() user: UserPrincipal,
    @Body() dto: RegisterDeviceTokenDto,
  ): Promise<DeviceToken> {
    return this.deviceTokensService.register(user, dto);
  }

  @Delete('device-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Stop sending push to this device',
    description: 'Call on sign-out. The row is retired, not deleted.',
  })
  deleteDevice(
    @CurrentUser() user: UserPrincipal,
    @Body() dto: DeleteDeviceTokenDto,
  ): Promise<void> {
    return this.deviceTokensService.deactivate(user, dto.token);
  }

  @Get()
  @ApiOperation({ summary: "The signed-in user's notifications" })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: UserPrincipal,
    @Query('isRead', new ParseBoolPipe({ optional: true }))
    isRead?: boolean,
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
  ): Promise<Notification[]> {
    return this.notificationsService.findAllForUser(user, { isRead, limit });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count, for the app badge' })
  countUnread(@CurrentUser() user: UserPrincipal): Promise<{ unread: number }> {
    return this.notificationsService.countUnread(user);
  }

  // 'read-all' before ':id/read' so the param cannot swallow it.
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  markAllRead(
    @CurrentUser() user: UserPrincipal,
  ): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  markRead(
    @CurrentUser() user: UserPrincipal,
    @Param('id') id: string,
  ): Promise<Notification> {
    return this.notificationsService.markRead(user, id);
  }
}
