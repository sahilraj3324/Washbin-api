/**
 * An assignment is one offer to one partner for one booking. It starts
 * `offered` and ends exactly once:
 *
 *   offered -> accepted   the partner took the job
 *   offered -> rejected   the partner declined
 *   offered -> expired    the response window closed
 *   offered -> cancelled  the booking went away underneath the offer
 */

export const ASSIGNMENT_STATUSES = [
  'offered',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_TRANSITIONS: Record<
  AssignmentStatus,
  readonly AssignmentStatus[]
> = {
  offered: ['accepted', 'rejected', 'expired', 'cancelled'],
  accepted: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

/** The one non-terminal status; anything else has already been decided. */
export const OPEN_ASSIGNMENT_STATUS: AssignmentStatus = 'offered';

/** Statuses that mean the offer fell through and the next partner is due. */
export const FELL_THROUGH_STATUSES: readonly AssignmentStatus[] = [
  'rejected',
  'expired',
];

export function canTransition(
  from: AssignmentStatus,
  to: AssignmentStatus,
): boolean {
  return ASSIGNMENT_STATUS_TRANSITIONS[from].includes(to);
}
