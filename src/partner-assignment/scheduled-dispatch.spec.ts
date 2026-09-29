import { Logger } from '@nestjs/common';
import { PartnerAssignmentService } from './partner-assignment.service';
import type { StartMatchingResult } from './partner-assignment.service';

/**
 * Covers the half of scheduling that did not exist: waking a scheduled
 * booking when its time comes. Mongo itself is not exercised — the queries
 * are asserted as the filters that go to it.
 */
describe('scheduled dispatch', () => {
  const outcome = (
    value: StartMatchingResult['outcome'],
  ): StartMatchingResult => ({ outcome: value, candidatesConsidered: 1 });

  function buildService(options: {
    dueIds: string[];
    startMatching?: jest.Mock;
    sweepExpired?: jest.Mock;
  }) {
    const bookingsService = {
      findDueScheduledIds: jest.fn().mockResolvedValue(options.dueIds),
    };

    const service = Object.create(
      PartnerAssignmentService.prototype,
    ) as PartnerAssignmentService;

    Object.assign(service, {
      bookingsService,
      logger: { log: jest.fn(), error: jest.fn() } as unknown as Logger,
    });

    service.startMatching =
      options.startMatching ?? jest.fn().mockResolvedValue(outcome('offered'));
    service.sweepExpired =
      options.sweepExpired ??
      jest.fn().mockResolvedValue({ expired: 0, readvanced: 0 });

    return { service, bookingsService };
  }

  it('starts matching for every booking that is due', async () => {
    const startMatching = jest.fn().mockResolvedValue(outcome('offered'));
    const { service } = buildService({
      dueIds: ['booking-1', 'booking-2'],
      startMatching,
    });

    await expect(service.dispatchDueScheduled()).resolves.toEqual({
      dispatched: 2,
    });
    expect(startMatching).toHaveBeenCalledWith('booking-1');
    expect(startMatching).toHaveBeenCalledWith('booking-2');
  });

  it('asks for nothing and does nothing when none are due', async () => {
    const startMatching = jest.fn();
    const { service } = buildService({ dueIds: [], startMatching });

    await expect(service.dispatchDueScheduled()).resolves.toEqual({
      dispatched: 0,
    });
    expect(startMatching).not.toHaveBeenCalled();
  });

  it('counts a booking that found nobody: it still left pending', async () => {
    // The point of the sweep is getting the booking out of `pending`. Whether
    // a partner was free is a separate question, and it will be retried.
    const { service } = buildService({
      dueIds: ['booking-1'],
      startMatching: jest.fn().mockResolvedValue(outcome('no_partner_found')),
    });

    await expect(service.dispatchDueScheduled()).resolves.toEqual({
      dispatched: 1,
    });
  });

  it('does not count a booking that already had an offer out', async () => {
    const { service } = buildService({
      dueIds: ['booking-1'],
      startMatching: jest.fn().mockResolvedValue(outcome('already_open')),
    });

    await expect(service.dispatchDueScheduled()).resolves.toEqual({
      dispatched: 0,
    });
  });

  it('carries on when one booking cannot be dispatched', async () => {
    // Cancelled mid-sweep, say. One failure must not strand the rest.
    const startMatching = jest
      .fn()
      .mockRejectedValueOnce(new Error('cancelled'))
      .mockResolvedValue(outcome('offered'));
    const { service } = buildService({
      dueIds: ['gone', 'booking-2'],
      startMatching,
    });

    await expect(service.dispatchDueScheduled()).resolves.toEqual({
      dispatched: 1,
    });
    expect(startMatching).toHaveBeenCalledTimes(2);
  });

  describe('the cron sweep', () => {
    it('closes lapsed offers before dispatching', async () => {
      // Order matters: a partner freed by a lapsed offer should be available
      // to the scheduled bookings dispatched immediately after.
      const calls: string[] = [];
      const sweepExpired = jest.fn().mockImplementation(() => {
        calls.push('sweep');
        return Promise.resolve({ expired: 2, readvanced: 1 });
      });
      const startMatching = jest.fn().mockImplementation(() => {
        calls.push('dispatch');
        return Promise.resolve(outcome('offered'));
      });

      const { service } = buildService({
        dueIds: ['booking-1'],
        startMatching,
        sweepExpired,
      });

      await expect(service.sweepDue()).resolves.toEqual({
        expired: 2,
        readvanced: 1,
        dispatched: 1,
      });
      expect(calls).toEqual(['sweep', 'dispatch']);
    });
  });
});
