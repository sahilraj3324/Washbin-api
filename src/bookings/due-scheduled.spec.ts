import { BookingsService } from './bookings.service';

/** The shape of the filter under test, so the assertions are type-checked. */
interface DueFilter {
  bookingType: string;
  $or: [
    { status: string; scheduledAt: { $lte: Date; $gte?: Date } },
    { status: string; scheduledAt: { $lte: Date; $gte: Date } },
  ];
}

/**
 * The query that decides which scheduled bookings dispatch wakes.
 *
 * Asserted as the filter handed to Mongo rather than against a database: the
 * thing worth pinning here is the two time windows, which are easy to get
 * subtly wrong and impossible to notice in production until a customer's
 * booking never happens.
 */
describe('findDueScheduledIds', () => {
  const now = new Date('2026-09-13T12:00:00.000Z');

  function buildService(rows: { _id: { toString(): string } }[]) {
    const exec = jest.fn().mockResolvedValue(rows);
    const limit = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ select });

    const service = Object.create(BookingsService.prototype) as BookingsService;
    Object.assign(service, { bookingModel: { find } });

    const filterOf = (): DueFilter => {
      const [first] = find.mock.calls as [DueFilter][];
      return first[0];
    };

    return { service, find, select, sort, limit, filterOf };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks only for scheduled bookings', async () => {
    const { service, filterOf } = buildService([]);

    await service.findDueScheduledIds();

    expect(filterOf().bookingType).toBe('scheduled');
  });

  it('takes pending bookings from 30 minutes before their slot', async () => {
    const { service, filterOf } = buildService([]);

    await service.findDueScheduledIds();

    const [pending] = filterOf().$or;
    expect(pending.status).toBe('pending');
    // 12:00 now, so anything due by 12:30 is close enough to start looking.
    expect(pending.scheduledAt.$lte).toEqual(
      new Date('2026-09-13T12:30:00.000Z'),
    );
  });

  it('puts no lower bound on pending, so a missed booking is not stranded', async () => {
    // Dispatch being down for an hour must not permanently orphan the
    // bookings that fell inside it.
    const { service, filterOf } = buildService([]);

    await service.findDueScheduledIds();

    const [pending] = filterOf().$or;
    expect(pending.scheduledAt.$gte).toBeUndefined();
  });

  it('retries an empty search only while the slot is still near', async () => {
    const { service, filterOf } = buildService([]);

    await service.findDueScheduledIds();

    const [, retry] = filterOf().$or;
    expect(retry.status).toBe('no_partner_found');
    expect(retry.scheduledAt.$lte).toEqual(
      new Date('2026-09-13T12:30:00.000Z'),
    );
    // Bounded below, so a booking nobody can serve stops costing work.
    expect(retry.scheduledAt.$gte).toEqual(
      new Date('2026-09-13T11:30:00.000Z'),
    );
  });

  it('takes the most urgent first, and caps the batch', async () => {
    // One cron invocation has to finish inside a serverless time limit.
    const { service, sort, limit } = buildService([]);

    await service.findDueScheduledIds();

    expect(sort).toHaveBeenCalledWith({ scheduledAt: 1 });
    expect(limit).toHaveBeenCalledWith(50);
  });

  it('returns ids as strings', async () => {
    const { service } = buildService([
      { _id: { toString: () => 'booking-1' } },
      { _id: { toString: () => 'booking-2' } },
    ]);

    await expect(service.findDueScheduledIds()).resolves.toEqual([
      'booking-1',
      'booking-2',
    ]);
  });
});
