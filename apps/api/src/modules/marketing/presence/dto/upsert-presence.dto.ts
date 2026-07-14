import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/* MKT-008 — the monthly digital-presence upsert. `period` accepts 'YYYY-MM' or
   'YYYY-MM-DD'; the service normalizes it to the FIRST day of the month in UTC before
   touching the DB, so the day part (if any) is irrelevant. Metrics are non-negative
   integers; the "at least one metric present" rule is enforced in the service (a
   cross-field rule). Amounts are counts, not money. */
export class UpsertPresenceDto {
  // YYYY-MM or YYYY-MM-DD (the day is discarded during normalization).
  @Matches(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, {
    message: 'El período debe tener el formato YYYY-MM o YYYY-MM-DD.',
  })
  period: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  webVisits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  linkedinFollowers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  googleProfileViews?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
