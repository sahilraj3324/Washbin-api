import { PickType } from '@nestjs/swagger';
import { CreatePartnerServiceDto } from './create-partner-service.dto';

/**
 * Only the flag is updatable. Repointing partnerId or serviceId would make
 * this a different row, so that is a delete plus a create.
 */
export class UpdatePartnerServiceDto extends PickType(CreatePartnerServiceDto, [
  'isActive',
] as const) {}
