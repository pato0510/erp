import { IsOptional, Matches } from 'class-validator';

/* COM-019 — the dashboard range. Both optional (default: last 90 days ending today);
   YYYY-MM-DD only. Ordering (from ≤ to) and the 3-year cap are enforced in the service
   (parseRange → 400) because they need both values at once. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'from debe tener el formato YYYY-MM-DD.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'to debe tener el formato YYYY-MM-DD.' })
  to?: string;
}
