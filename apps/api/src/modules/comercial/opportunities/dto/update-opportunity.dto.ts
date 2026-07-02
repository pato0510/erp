import { PartialType } from '@nestjs/mapped-types';
import { OpportunityStage } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateOpportunityDto } from './create-opportunity.dto';

/* COM-005 — general-field edits (name, estimatedValue, probability,
   expectedCloseDate, ownerId, notes, accountId). `stage` is declared ONLY to
   REJECT it here: stage changes MUST go through the canonical PATCH /:id/stage
   endpoint, so the transition rules can never be bypassed via a general update. */
export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {
  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;
}
