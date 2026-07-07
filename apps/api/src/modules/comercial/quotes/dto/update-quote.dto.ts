import { QuoteStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/* COM-010 — general-field edits of a BORRADOR quote: validUntil, notes. `status` is
   declared ONLY to REJECT it here — status changes MUST go through the canonical
   PATCH /quotes/:id/status endpoint so the state machine can never be bypassed (same
   pattern as UpdateOpportunityDto rejecting `stage`). validUntil accepts null to
   clear it (the service treats undefined = leave as-is, null = clear). */
export class UpdateQuoteDto {
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;
}
