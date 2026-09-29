import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { UserPrincipal, UserType } from '../common/user-principal';
import { DeviceTokensService } from './device-tokens.service';
import { PushService } from './push.service';
import { Notification } from './schemas/notification.schema';

export interface NotifyInput {
  userId: string;
  userType: UserType;
  type: string;
  title: string;
  body: string;
  bookingId?: string;
  data?: Record<string, string>;
}

export interface FindNotificationsFilter {
  isRead?: boolean;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly deviceTokensService: DeviceTokensService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Stores the notification, then tries to push it.
   *
   * Storing first is what keeps the database the source of truth: if FCM is
   * down or the user has no device registered, the notification is still in
   * their inbox next time the app asks.
   */
  async notify(input: NotifyInput): Promise<Notification> {
    const notification = await this.notificationModel.create({
      userId: input.userId,
      userType: input.userType,
      type: input.type,
      title: input.title,
      body: input.body,
      bookingId: input.bookingId,
      data: input.data,
      isRead: false,
    });

    await this.push(input, notification._id.toString());
    return notification;
  }

  async findAllForUser(
    user: UserPrincipal,
    filter: FindNotificationsFilter = {},
  ): Promise<Notification[]> {
    const query: FilterQuery<Notification> = {
      userId: user.id,
      userType: user.userType,
    };

    if (filter.isRead !== undefined) {
      query.isRead = filter.isRead;
    }

    return this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
      .exec();
  }

  async countUnread(user: UserPrincipal): Promise<{ unread: number }> {
    const unread = await this.notificationModel
      .countDocuments({
        userId: user.id,
        userType: user.userType,
        isRead: false,
      })
      .exec();

    return { unread };
  }

  /** Ownership is part of the filter, so another user's row reads as 404. */
  async markRead(user: UserPrincipal, id: string): Promise<Notification> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    const updated = await this.notificationModel
      .findOneAndUpdate(
        { _id: id, userId: user.id, userType: user.userType },
        { isRead: true },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return updated;
  }

  async markAllRead(user: UserPrincipal): Promise<{ updated: number }> {
    const result = await this.notificationModel
      .updateMany(
        { userId: user.id, userType: user.userType, isRead: false },
        { isRead: true },
      )
      .exec();

    return { updated: result.modifiedCount };
  }

  /**
   * Best-effort delivery. A push failure never fails the caller, because the
   * notification is already stored.
   */
  private async push(
    input: NotifyInput,
    notificationId: string,
  ): Promise<void> {
    try {
      const tokens = await this.deviceTokensService.findActiveTokens(
        input.userId,
        input.userType,
      );

      if (!tokens.length) {
        return;
      }

      const result = await this.pushService.send(tokens, {
        title: input.title,
        body: input.body,
        data: {
          // Every value must be a string for FCM.
          notificationId,
          type: input.type,
          ...(input.bookingId ? { bookingId: input.bookingId } : {}),
          ...input.data,
        },
      });

      const delivered = tokens.filter(
        (token) => !result.invalidTokens.includes(token),
      );

      await Promise.all([
        this.deviceTokensService.markUsed(delivered),
        this.deviceTokensService.deactivateInvalid(result.invalidTokens),
      ]);
    } catch (error) {
      this.logger.error(
        `Push for notification ${notificationId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
