import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/* COM-005 — create an opportunity. Always starts at stage PROSPECTO (stage is NOT
   settable here — stage changes go through PATCH /:id/stage so the transition rules
   are the only path to closed/paused states). */
export class CreateOpportunityDto {
  // Required parent account (validated company-scoped in the service).
  @IsUUID()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  // CLP money — persisted as Decimal(18,2). Non-negative.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  // Date-only (YYYY-MM-DD or ISO); stored UTC-anchored @db.Date in the service.
  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  // Commercial executive — bare actor UUID (no FK, codebase convention).
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
