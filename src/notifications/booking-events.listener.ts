import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { UserType } from '../common/user-principal';
import { BOOKING_EVENT } from './booking-events';
// `import type`: @OnEvent handlers are decorated, and emitDecoratorMetadata
// cannot emit metadata for an interface parameter.
import type { BookingEventName, BookingEventPayload } from './booking-events';
import { EVENT_TEMPLATES } from './notification-templates';
import { NotificationsService } from './notifications.service';

/**
 * The only place that turns booking events into notifications. Bookings and
 * partner-assignment emit; this decides who is told and in what words.
 */
@Injectable()
export class BookingEventsListener {
  private readonly logger = new Logger(BookingEventsListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(BOOKING_EVENT.Created)
  handleCreated(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.Created, payload);
  }

  @OnEvent(BOOKING_EVENT.PartnerOffered)
  handlePartnerOffered(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.PartnerOffered, payload);
  }

  @OnEvent(BOOKING_EVENT.PartnerAssigned)
  handlePartnerAssigned(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.PartnerAssigned, payload);
  }

  @OnEvent(BOOKING_EVENT.PartnerAccepted)
  handlePartnerAccepted(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.PartnerAccepted, payload);
  }

  @OnEvent(BOOKING_EVENT.PartnerOnTheWay)
  handleOnTheWay(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.PartnerOnTheWay, payload);
  }

  @OnEvent(BOOKING_EVENT.PartnerArrived)
  handleArrived(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.PartnerArrived, payload);
  }

  @OnEvent(BOOKING_EVENT.ServiceStarted)
  handleStarted(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.ServiceStarted, payload);
  }

  @OnEvent(BOOKING_EVENT.ServiceCompleted)
  handleCompleted(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.ServiceCompleted, payload);
  }

  @OnEvent(BOOKING_EVENT.Cancelled)
  handleCancelled(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.Cancelled, payload);
  }

  @OnEvent(BOOKING_EVENT.NoPartnerFound)
  handleNoPartnerFound(payload: BookingEventPayload): Promise<void> {
    return this.dispatch(BOOKING_EVENT.NoPartnerFound, payload);
  }

  /**
   * Errors are caught here rather than thrown: an event listener rejecting
   * would surface as an unhandled rejection and must never take down the
   * booking write that emitted it.
   */
  private async dispatch(
    event: BookingEventName,
    payload: BookingEventPayload,
  ): Promise<void> {
    try {
      for (const template of EVENT_TEMPLATES[event]) {
        for (const audience of template.audience) {
          const userId = this.recipient(audience, payload);

          // A partner-addressed template is simply skipped when no partner is
          // attached yet, e.g. a booking cancelled while still searching.
          if (!userId) {
            continue;
          }

          await this.notificationsService.notify({
            userId,
            userType: audience,
            type: template.type,
            title: template.title,
            body: template.body,
            bookingId: payload.bookingId,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Handling ${event} for booking ${payload.bookingId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private recipient(
    audience: UserType,
    payload: BookingEventPayload,
  ): string | undefined {
    return audience === 'customer' ? payload.customerId : payload.partnerId;
  }
}
