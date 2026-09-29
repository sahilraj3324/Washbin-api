import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Partner, PartnerStatus, VerificationStatus } from './partner.schema';
import { PartnersService } from './partners.service';

const PARTNER_ID = new Types.ObjectId().toString();

type FakePartner = Partial<Partner> & { save: jest.Mock };

/** A partner whose profile is complete — every branch below removes from it. */
function completePartner(overrides: Partial<Partner> = {}): FakePartner {
  return {
    businessName: 'Sharma Home Services',
    ownerName: 'Rahul Sharma',
    phone: '+919876543210',
    email: 'rahul@example.com',
    experienceYears: 6,
    address: {
      line1: '14 Shivaji Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400020',
    },
    verificationStatus: VerificationStatus.Pending,
    status: PartnerStatus.Active,
    ...overrides,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

/** Builds the service over stand-in models, no database involved. */
function build(partner: FakePartner, activeServices = 1) {
  const partnerModel = {
    findById: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(partner),
    }),
  };
  const partnerServiceModel = {
    countDocuments: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(activeServices),
    }),
  };

  return {
    service: new PartnersService(
      partnerModel as never,
      partnerServiceModel as never,
    ),
    partnerServiceModel,
  };
}

describe('PartnersService.missingProfileFields', () => {
  const { service } = build(completePartner());

  it('finds nothing missing on a complete profile', () => {
    expect(service.missingProfileFields(completePartner() as Partner)).toEqual(
      [],
    );
  });

  it('counts zero years of experience as answered', () => {
    const partner = completePartner({ experienceYears: 0 }) as Partner;

    expect(service.missingProfileFields(partner)).toEqual([]);
  });

  it('names each empty field', () => {
    const partner = completePartner({
      email: undefined,
      experienceYears: undefined,
      address: undefined,
    }) as Partner;

    expect(service.missingProfileFields(partner)).toEqual([
      'email',
      'experienceYears',
      'address',
    ]);
  });

  it('treats a whitespace-only email as missing', () => {
    const partner = completePartner({ email: '   ' }) as Partner;

    expect(service.missingProfileFields(partner)).toEqual(['email']);
  });

  it('treats an address with no first line as missing', () => {
    const partner = completePartner({
      address: { line1: '', city: 'Mumbai', state: 'MH', pincode: '400020' },
    }) as Partner;

    expect(service.missingProfileFields(partner)).toEqual(['address']);
  });
});

describe('PartnersService.submitForReview', () => {
  it('moves a complete pending partner to submitted', async () => {
    const partner = completePartner();
    const { service, partnerServiceModel } = build(partner);

    const result = await service.submitForReview(PARTNER_ID);

    expect(result.submitted).toBe(true);
    expect(partner.verificationStatus).toBe(VerificationStatus.Submitted);
    expect(partner.submittedAt).toBeInstanceOf(Date);
    expect(partner.save).toHaveBeenCalledTimes(1);
    // Only the partner's *active* choices count towards the requirement.
    expect(partnerServiceModel.countDocuments).toHaveBeenCalledWith({
      partnerId: PARTNER_ID,
      isActive: true,
    });
  });

  it('clears the reason the last review was refused', async () => {
    const partner = completePartner({
      verificationStatus: VerificationStatus.Rejected,
      rejectionReason: 'Document details are incomplete.',
    });
    const { service } = build(partner);

    await service.submitForReview(PARTNER_ID);

    expect(partner.verificationStatus).toBe(VerificationStatus.Submitted);
    expect(partner.rejectionReason).toBeUndefined();
  });

  it('refuses an incomplete profile, naming what is missing', async () => {
    const partner = completePartner({ email: undefined, address: undefined });
    const { service } = build(partner);

    await expect(service.submitForReview(PARTNER_ID)).rejects.toThrow(
      /missing: email, address/,
    );
    await expect(service.submitForReview(PARTNER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(partner.save).not.toHaveBeenCalled();
  });

  it('refuses a partner who has chosen no services', async () => {
    const partner = completePartner();
    const { service } = build(partner, 0);

    await expect(service.submitForReview(PARTNER_ID)).rejects.toThrow(
      /at least one service/,
    );
    expect(partner.save).not.toHaveBeenCalled();
  });

  it('checks the profile before the services, so both are not asked at once', async () => {
    const partner = completePartner({ email: undefined });
    const { service, partnerServiceModel } = build(partner, 0);

    await expect(service.submitForReview(PARTNER_ID)).rejects.toThrow(
      /missing: email/,
    );
    expect(partnerServiceModel.countDocuments).not.toHaveBeenCalled();
  });

  it('is a no-op for a partner already under review', async () => {
    const partner = completePartner({
      verificationStatus: VerificationStatus.Submitted,
    });
    const { service } = build(partner);

    const result = await service.submitForReview(PARTNER_ID);

    // Asking for what has already happened is not an error: the app shows the
    // same screen either way.
    expect(result.submitted).toBe(false);
    expect(partner.save).not.toHaveBeenCalled();
  });

  it('refuses a partner who is already verified', async () => {
    const partner = completePartner({
      verificationStatus: VerificationStatus.Verified,
    });
    const { service } = build(partner);

    await expect(service.submitForReview(PARTNER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a suspended partner before anything else', async () => {
    const partner = completePartner({
      status: PartnerStatus.Suspended,
      email: undefined,
    });
    const { service } = build(partner);

    // Suspension outranks incompleteness: telling a suspended partner to fill
    // in their email would be a lie about what stands between them and work.
    await expect(service.submitForReview(PARTNER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PartnersService.approve', () => {
  it('marks a submitted partner as verified', async () => {
    const partner = completePartner({
      verificationStatus: VerificationStatus.Submitted,
    });
    const { service } = build(partner);

    const result = await service.approve(PARTNER_ID);

    expect(result).toBe(partner);
    expect(partner.verificationStatus).toBe(VerificationStatus.Verified);
    expect(partner.save).toHaveBeenCalledTimes(1);
  });

  it('clears the old rejection reason when approving', async () => {
    const partner = completePartner({
      verificationStatus: VerificationStatus.Rejected,
      rejectionReason: 'Document details are incomplete.',
    });
    const { service } = build(partner);

    await service.approve(PARTNER_ID);

    expect(partner.verificationStatus).toBe(VerificationStatus.Verified);
    expect(partner.rejectionReason).toBeUndefined();
  });

  it('does not approve a suspended partner', async () => {
    const partner = completePartner({
      status: PartnerStatus.Suspended,
      verificationStatus: VerificationStatus.Submitted,
    });
    const { service } = build(partner);

    await expect(service.approve(PARTNER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(partner.verificationStatus).toBe(VerificationStatus.Submitted);
    expect(partner.save).not.toHaveBeenCalled();
  });
});
