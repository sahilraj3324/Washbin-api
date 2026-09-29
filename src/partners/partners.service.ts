import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { PartnerService } from '../partner-services/schemas/partner-service.schema';
import { UpdateMyPartnerDto } from './dto/update-my-partner.dto';
import {
  EmergencyContact,
  Partner,
  PartnerAddress,
  PartnerDocument,
  PartnerStatus,
  VerificationStatus,
} from './partner.schema';
import type { Gender } from './partner.schema';

const DUPLICATE_KEY = 11000;

/**
 * What a partner must fill in before Washbin will look at them.
 *
 * The partner app renders its onboarding checklist from the same list, so
 * changing it here changes both — but the app keeps its own copy of the
 * *labels*. Keep the two in step: `apps/washbinpartner/lib/features/partner/
 * domain/profile_completeness.dart`.
 *
 * businessName, ownerName and phone are not listed because the account cannot
 * exist without them — registration requires all three.
 */
export const REQUIRED_PROFILE_FIELDS = [
  'email',
  'experienceYears',
  'address',
] as const;

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export interface SubmitForReviewResult {
  partner: Partner;
  submitted: boolean;
}

export interface CreatePartnerInput {
  authUserId: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email?: string;
}

/**
 * The profile fields a partner fills in after registering. Separate from
 * CreatePartnerInput because none of them exist at sign-up — the account is
 * created from a verified phone number and two names, and everything here is
 * added later.
 */
export interface UpdatePartnerProfileInput {
  profileImage?: string;
  gender?: Gender;
  experienceYears?: number;
  address?: PartnerAddress;
  emergencyContact?: EmergencyContact;
}

export type UpdatePartnerInput = Partial<CreatePartnerInput> &
  UpdatePartnerProfileInput;

@Injectable()
export class PartnersService {
  constructor(
    @InjectModel(Partner.name)
    private readonly partnerModel: Model<Partner>,
    // The model rather than PartnerServicesService: submit only needs to
    // count rows, and injecting the service would make partners <->
    // partner-services a module cycle for no gain.
    @InjectModel(PartnerService.name)
    private readonly partnerServiceModel: Model<PartnerService>,
  ) {}

  // ---- the signed-in partner ------------------------------------------

  /**
   * GET /partners/me. Separate from findOne so the route reads as what it is;
   * the id still comes from the token, never the path.
   */
  async findMe(partnerId: string): Promise<Partner> {
    return this.findOne(partnerId);
  }

  /**
   * PATCH /partners/me. The DTO is the allow-list — see its doc comment for
   * why this is not `update()` with a partner id.
   */
  async updateMe(partnerId: string, dto: UpdateMyPartnerDto): Promise<Partner> {
    return this.update(partnerId, dto);
  }

  /**
   * POST /partners/me/submit-for-review.
   *
   * Moves a partner from `pending` or `rejected` to `submitted`. This is the
   * only transition the partner themselves can cause: `verified` and
   * `rejected` are Washbin's to set, which is why neither appears in any DTO.
   *
   * Refused rather than silently accepted when the profile is not ready, so a
   * partner is told what is missing instead of waiting on a review that was
   * never going to happen.
   */
  async submitForReview(partnerId: string): Promise<SubmitForReviewResult> {
    const partner = (await this.findOne(partnerId)) as PartnerDocument;

    if (partner.status === PartnerStatus.Suspended) {
      throw new ForbiddenException('This partner account has been suspended');
    }
    if (partner.verificationStatus === VerificationStatus.Verified) {
      throw new ConflictException('This partner is already verified');
    }
    if (partner.verificationStatus === VerificationStatus.Submitted) {
      // Not an error worth failing on: the partner asked for the thing that
      // has already happened, and the app shows the same screen either way.
      return { partner, submitted: false };
    }

    const missing = this.missingProfileFields(partner);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Complete your profile first — missing: ${missing.join(', ')}`,
      );
    }

    const activeServices = await this.partnerServiceModel
      .countDocuments({ partnerId, isActive: true })
      .exec();

    if (activeServices === 0) {
      throw new BadRequestException(
        'Choose at least one service before submitting for review',
      );
    }

    partner.verificationStatus = VerificationStatus.Submitted;
    partner.submittedAt = new Date();
    // The old reason describes a profile that no longer exists.
    partner.rejectionReason = undefined;
    await partner.save();

    return { partner, submitted: true };
  }

  /**
   * Admin approval: marks a reviewed partner as verified.
   *
   * Account standing stays separate from verification. A suspended account
   * cannot be approved from this route, and inactive/active status is not
   * changed here.
   */
  async approve(id: string): Promise<Partner> {
    const partner = (await this.findOne(id)) as PartnerDocument;

    if (partner.status === PartnerStatus.Suspended) {
      throw new ForbiddenException('This partner account has been suspended');
    }

    partner.verificationStatus = VerificationStatus.Verified;
    partner.rejectionReason = undefined;
    await partner.save();

    return partner;
  }

  /**
   * Which required fields are still empty. Public because the app asks the
   * same question locally to draw its checklist without a round trip.
   */
  missingProfileFields(partner: Partner): RequiredProfileField[] {
    return REQUIRED_PROFILE_FIELDS.filter((field) => {
      switch (field) {
        case 'email':
          return !partner.email?.trim();
        case 'experienceYears':
          // Zero years is a complete answer, so only absence counts.
          return (
            partner.experienceYears === undefined ||
            partner.experienceYears === null
          );
        case 'address':
          return !partner.address?.line1?.trim();
      }
    });
  }

  async create(input: CreatePartnerInput): Promise<Partner> {
    try {
      return await this.partnerModel.create(input);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A partner with that phone, email or authUserId already exists',
        );
      }
      throw error;
    }
  }

  async findAll(): Promise<Partner[]> {
    return this.partnerModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Partner> {
    this.assertValidId(id);
    const partner = await this.partnerModel.findById(id).exec();

    if (!partner) {
      throw new NotFoundException(`Partner ${id} not found`);
    }
    return partner;
  }

  async update(id: string, input: UpdatePartnerInput): Promise<Partner> {
    this.assertValidId(id);

    try {
      const updated = await this.partnerModel
        .findByIdAndUpdate(id, input, { new: true, runValidators: true })
        .exec();

      if (!updated) {
        throw new NotFoundException(`Partner ${id} not found`);
      }
      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A partner with that phone, email or authUserId already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    this.assertValidId(id);
    const result = await this.partnerModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Partner ${id} not found`);
    }
  }

  /** Drops every partner document. */
  async removeAll(): Promise<{ deleted: number }> {
    const result = await this.partnerModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  /**
   * Looks a partner up the way sign-in does. The uid is checked first because
   * it is the account's real key; phone is the fallback so a partner created
   * before this device ever saw Firebase still resolves to one account rather
   * than a duplicate.
   */
  async findByAuthUserIdOrPhone(
    authUserId: string,
    phone: string,
  ): Promise<Partner | null> {
    return this.partnerModel
      .findOne({ $or: [{ authUserId }, { phone }] })
      .exec();
  }

  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Partner ${id} not found`);
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === DUPLICATE_KEY
    );
  }
}
