import { IsOptional, Matches } from 'class-validator';

/* CAL-015 — set/clear a service order's execution window. Both fields are OPTIONAL and NULLABLE:
 * absent = leave unchanged, null = clear, a "YYYY-MM-DD" string = set. @IsOptional lets null/
 * undefined skip the format check; a present string must be YYYY-MM-DD. The end ≥ start rule and
 * UTC anchoring live in the service. NO status field — dates are pure scheduling data. */
export class SetExecutionDatesDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de inicio debe tener el formato YYYY-MM-DD.',
  })
  executionStart?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de fin debe tener el formato YYYY-MM-DD.',
  })
  executionEnd?: string | null;
}
