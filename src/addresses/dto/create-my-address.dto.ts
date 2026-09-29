import { OmitType } from '@nestjs/swagger';
import { CreateAddressDto } from './create-address.dto';

/**
 * Body for POST /addresses/me. customerId is dropped because it comes from
 * the bearer token — a customer must not be able to write addresses into
 * someone else's account by naming them in the body.
 */
export class CreateMyAddressDto extends OmitType(CreateAddressDto, [
  'customerId',
] as const) {}
