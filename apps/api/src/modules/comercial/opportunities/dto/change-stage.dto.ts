import { LostReason, OpportunityStage } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, Length } from 'class-validator';

import { Transform } from 'class-transformer';
import { ResumeOpportunityDto } from './resume-opportunity.dto';

/* COM-005 — the canonical stage-change payload. lostReason/lostReasonDetail are
   only meaningful when moving to PERDIDA (validated in the service). */
export class ChangeStageDto extends ResumeOpportunityDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Retroceder de etapa requiere un motivo.' })
  @Length(3, 500, {
    message: (args) =>
      typeof args.value !== 'string' || !args.value.trim()
        ? 'Retroceder de etapa requiere un motivo.'
        : 'Retroceder de etapa requiere un motivo de entre 3 y 500 caracteres.',
  })
  reason?: string;

  @IsEnum(OpportunityStage)
  stage: OpportunityStage;

  @IsOptional()
  @IsEnum(LostReason)
  lostReason?: LostReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lostReasonDetail?: string;
}
