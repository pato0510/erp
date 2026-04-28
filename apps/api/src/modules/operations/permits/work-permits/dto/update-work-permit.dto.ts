import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkPermitDto } from './create-work-permit.dto';

export class UpdateWorkPermitDto extends PartialType(CreateWorkPermitDto) {}
