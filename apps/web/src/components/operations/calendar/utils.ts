import type { CalendarEvent, CalendarSeverity } from './types';

/* Date math helpers. We work in local time on purpose — the calendar
   is always displayed in the user's TZ (Chile by default) and all
   inputs come from the user's clock. Server queries pass ISO strings
   so the timezone difference doesn't bite. */

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function startOfWeek(d: Date): Date {
  /* Monday-first week, matching es-CL convention. JS getDay() returns
     0..6 with 0=Sunday so we shift. */
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

/* Month-grid range — start of the first week containing day 1 of
   the month, end of the last week containing the final day. Always
   yields 35 or 42 cells for a clean 7-column grid. */
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

/* Bucket events by their dateKey (YYYY-MM-DD) so the views can do
   O(1) lookups instead of scanning the array per cell. Multi-day
   work permits get bucketed only on their start day; the views can
   special-case them when needed. */
export function bucketEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const out = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dateKey(new Date(e.date));
    const list = out.get(key) ?? [];
    list.push(e);
    out.set(key, list);
  }
  /* Sort each day's events by severity desc then time asc — most
     urgent items lead. */
  for (const [k, list] of out) {
    list.sort((a, b) => {
      const sa = severityRank(a.severity);
      const sb = severityRank(b.severity);
      if (sa !== sb) return sb - sa;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    out.set(k, list);
  }
  return out;
}

export function severityRank(s: CalendarSeverity): number {
  switch (s) {
    case 'BLOCKING':
      return 4;
    case 'CRITICAL':
      return 3;
    case 'WARNING':
      return 2;
    case 'INFO':
      return 1;
  }
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateKeyFromIso(iso: string): string {
  return dateKey(new Date(iso));
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWeekRange(d: Date): string {
  const start = startOfWeek(d);
  const end = endOfWeek(d);
  if (start.getMonth() === end.getMonth()) {
    return `Semana del ${start.getDate()}–${end.getDate()} ${MONTH_NAMES[start.getMonth()]} ${end.getFullYear()}`;
  }
  return `Semana del ${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
}

export function formatLongDay(d: Date): string {
  return d.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortTime(d: Date): string {
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export const DAY_NAMES_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/* For an event with both date and endDate, returns whether the event
   spans into a given day (inclusive). Used by week/day views to
   show in-progress work permits across multiple cells. */
export function eventSpansDay(e: CalendarEvent, day: Date): boolean {
  if (!e.endDate) return isSameDay(new Date(e.date), day);
  const start = startOfDay(new Date(e.date));
  const end = endOfDay(new Date(e.endDate));
  const probe = startOfDay(day);
  return probe.getTime() >= start.getTime() && probe.getTime() <= end.getTime();
}
