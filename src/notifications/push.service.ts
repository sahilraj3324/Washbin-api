import { Injectable, Logger } from '@nestjs/common';
import { getMessaging } from 'firebase-admin/messaging';
import { FirebaseService } from '../firebase/firebase.service';

export interface PushMessage {
  title: string;
  body: string;
  /** FCM requires every data value to be a string. */
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens FCM says no longer exist; the caller retires them. */
  invalidTokens: string[];
}

/**
 * FCM error codes that mean the token is permanently dead, as opposed to a
 * transient delivery failure worth retrying.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Wraps FCM. Knows nothing about bookings or notification copy. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const empty: PushResult = { sent: 0, failed: 0, invalidTokens: [] };

    if (!tokens.length) {
      return empty;
    }

    // Push is best-effort. Without credentials the notification is still
    // stored, so the app sees it on next fetch.
    if (!this.firebaseService.isConfigured()) {
      this.logger.warn(
        `Firebase not configured; skipped push to ${tokens.length} device(s)`,
      );
      return empty;
    }

    try {
      const response = await getMessaging(
        this.firebaseService.getAdminApp(),
      ).sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: message.data,
      });

      const invalidTokens: string[] = [];

      response.responses.forEach((result, index) => {
        if (result.success) {
          return;
        }

        const code = result.error?.code ?? 'unknown';
        if (DEAD_TOKEN_CODES.has(code)) {
          invalidTokens.push(tokens[index]);
        } else {
          this.logger.warn(`Push to a device failed: ${code}`);
        }
      });

      return {
        sent: response.successCount,
        failed: response.failureCount,
        invalidTokens,
      };
    } catch (error) {
      // A total send failure must not take the caller down with it.
      this.logger.error(
        `Push send failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ...empty, failed: tokens.length };
    }
  }
}
