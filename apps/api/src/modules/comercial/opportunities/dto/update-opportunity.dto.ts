import { OmitType, PartialType } from '@nestjs/mapped-types';
import { OpportunityStage } from '@prisma/client';
import {
  IsDivisibleBy,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { CreateOpportunityDto } from './create-opportunity.dto';
import { Transform } from 'class-transformer';
import { PROBABILITY_MESSAGE } from '../stage-probabilities';

/* COM-005 — general-field edits (name, estimatedValue, probability,
   expectedCloseDate, ownerId, notes, accountId). `stage` is declared ONLY to
   REJECT it here: stage changes MUST go through the canonical PATCH /:id/stage
   endpoint, so the transition rules can never be bypassed via a general update. */
export class UpdateOpportunityDto extends PartialType(
  OmitType(CreateOpportunityDto, ['stage', 'probability'] as const),
) {
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID('all', { message: 'El lead debe ser un UUID válido.' })
  leadId?: string | null;

  // PartialType's IsOptional would also skip null; explicit probability writes are numbers.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: PROBABILITY_MESSAGE })
  @Min(0, { message: PROBABILITY_MESSAGE })
  @Max(100, { message: PROBABILITY_MESSAGE })
  @IsDivisibleBy(10, { message: PROBABILITY_MESSAGE })
  probability?: number;

  // Empty inputs clear optional fields; stage requirements are enforced by the service.
  @Transform(({ value }) => (value === '' ? null : value))
  estimatedValue?: number | null;

  @Transform(({ value }) => (value === '' ? null : value))
  expectedCloseDate?: string | null;

  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;
}
