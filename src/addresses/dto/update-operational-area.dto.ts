import { PartialType } from '@nestjs/swagger';
import { CreateOperationalAreaDto } from './create-operational-area.dto';

export class UpdateOperationalAreaDto extends PartialType(
  CreateOperationalAreaDto,
) {}
