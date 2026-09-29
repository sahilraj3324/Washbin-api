import { UserType } from '../common/user-principal';
import { BOOKING_EVENT, BookingEventName } from './booking-events';

/** Stored on the notification and sent in the FCM data payload. */
export const NOTIFICATION_TYPES = [
  'BOOKING_CREATED',
  'PARTNER_OFFERED',
  'PARTNER_ASSIGNED',
  'PARTNER_ACCEPTED',
  'PARTNER_ON_THE_WAY',
  'PARTNER_ARRIVED',
  'SERVICE_STARTED',
  'SERVICE_COMPLETED',
  'BOOKING_CANCELLED',
  'NO_PARTNER_FOUND',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationTemplate {
  type: NotificationType;
  /** Who is told. An event can notify both sides. */
  audience: readonly UserType[];
  title: string;
  body: string;
}

/**
 * Event -> what each side is told. Copy lives here rather than in the
 * services, so changing wording never means touching booking logic.
 */
export const EVENT_TEMPLATES: Record<
  BookingEventName,
  readonly NotificationTemplate[]
> = {
  [BOOKING_EVENT.Created]: [
    {
      type: 'BOOKING_CREATED',
      audience: ['customer'],
      title: 'Booking created',
      body: 'We are finding a service professional for you.',
    },
  ],
  [BOOKING_EVENT.PartnerOffered]: [
    {
      type: 'PARTNER_OFFERED',
      audience: ['partner'],
      title: 'New service request',
      body: 'You have a new request nearby.',
    },
  ],
  // Deliberately silent: an offer that is declined re-enters this state for
  // the next partner, so notifying here would ping the customer once per
  // decline. They hear at PARTNER_ACCEPTED instead.
  [BOOKING_EVENT.PartnerAssigned]: [],
  [BOOKING_EVENT.PartnerAccepted]: [
    {
      type: 'PARTNER_ACCEPTED',
      audience: ['customer'],
      title: 'Partner assigned',
      body: 'Your service professional has accepted your request.',
    },
  ],
  [BOOKING_EVENT.PartnerOnTheWay]: [
    {
      type: 'PARTNER_ON_THE_WAY',
      audience: ['customer'],
      title: 'On the way',
      body: 'Your partner is on the way.',
    },
  ],
  [BOOKING_EVENT.PartnerArrived]: [
    {
      type: 'PARTNER_ARRIVED',
      audience: ['customer'],
      title: 'Partner arrived',
      body: 'Your service professional has arrived. Share your start code to begin.',
    },
  ],
  [BOOKING_EVENT.ServiceStarted]: [
    {
      type: 'SERVICE_STARTED',
      audience: ['customer'],
      title: 'Service started',
      body: 'Your service has started.',
    },
  ],
  [BOOKING_EVENT.ServiceCompleted]: [
    {
      type: 'SERVICE_COMPLETED',
      audience: ['customer'],
      title: 'Service completed',
      body: 'Your service has been completed.',
    },
    {
      type: 'SERVICE_COMPLETED',
      audience: ['partner'],
      title: 'Job completed',
      body: 'You have completed this job.',
    },
  ],
  [BOOKING_EVENT.Cancelled]: [
    {
      type: 'BOOKING_CANCELLED',
      audience: ['customer'],
      title: 'Booking cancelled',
      body: 'Your booking has been cancelled.',
    },
    // Only delivered when a partner was attached; see the listener.
    {
      type: 'BOOKING_CANCELLED',
      audience: ['partner'],
      title: 'Booking cancelled',
      body: 'A booking assigned to you was cancelled.',
    },
  ],
  [BOOKING_EVENT.NoPartnerFound]: [
    {
      type: 'NO_PARTNER_FOUND',
      audience: ['customer'],
      title: 'No partner available',
      body: 'We could not find a professional right now. Please try again.',
    },
  ],
};
