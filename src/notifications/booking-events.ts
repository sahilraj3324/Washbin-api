import { BookingStatus } from '../bookings/booking-status';

/**
 * Domain events the booking lifecycle publishes. Nothing in bookings or
 * partner-assignment knows that notifications exist: they emit, and whatever
 * cares subscribes.
 */
export const BOOKING_EVENT = {
  Created: 'booking.created',
  PartnerOffered: 'booking.partner-offered',
  PartnerAssigned: 'booking.partner-assigned',
  PartnerAccepted: 'booking.partner-accepted',
  PartnerOnTheWay: 'booking.partner-on-the-way',
  PartnerArrived: 'booking.partner-arrived',
  ServiceStarted: 'booking.service-started',
  ServiceCompleted: 'booking.service-completed',
  Cancelled: 'booking.cancelled',
  NoPartnerFound: 'booking.no-partner-found',
} as const;

export type BookingEventName =
  (typeof BOOKING_EVENT)[keyof typeof BOOKING_EVENT];

export interface BookingEventPayload {
  bookingId: string;
  customerId: string;
  /** The partner the event concerns, when there is one. */
  partnerId?: string;
}

/**
 * Most events are just a status landing, so the transition itself publishes
 * them and no caller has to remember to.
 */
export const STATUS_EVENT: Partial<Record<BookingStatus, BookingEventName>> = {
  partner_assigned: BOOKING_EVENT.PartnerAssigned,
  accepted: BOOKING_EVENT.PartnerAccepted,
  on_the_way: BOOKING_EVENT.PartnerOnTheWay,
  arrived: BOOKING_EVENT.PartnerArrived,
  in_progress: BOOKING_EVENT.ServiceStarted,
  completed: BOOKING_EVENT.ServiceCompleted,
  cancelled: BOOKING_EVENT.Cancelled,
  no_partner_found: BOOKING_EVENT.NoPartnerFound,
};
