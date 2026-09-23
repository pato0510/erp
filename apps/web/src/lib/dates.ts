/* COM-025 — civil dates, shared. The Santiago helpers moved here VERBATIM from GO-004's
 * todoStatus.ts (which re-exports them under the same names), plus the renders that
 * fix the @db.Date day shift: a @db.Date arrives as "YYYY-MM-DDT00:00:00.000Z", and
 * formatting it through the browser's local time (formatDate) shows the previous day
 * in Chile. formatDbDate reads the civil date straight from the string instead. */

/* ── Santiago calendar dates (CAL-008b doctrine: never the UTC date) ── */

const santiagoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD of an instant in America/Santiago. */
export const santiagoDate = (instant: Date | string) => santiagoDay.format(new Date(instant));

/** Today's YYYY-MM-DD in America/Santiago. */
export const santiagoToday = () => santiagoDate(new Date());

/** Adds calendar days to a YYYY-MM-DD (UTC arithmetic on the civil date — no shift). */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (both YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** A @db.Date value ("YYYY-MM-DDT00:00:00.000Z") as its civil date. */
export const civilDate = (value: string) => value.slice(0, 10);

/** dd-mm-aaaa of a YYYY-MM-DD. */
export const formatDmy = (ymd: string) =>
  `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}`;

/* ── Renders ── */

/** dd-mm-aaaa of a @db.Date, from its civil date (never through local time). */
export const formatDbDate = (value: string) => formatDmy(civilDate(value));

/** dd-mm-aaaa of an instant, in America/Santiago. */
export const formatSantiagoDate = (instant: Date | string) => formatDmy(santiagoDate(instant));

/** «Hoy» · «Ayer» · «Hace N días», counted in Santiago calendar days (future reads «Hoy»). */
export function relativeDayLabel(instant: Date | string): string {
  const days = daysBetween(santiagoDate(instant), santiagoToday());
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}
