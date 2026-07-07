import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/* COM-010 — create a quote FROM an opportunity (opportunityId comes from the route).
   The lines are COPIED from the opportunity's service bundle server-side — they are
   never supplied here. validUntil is optional on a BORRADOR (required only to send). */
export class CreateQuoteDto {
  // Date-only (YYYY-MM-DD or ISO); stored UTC-anchored @db.Date in the service.
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
