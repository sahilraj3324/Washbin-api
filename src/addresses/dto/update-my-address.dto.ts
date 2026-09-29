import { PartialType } from '@nestjs/swagger';
import { CreateMyAddressDto } from './create-my-address.dto';

export class UpdateMyAddressDto extends PartialType(CreateMyAddressDto) {}
