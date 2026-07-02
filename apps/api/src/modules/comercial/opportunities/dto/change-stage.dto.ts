import { LostReason, OpportunityStage } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/* COM-005 — the canonical stage-change payload. lostReason/lostReasonDetail are
   only meaningful when moving to PERDIDA (validated in the service). */
export class ChangeStageDto {
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
