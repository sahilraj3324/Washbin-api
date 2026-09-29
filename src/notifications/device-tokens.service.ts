import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserPrincipal } from '../common/user-principal';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { DeviceToken } from './schemas/device-token.schema';

@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger(DeviceTokensService.name);

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceToken>,
  ) {}

  /**
   * Registers or refreshes a device.
   *
   * Upserted on the token, which is the device's identity. That covers the
   * handover case: if someone else signs in on a device the row is moved to
   * the new owner rather than leaving the previous user receiving that
   * device's pushes.
   */
  async register(
    user: UserPrincipal,
    dto: RegisterDeviceTokenDto,
  ): Promise<DeviceToken> {
    return this.deviceTokenModel
      .findOneAndUpdate(
        { token: dto.token },
        {
          userId: user.id,
          userType: user.userType,
          platform: dto.platform,
          isActive: true,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  /** Sign-out. Retired rather than deleted, so the history stays readable. */
  async deactivate(user: UserPrincipal, token: string): Promise<void> {
    const result = await this.deviceTokenModel
      .findOneAndUpdate(
        { token, userId: user.id, userType: user.userType },
        { isActive: false },
        { new: true },
      )
      .exec();

    if (!result) {
      throw new NotFoundException('Device token not found');
    }
  }

  /** The live tokens a push should go to. */
  async findActiveTokens(userId: string, userType: string): Promise<string[]> {
    const rows = await this.deviceTokenModel
      .find({ userId, userType, isActive: true })
      .select('token')
      .exec();

    return rows.map((row) => row.token);
  }

  /** Stamps the devices a push actually reached. */
  async markUsed(tokens: string[]): Promise<void> {
    if (!tokens.length) {
      return;
    }

    await this.deviceTokenModel
      .updateMany({ token: { $in: tokens } }, { lastUsedAt: new Date() })
      .exec();
  }

  /**
   * Retires tokens FCM reported as dead. Without this, uninstalled apps
   * accumulate and every send wastes a slot on them.
   */
  async deactivateInvalid(tokens: string[]): Promise<number> {
    if (!tokens.length) {
      return 0;
    }

    const result = await this.deviceTokenModel
      .updateMany({ token: { $in: tokens } }, { isActive: false })
      .exec();

    if (result.modifiedCount) {
      this.logger.log(`Retired ${result.modifiedCount} dead device token(s)`);
    }
    return result.modifiedCount;
  }
}
