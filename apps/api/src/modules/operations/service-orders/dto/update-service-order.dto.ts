import { ServiceOrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/* COM-013a — general-field edit of a service order: title / description / notes only.
   The frozen handoff snapshot (clientName, scopeLines, amounts, provenance) is NOT
   editable — it must read tomorrow as it did at handoff. `status` is declared ONLY to
   REJECT it here: status changes MUST go through PATCH /:id/status so the machine can
   never be bypassed (same pattern as UpdateOpportunityDto rejecting `stage`). */
export class UpdateServiceOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(ServiceOrderStatus)
  status?: ServiceOrderStatus;
}
