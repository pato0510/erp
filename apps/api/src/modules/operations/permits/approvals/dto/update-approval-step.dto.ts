import { PartialType } from '@nestjs/mapped-types';
import { CreateApprovalStepDto } from './create-approval-step.dto';

export class UpdateApprovalStepDto extends PartialType(CreateApprovalStepDto) {}
