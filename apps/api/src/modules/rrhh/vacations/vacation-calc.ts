/* HR-011 — CERTIFIED Chilean feriado-legal calculation (owner-validated against
 * the Código del Trabajo). Pure, dependency-free functions — the single source of
 * truth for accrual + business-day counting. Do NOT inline these formulas
 * elsewhere; everything routes through here so the certified math has one home.
 *
 * Rules (V1):
 *  - Annual entitlement is a PARAMETER (annualDays; default 15 días hábiles).
 *  - Accrual: annualDays/12 días hábiles per COMPLETED calendar month from
 *    hireDate, plus (annualDays/12)/30 per day of the in-progress partial month.
 *  - "Días hábiles" = Monday–Friday. Saturday/Sunday never count. Chilean
 *    festivos are NOT modelled in V1 (admin overrides the per-request count).
 *  - Balance is COMPUTED, never stored.
 */

export const DEFAULT_ANNUAL_DIAS_HABILES = 15;

/** Midnight-UTC normalisation so date-only (@db.Date) values compare cleanly. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Add `m` months to a UTC date, clamping to the last day of the target month
 *  (e.g. Jan 31 + 1 month → Feb 28/29, not Mar 3). */
export function addMonthsUtc(d: Date, m: number): Date {
  const day = d.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDayOfTarget));
  return firstOfTarget;
}

/** Completed whole months + leftover days between hireDate and today (inclusive
 *  of hireDate as day 0). Used by the accrual formula. */
export function monthsAndPartialDays(
  hireDate: Date,
  today: Date,
): { months: number; partialDays: number } {
  const hire = startOfUtcDay(hireDate);
  const now = startOfUtcDay(today);
  if (now <= hire) return { months: 0, partialDays: 0 };

  let months = 0;
  while (addMonthsUtc(hire, months + 1).getTime() <= now.getTime()) months++;

  const anchor = addMonthsUtc(hire, months); // hireDate + `months` months
  const partialDays = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);
  return { months, partialDays };
}

/** Días hábiles devengados (accrued) from hireDate to today.
 *  = months × (annualDays/12) + partialDays × (annualDays/12/30). */
export function computeAccrued(
  hireDate: Date,
  today: Date,
  annualDays: number = DEFAULT_ANNUAL_DIAS_HABILES,
): number {
  const perMonth = annualDays / 12; // 1.25 for annualDays=15
  const perDay = perMonth / 30; // 0.0416667 for annualDays=15
  const { months, partialDays } = monthsAndPartialDays(hireDate, today);
  return months * perMonth + partialDays * perDay;
}

/** Count Monday–Friday days in [start, end] inclusive (UTC). Weekends never
 *  count; festivos are NOT subtracted in V1 (admin overrides per request). */
export function countBusinessDays(start: Date, end: Date): number {
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  if (to.getTime() < from.getTime()) return 0;
  let count = 0;
  for (let d = from; d.getTime() <= to.getTime(); d = new Date(d.getTime() + 86_400_000)) {
    const dow = d.getUTCDay(); // 0=Sun … 6=Sat
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

/** Round to 2 decimals for transport (días hábiles are shown to ≤1 decimal in
 *  the UI, but we keep 2 internally so e.g. 7.92 doesn't lose accrual). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface VacationLikeRequest {
  status: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'TOMADO' | 'CANCELADO';
  diasHabiles: number;
}

export interface VacationBalance {
  hireDate: string;
  feriadoAnualDiasHabiles: number;
  devengado: number;
  diasAdicionales: number;
  tomados: number; // días hábiles consumed by APROBADO + TOMADO
  pendientes: number; // días hábiles of PENDIENTE requests (informational, not subtracted)
  saldoDisponible: number; // devengado + diasAdicionales − tomados
  asOf: string;
}

/** Assemble the computed balance. saldoDisponible subtracts APROBADO+TOMADO
 *  (consumed); PENDIENTE is surfaced separately, NOT subtracted (it isn't
 *  granted yet). RECHAZADO/CANCELADO never count. */
export function computeBalance(
  hireDate: Date,
  today: Date,
  annualDays: number,
  diasAdicionales: number,
  requests: VacationLikeRequest[],
): VacationBalance {
  const devengado = computeAccrued(hireDate, today, annualDays);
  const tomados = requests
    .filter((r) => r.status === 'APROBADO' || r.status === 'TOMADO')
    .reduce((s, r) => s + r.diasHabiles, 0);
  const pendientes = requests
    .filter((r) => r.status === 'PENDIENTE')
    .reduce((s, r) => s + r.diasHabiles, 0);
  const saldoDisponible = devengado + diasAdicionales - tomados;
  return {
    hireDate: startOfUtcDay(hireDate).toISOString(),
    feriadoAnualDiasHabiles: annualDays,
    devengado: round2(devengado),
    diasAdicionales,
    tomados,
    pendientes,
    saldoDisponible: round2(saldoDisponible),
    asOf: startOfUtcDay(today).toISOString(),
  };
}
