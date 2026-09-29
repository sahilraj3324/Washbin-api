import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PROFILE_REQUIRED } from '../common/auth-codes';
import { CustomersService } from '../customers/customers.service';
import { CustomerDocument, CustomerStatus } from '../customers/customer.schema';
import { FirebaseService } from '../firebase/firebase.service';

export interface CustomerLoginResult {
  accessToken: string;
  id: string;
  name: string;
  phone: string;
  email?: string;
  /** True when this call created the account rather than signing one in. */
  isNewCustomer: boolean;
}

export interface PhoneSignInInput {
  firebaseIdToken: string;
  /** Required only for a phone with no account yet. */
  name?: string;
  email?: string;
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly firebaseService: FirebaseService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Signs a customer in — or registers them — from a Firebase ID token that
   * proves an OTP sent to their phone was entered correctly.
   *
   * Login and signup are one call on purpose: the customer only ever sees
   * "enter your number", and whether an account already exists is something
   * the server works out, not something the app has to ask about first.
   */
  async signInWithPhone(input: PhoneSignInInput): Promise<CustomerLoginResult> {
    const { uid, phone } = await this.firebaseService.verifyPhoneToken(
      input.firebaseIdToken,
    );

    const existing = (await this.customersService.findByAuthUserIdOrPhone(
      uid,
      phone,
    )) as CustomerDocument | null;

    if (existing) {
      this.assertCanSignIn(existing);
      await this.backfillAuthUserId(existing, uid);
      return this.createLoginResult(existing, false);
    }

    const name = input.name?.trim();
    if (!name) {
      throw new NotFoundException({
        code: PROFILE_REQUIRED,
        message: 'No account for this number yet. Send a name to create one.',
      });
    }

    const created = (await this.customersService.create({
      authUserId: uid,
      name,
      phone,
      email: input.email?.toLowerCase().trim() || undefined,
    })) as CustomerDocument;

    return this.createLoginResult(created, true);
  }

  private assertCanSignIn(customer: CustomerDocument): void {
    if (customer.status === CustomerStatus.Blocked) {
      throw new ForbiddenException('This account has been blocked');
    }
  }

  /**
   * An account matched by phone but holding a different uid predates this
   * Firebase project (or the number was re-registered). Adopting the new uid
   * keeps one account per number instead of failing the unique index later.
   */
  private async backfillAuthUserId(
    customer: CustomerDocument,
    uid: string,
  ): Promise<void> {
    if (customer.authUserId === uid) {
      return;
    }

    customer.authUserId = uid;
    await customer.save();
  }

  private async createLoginResult(
    customer: CustomerDocument,
    isNewCustomer: boolean,
  ): Promise<CustomerLoginResult> {
    // _id rather than the `id` virtual, which mongoose types as `any`.
    const id = customer._id.toString();

    const accessToken = await this.jwtService.signAsync({
      sub: id,
      type: 'customer',
      phone: customer.phone,
    });

    return {
      accessToken,
      id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      isNewCustomer,
    };
  }
}
