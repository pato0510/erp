import { PartialType } from '@nestjs/mapped-types';
import { CreatePermitTypeDto } from './create-permit-type.dto';

export class UpdatePermitTypeDto extends PartialType(CreatePermitTypeDto) {}
