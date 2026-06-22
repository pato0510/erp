import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Creates a CrmQuote in BORRADOR. counterpartyId (Finance CLIENT) is required;
 * opportunityId optionally links the quote to the originating opportunity. Totals
 * (subtotal / ivaAmount / total) start at 0 and are recomputed as items are
 * added/removed. Builder data + on-screen preview only — NO PDF / email.
 */
export class CreateQuoteDto {
  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsUUID()
  counterpartyId: string;

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
