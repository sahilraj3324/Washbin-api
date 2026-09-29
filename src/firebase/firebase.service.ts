import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/** The subset of a verified Firebase token this API cares about. */
export interface VerifiedPhoneToken {
  uid: string;
  /** E.164, e.g. '+919876543210'. */
  phone: string;
}

const APP_NAME = 'washbin-admin';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  /**
   * Verifies a Firebase ID token minted by the app after a successful OTP
   * check, and returns the phone number Firebase itself confirmed.
   *
   * Everything about the caller's identity comes from this token — the client
   * never gets to state its own phone number.
   */
  async verifyPhoneToken(idToken: string): Promise<VerifiedPhoneToken> {
    let decoded: Awaited<
      ReturnType<ReturnType<typeof getAuth>['verifyIdToken']>
    >;

    try {
      // checkRevoked:true so a token stays unusable once the session is
      // revoked in Firebase (e.g. after a stolen-device report).
      decoded = await getAuth(this.getApp()).verifyIdToken(idToken, true);
    } catch (error) {
      this.logger.warn(
        `Rejected Firebase ID token: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    const phone = decoded.phone_number;

    // A token from any other sign-in method (email link, Google, anonymous)
    // carries no phone claim, and must not open a phone-identified account.
    if (!phone) {
      throw new UnauthorizedException(
        'Verification token is not from a phone sign-in',
      );
    }

    return { uid: decoded.uid, phone };
  }

  /**
   * The initialised admin app, for callers that need another Firebase API
   * (messaging). Credentials stay owned by this service.
   */
  getAdminApp(): App {
    return this.getApp();
  }

  /**
   * Whether the credentials are present. Push is best-effort, so callers use
   * this to skip sending rather than throwing in environments (tests, local)
   * where Firebase is not configured.
   */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('FIREBASE_PROJECT_ID') &&
      this.config.get<string>('FIREBASE_CLIENT_EMAIL') &&
      this.config.get<string>('FIREBASE_PRIVATE_KEY'),
    );
  }

  /** Initialised lazily so a missing key fails a request, not the whole boot. */
  private getApp(): App {
    if (this.app) {
      return this.app;
    }

    const existing = getApps().find((app) => app.name === APP_NAME);
    if (existing) {
      this.app = existing;
      return existing;
    }

    this.app = initializeApp(
      {
        credential: cert({
          projectId: this.require('FIREBASE_PROJECT_ID'),
          clientEmail: this.require('FIREBASE_CLIENT_EMAIL'),
          privateKey: this.privateKey(),
        }),
      },
      APP_NAME,
    );

    return this.app;
  }

  /**
   * Env stores are single-line, so the PEM arrives with literal `\n`. Also
   * tolerates a value wrapped in quotes by a dashboard or `.env` parser.
   */
  private privateKey(): string {
    return this.require('FIREBASE_PRIVATE_KEY')
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n');
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new Error(`${key} is not defined`);
    }
    return value;
  }
}
