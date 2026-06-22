import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/**
 * Creates a MarketingExpense. campaignId is optional (free expenses allowed).
 * financeCategoryId / financeCategoryName are READ-ONLY display copies of a
 * Finance category — they never create or mutate Finance records.
 */
export class CreateExpenseDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  channel?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  financeCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  financeCategoryName?: string;
}
