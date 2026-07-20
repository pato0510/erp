/* MKT-004 — neutral month-grid date math for the SHARED calendar views. Pure date
   primitives, ZERO domain coupling (no event types, no severity, no TYPE_META). These
   are the same primitives the Operaciones calendar has always used (Monday-first weeks,
   local-time day keys — the calendar is always shown in the user's TZ). Extracted here
   so both Operaciones and Marketing render off ONE month-grid implementation. */

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function startOfWeek(d: Date): Date {
  // Monday-first week (es-CL). JS getDay() is 0..6 with 0=Sunday, so shift.
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const out = startOfDay(d);
  out.setDate(out.getDate() - offset);
  return out;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

export function endOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setMonth(out.getMonth() + 1);
  out.setDate(0);
  out.setHours(23, 59, 59, 999);
  return out;
}

/* Month-grid range — start of the first week containing day 1, end of the last week
   containing the final day. Always yields a clean 7-column grid (35 or 42 cells). */
export function startOfMonthGrid(d: Date): Date {
  return startOfWeek(startOfMonth(d));
}
export function endOfMonthGrid(d: Date): Date {
  return endOfWeek(endOfMonth(d));
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* CAL-004 — pure es-CL long-day label ("lunes, 15 de julio de 2026"), used by the shared
   DayView header. Domain-agnostic — moved alongside DAY_NAMES_SHORT so the shared Week/Day
   views render off ONE date module (identical output to the ops utils.formatLongDay). */
export function formatLongDay(d: Date): string {
  return d.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export const DAY_NAMES_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
