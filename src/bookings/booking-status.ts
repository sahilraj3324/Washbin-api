/**
 * The booking lifecycle, kept in one place so no caller invents its own idea
 * of what may follow what.
 *
 * Happy path:
 *   pending -> searching_partner -> partner_assigned -> accepted
 *           -> on_the_way -> arrived -> in_progress -> completed
 */

export const BOOKING_STATUSES = [
  'pending',
  'searching_partner',
  'partner_assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'no_partner_found',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TYPES = ['instant', 'scheduled'] as const;

export type BookingType = (typeof BOOKING_TYPES)[number];

/**
 * Every legal move. Anything absent here is rejected, which is what stops a
 * client jumping from accepted straight to completed.
 */
export const BOOKING_STATUS_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  // A scheduled booking waits here until dispatch starts looking.
  pending: ['searching_partner', 'cancelled'],
  searching_partner: ['partner_assigned', 'no_partner_found', 'cancelled'],
  // 'searching_partner' is how a declined or lapsed offer goes back into the
  // pool for the next partner. Without it partner-assignment cannot advance.
  partner_assigned: ['accepted', 'searching_partner', 'cancelled'],
  accepted: ['on_the_way', 'cancelled'],
  on_the_way: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  // Work has started, so the only way out is finishing it.
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  // Lets the customer retry a search that came up empty.
  no_partner_found: ['searching_partner'],
};

/**
 * Statuses in which an assigned partner is committed to a job, so matching
 * must not offer them another one.
 */
export const PARTNER_ENGAGED_STATUSES: readonly BookingStatus[] = [
  'partner_assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
];

/**
 * Statuses that occupy the customer: used to decide whether a new booking
 * conflicts with one they already have.
 */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'searching_partner',
  'partner_assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
];

/** Derived from the table above so the two can never disagree. */
export const CANCELLABLE_BOOKING_STATUSES: readonly BookingStatus[] =
  BOOKING_STATUSES.filter((status) =>
    BOOKING_STATUS_TRANSITIONS[status].includes('cancelled'),
  );

/**
 * When a booking reaches one of these, the matching field is stamped. Kept
 * beside the transition table so a new status cannot be added without
 * deciding whether it is worth timing.
 */
export const STATUS_TIMESTAMP_FIELD: Partial<Record<BookingStatus, string>> = {
  accepted: 'acceptedAt',
  on_the_way: 'onTheWayAt',
  arrived: 'arrivedAt',
  in_progress: 'startedAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}

/** The status a new booking starts in, which depends on its type. */
export function initialStatus(bookingType: BookingType): BookingStatus {
  // Instant goes straight to searching; scheduled waits for its dispatch
  // window and is moved to searching_partner then.
  return bookingType === 'instant' ? 'searching_partner' : 'pending';
}
