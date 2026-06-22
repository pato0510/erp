import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Partial update of a CrmQuote's META fields. Status is NOT updatable here — it
 * goes through PATCH /quotes/:id/status. Items are managed via the dedicated
 * item endpoints (which recompute totals).
 */
export class UpdateQuoteDto {
  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  executionTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  commercialConditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  technicalNotes?: string;
}
