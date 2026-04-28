import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkPermitTypeDto } from './create-work-permit-type.dto';

export class UpdateWorkPermitTypeDto extends PartialType(CreateWorkPermitTypeDto) {}
