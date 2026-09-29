import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { isValidObjectId, Model, UpdateQuery } from 'mongoose';
import { AvailabilityService } from '../availability/availability.service';
import {
  BookingStatus,
  canTransition,
  STATUS_TIMESTAMP_FIELD,
} from './booking-status';
import { STATUS_EVENT } from '../notifications/booking-events';
import { Booking, BookingDocument } from './schemas/booking.schema';

/** How long the arrival code stays good for. */
const OTP_TTL_MINUTES = 60;
const MS_PER_MINUTE = 60_000;
const ACTIVE_EXECUTION_STATUSES: readonly BookingStatus[] = [
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
];
const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 100;
const RECENT_DASHBOARD_JOBS = 5;
const DASHBOARD_UPCOMING_STATUSES: readonly BookingStatus[] = [
  'partner_assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
];

export interface PartnerHistoryOptions {
  status?: Extract<BookingStatus, 'completed' | 'cancelled'>;
  limit?: number;
  skip?: number;
}

export interface PartnerDashboardPeriod {
  completedJobs: number;
  upcomingJobs: number;
  cancelledJobs: number;
  earnings: number;
}

export interface PartnerDashboardEarnings {
  today: number;
  week: number;
  month: number;
  currency: string;
}

export interface PartnerDashboard {
  asOf: Date;
  today: PartnerDashboardPeriod;
  earnings: PartnerDashboardEarnings;
  activeJob: Booking | null;
  recentJobs: Booking[];
}

@Injectable()
export class BookingExecutionService {
  private readonly logger = new Logger(BookingExecutionService.name);

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    private readonly availabilityService: AvailabilityService,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  async findActiveForPartner(partnerId: string): Promise<Booking | null> {
    const booking = await this.bookingModel
      .findOne({
        assignedPartnerId: partnerId,
        status: { $in: ACTIVE_EXECUTION_STATUSES },
      })
      .sort({ updatedAt: -1 })
      .populate(this.partnerPopulate())
      .exec();

    return booking ? this.forPartner(booking) : null;
  }

  async findHistoryForPartner(
    partnerId: string,
    options: PartnerHistoryOptions = {},
  ): Promise<Booking[]> {
    const status = options.status;
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_HISTORY_LIMIT, 1),
      MAX_HISTORY_LIMIT,
    );
    const skip = Math.max(options.skip ?? 0, 0);

    const rows = await this.bookingModel
      .find({
        assignedPartnerId: partnerId,
        status: status ?? { $in: ['completed', 'cancelled'] },
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(this.partnerPopulate())
      .exec();

    return rows.map((booking) => this.forPartner(booking));
  }

  async dashboardForPartner(partnerId: string): Promise<PartnerDashboard> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = addDays(todayStart, 1);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const [
      completedToday,
      cancelledToday,
      upcomingToday,
      completedThisMonth,
      activeJob,
      recentJobs,
    ] = await Promise.all([
      this.bookingModel.countDocuments({
        assignedPartnerId: partnerId,
        status: 'completed',
        completedAt: { $gte: todayStart, $lt: todayEnd },
      }),
      this.bookingModel.countDocuments({
        assignedPartnerId: partnerId,
        status: 'cancelled',
        cancelledAt: { $gte: todayStart, $lt: todayEnd },
      }),
      this.bookingModel.countDocuments({
        assignedPartnerId: partnerId,
        status: { $in: DASHBOARD_UPCOMING_STATUSES },
        bookingType: 'scheduled',
        scheduledAt: { $gte: now, $lt: todayEnd },
      }),
      this.bookingModel
        .find({
          assignedPartnerId: partnerId,
          status: 'completed',
          completedAt: { $gte: monthStart },
        })
        .select('price completedAt')
        .lean()
        .exec(),
      this.findActiveForPartner(partnerId),
      this.bookingModel
        .find({
          assignedPartnerId: partnerId,
          status: {
            $in: [
              ...DASHBOARD_UPCOMING_STATUSES,
              'completed',
              'cancelled',
            ],
          },
        })
        .sort({ updatedAt: -1 })
        .limit(RECENT_DASHBOARD_JOBS)
        .populate(this.partnerPopulate())
        .exec(),
    ]);

    const monthCompleted = completedThisMonth.filter(
      (booking) => booking.completedAt instanceof Date,
    );
    const todayCompleted = monthCompleted.filter(
      (booking) =>
        booking.completedAt! >= todayStart && booking.completedAt! < todayEnd,
    );
    const weekCompleted = monthCompleted.filter(
      (booking) => booking.completedAt! >= weekStart,
    );
    const todayEarnings = sumEarnings(todayCompleted);
    const currency =
      monthCompleted.find((booking) => booking.price?.currency)?.price
        ?.currency ?? 'INR';

    return {
      asOf: now,
      today: {
        completedJobs: completedToday,
        upcomingJobs: upcomingToday,
        cancelledJobs: cancelledToday,
        earnings: todayEarnings,
      },
      earnings: {
        today: todayEarnings,
        week: sumEarnings(weekCompleted),
        month: sumEarnings(monthCompleted),
        currency,
      },
      activeJob,
      recentJobs: recentJobs.map((booking) => this.forPartner(booking)),
    };
  }

  /** accepted -> on_the_way */
  async markOnTheWay(partnerId: string, bookingId: string): Promise<Booking> {
    return this.advance(partnerId, bookingId, 'accepted', 'on_the_way');
  }

  /**
   * on_the_way -> arrived, minting the start code in the same write so a
   * retry cannot mint a second one.
   */
  async markArrived(partnerId: string, bookingId: string): Promise<Booking> {
    return this.advance(partnerId, bookingId, 'on_the_way', 'arrived', {
      serviceStartOtp: this.generateOtp(),
      serviceStartOtpExpiresAt: new Date(
        Date.now() + OTP_TTL_MINUTES * MS_PER_MINUTE,
      ),
    });
  }

  /**
   * arrived -> in_progress without a code.
   *
   * Refused when SERVICE_START_OTP_REQUIRED is on, otherwise this route would
   * be a way around the arrival check.
   */
  async startService(partnerId: string, bookingId: string): Promise<Booking> {
    if (this.otpRequired()) {
      throw new ConflictException(
        'This booking must be started with the customer’s code. Use verify-start-otp.',
      );
    }

    return this.advance(partnerId, bookingId, 'arrived', 'in_progress', {
      // The code is spent either way, so it cannot be reused later.
      $unset: { serviceStartOtp: 1, serviceStartOtpExpiresAt: 1 },
    });
  }

  /**
   * arrived -> in_progress, proving the partner is standing with the customer.
   *
   * The code is part of the update filter, so checking it and spending it are
   * one operation and two racing attempts cannot both succeed.
   */
  async verifyStartOtp(
    partnerId: string,
    bookingId: string,
    otp: string,
  ): Promise<Booking> {
    this.assertValidId(bookingId);

    const updated = await this.bookingModel
      .findOneAndUpdate(
        {
          _id: bookingId,
          assignedPartnerId: partnerId,
          status: 'arrived',
          serviceStartOtp: otp,
          serviceStartOtpExpiresAt: { $gt: new Date() },
        },
        {
          status: 'in_progress',
          startedAt: new Date(),
          $unset: { serviceStartOtp: 1, serviceStartOtpExpiresAt: 1 },
        },
        { new: true },
      )
      .populate(this.partnerPopulate())
      .exec();

    if (updated) {
      this.publish('in_progress', updated);
      return this.forPartner(updated);
    }

    // Nothing matched, so work out whether it was the code or the state.
    const booking = await this.loadOwned(partnerId, bookingId);

    if (booking.status !== 'arrived') {
      throw new ConflictException(
        `A booking that is ${booking.status} cannot be started`,
      );
    }
    if (
      booking.serviceStartOtpExpiresAt &&
      booking.serviceStartOtpExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('That code has expired');
    }
    throw new BadRequestException('That code is not correct');
  }

  /** in_progress -> completed */
  async completeService(
    partnerId: string,
    bookingId: string,
  ): Promise<Booking> {
    const booking = await this.advance(
      partnerId,
      bookingId,
      'in_progress',
      'completed',
    );
    await this.availabilityService.markAvailableAfterCompletedJob(partnerId);
    return booking;
  }

  /**
   * One guarded write per transition.
   *
   * The expected status, the booking id and the assigned partner all sit in
   * the filter, so a second request racing the first matches nothing and is
   * rejected rather than double-stamping a timestamp or re-firing an event.
   */
  private async advance(
    partnerId: string,
    bookingId: string,
    from: BookingStatus,
    to: BookingStatus,
    extra: UpdateQuery<Booking> = {},
  ): Promise<Booking> {
    this.assertValidId(bookingId);

    const stamp = STATUS_TIMESTAMP_FIELD[to];
    const updated = await this.bookingModel
      .findOneAndUpdate(
        { _id: bookingId, assignedPartnerId: partnerId, status: from },
        {
          status: to,
          ...(stamp ? { [stamp]: new Date() } : {}),
          ...extra,
        },
        { new: true },
      )
      .populate(this.partnerPopulate())
      .exec();

    if (updated) {
      this.publish(to, updated);
      return this.forPartner(updated);
    }

    return this.explainFailure(partnerId, bookingId, from, to);
  }

  /** Always throws; exists so the caller gets a useful reason, not a 404. */
  private async explainFailure(
    partnerId: string,
    bookingId: string,
    from: BookingStatus,
    to: BookingStatus,
  ): Promise<never> {
    const booking = await this.loadOwned(partnerId, bookingId);

    if (booking.status === from) {
      // Matched the filter now but not a moment ago: another request won.
      throw new ConflictException(
        'That booking was just updated by another request. Try again.',
      );
    }

    if (!canTransition(booking.status, to)) {
      throw new ConflictException(
        `A booking that is ${booking.status} cannot move to ${to}`,
      );
    }

    throw new ConflictException(
      `That booking is ${booking.status}, not ${from}`,
    );
  }

  private async loadOwned(
    partnerId: string,
    bookingId: string,
  ): Promise<BookingDocument> {
    const booking = await this.bookingModel.findById(bookingId).exec();

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // A partner who was offered this booking knows it exists, so saying
    // "not yours" is clearer than pretending it is missing.
    if (booking.assignedPartnerId?.toString() !== partnerId) {
      throw new ForbiddenException('That booking is not assigned to you');
    }
    return booking;
  }

  private publish(status: BookingStatus, booking: BookingDocument): void {
    const event = STATUS_EVENT[status];

    if (!event) {
      return;
    }

    this.eventEmitter.emit(event, {
      bookingId: booking._id.toString(),
      customerId: booking.customerId.toString(),
      partnerId: booking.assignedPartnerId?.toString(),
    });
  }

  /**
   * The start code must never reach the partner: they are supposed to get it
   * from the customer in person, which is the whole point of it.
   */
  private forPartner(booking: BookingDocument): Booking {
    const plain = booking.toObject() as Booking;

    delete plain.serviceStartOtp;
    delete plain.serviceStartOtpExpiresAt;
    return plain;
  }

  private partnerPopulate() {
    return [
      {
        path: 'customerId',
        select: 'name phone profileImage',
      },
      {
        path: 'serviceId',
        select:
          'name pricingType basePrice estimatedDurationMinutes iconUrl imageUrl',
      },
    ];
  }

  private otpRequired(): boolean {
    return this.config.get<string>('SERVICE_START_OTP_REQUIRED') === 'true';
  }

  private generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private assertValidId(bookingId: string): void {
    if (!isValidObjectId(bookingId)) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }
  }
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeek(value: Date): Date {
  const dayStart = startOfDay(value);
  const day = dayStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(dayStart, mondayOffset);
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function sumEarnings(bookings: readonly Pick<Booking, 'price'>[]): number {
  return bookings.reduce((sum, booking) => {
    const price = booking.price;
    if (!price) {
      return sum;
    }
    return sum + (price.finalAmount ?? price.baseAmount ?? 0);
  }, 0);
}
