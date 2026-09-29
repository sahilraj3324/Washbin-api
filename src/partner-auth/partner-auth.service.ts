import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PROFILE_REQUIRED } from '../common/auth-codes';
import { PartnersService } from '../partners/partners.service';
import {
  PartnerDocument,
  PartnerStatus,
  VerificationStatus,
} from '../partners/partner.schema';
import { FirebaseService } from '../firebase/firebase.service';

export interface PartnerLoginResult {
  accessToken: string;
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email?: string;
  /**
   * Partners can sign in from the moment they register, but cannot take work
   * until Washbin has checked their documents. The app shows this.
   */
  verificationStatus: VerificationStatus;
  /** True when this call created the account rather than signing one in. */
  isNewPartner: boolean;
}

export interface PartnerPhoneSignInInput {
  firebaseIdToken: string;
  /** Both required only for a phone with no account yet. */
  businessName?: string;
  ownerName?: string;
  email?: string;
}

@Injectable()
export class PartnerAuthService {
  constructor(
    // forwardRef on both sides of the partners <-> partner-auth cycle: with
    // it on one side only, the graph resolves or fails depending on module
    // load order.
    @Inject(forwardRef(() => PartnersService))
    private readonly partnersService: PartnersService,
    private readonly firebaseService: FirebaseService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Signs a partner in — or registers them — from a Firebase ID token that
   * proves an OTP sent to their phone was entered correctly.
   *
   * A new partner is created with the schema's default verification status of
   * `pending`, so registering is not the same as being allowed to trade.
   */
  async signInWithPhone(
    input: PartnerPhoneSignInInput,
  ): Promise<PartnerLoginResult> {
    const { uid, phone } = await this.firebaseService.verifyPhoneToken(
      input.firebaseIdToken,
    );

    const existing = (await this.partnersService.findByAuthUserIdOrPhone(
      uid,
      phone,
    )) as PartnerDocument | null;

    if (existing) {
      this.assertCanSignIn(existing);
      await this.backfillAuthUserId(existing, uid);
      return this.createLoginResult(existing, false);
    }

    const businessName = input.businessName?.trim();
    const ownerName = input.ownerName?.trim();

    if (!businessName || !ownerName) {
      throw new NotFoundException({
        code: PROFILE_REQUIRED,
        message:
          'No partner account for this number yet. Send a business name and owner name to create one.',
      });
    }

    const created = (await this.partnersService.create({
      authUserId: uid,
      businessName,
      ownerName,
      phone,
      email: input.email?.toLowerCase().trim() || undefined,
    })) as PartnerDocument;

    return this.createLoginResult(created, true);
  }

  private assertCanSignIn(partner: PartnerDocument): void {
    if (partner.status === PartnerStatus.Suspended) {
      throw new ForbiddenException('This partner account has been suspended');
    }
  }

  /**
   * An account matched by phone but holding a different uid predates this
   * Firebase project (or the number was re-registered). Adopting the new uid
   * keeps one account per number instead of failing the unique index later.
   */
  private async backfillAuthUserId(
    partner: PartnerDocument,
    uid: string,
  ): Promise<void> {
    if (partner.authUserId === uid) {
      return;
    }

    partner.authUserId = uid;
    await partner.save();
  }

  private async createLoginResult(
    partner: PartnerDocument,
    isNewPartner: boolean,
  ): Promise<PartnerLoginResult> {
    // _id rather than the `id` virtual, which mongoose types as `any`.
    const id = partner._id.toString();

    const accessToken = await this.jwtService.signAsync({
      sub: id,
      type: 'partner',
      phone: partner.phone,
    });

    return {
      accessToken,
      id,
      businessName: partner.businessName,
      ownerName: partner.ownerName,
      phone: partner.phone,
      email: partner.email,
      verificationStatus: partner.verificationStatus,
      isNewPartner,
    };
  }
}
