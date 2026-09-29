import { OmitType } from '@nestjs/swagger';
import { CreatePartnerServiceDto } from './create-partner-service.dto';

/**
 * Body for POST /partner-services/me. partnerId is dropped because it comes
 * from the bearer token — a partner must not be able to add offerings to
 * someone else's account by naming them in the body.
 */
export class CreateMyPartnerServiceDto extends OmitType(
  CreatePartnerServiceDto,
  ['partnerId'] as const,
) {}
