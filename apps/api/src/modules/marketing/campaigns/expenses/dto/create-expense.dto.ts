import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/* MKT-005 — create a marketing expense (a per-campaign ledger line). Amounts are NET
   of IVA (decision b — the UI states it). `vendorName` is free text, deliberately NOT
   an FK to counterparties. createdBy comes from the JWT actor in the service. */
export class CreateExpenseDto {
  // Date-only (YYYY-MM-DD or ISO); stored UTC-anchored @db.Date in the service (HR-004b).
  @IsDateString()
  expenseDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  // CLP money — persisted as Decimal(18,2). STRICTLY > 0 (a zero/negative expense is
  // not a real expense; corrections are done by editing or deleting the line).
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
