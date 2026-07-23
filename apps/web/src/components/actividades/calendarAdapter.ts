import { dateKey } from '../calendar/dateGrid';
import type {
  ActivityArea,
  BirthdayEntry,
  CalendarActivity,
  ServicioCalendarEntry,
  VencimientoCalendarEntry,
} from './activityTypes';

/* CAL-005 — the adapter between CalendarActivity rows and the shared generic calendar views
   (the MKT-004/CAL-004 recipe). It turns each activity into one or more render "chips":
   - a single-day TIMED activity → ONE chip planted at its wall-clock instant (for the DayView
     hour bucket);
   - an untimed single-day or a multi-day RANGE → ONE local-midnight chip PER day it covers,
     clamped to the visible grid span (so the jul-27→ago-04 audit paints in both months).

   THE WALL-CLOCK CONTRACT (read before touching localInstantIso): startTime is a string. It
   becomes a Date in EXACTLY ONE place below — numeric LOCAL construction — never by
   string-parsing "YYYY-MM-DDTHH:mm" (implementation-defined) and never via UTC. The stored
   day is read from the UTC parts of startDate/endDate (@db.Date is UTC midnight); the clock is
   then re-planted in the viewer's LOCAL time, because the shared grid buckets by local clock
   (CAL-004's documented contract) and a 13:00 lunch is 13:00 in Antofagasta. */

export interface ActivityChip {
  kind: 'activity';
  id: string; // unique per rendered chip (activityId, or activityId:dayKey for ranged)
  date: string; // ISO of the exact instant this chip sits at (see localInstantIso)
  activity: CalendarActivity;
}

/* CAL-006 — a birthday render chip. Same {id, date} contract the shared views need; carries the
   PII-safe BirthdayEntry (no year). Untimed by nature → lands in the "Todo el día" bucket. */
export interface BirthdayChip {
  kind: 'birthday';
  id: string;
  date: string;
  birthday: BirthdayEntry;
}

/* CAL-016 — an ops SERVICIO render chip (a service order's execution window). Ranged like an
   activity → per-day expansion; untimed by nature. Carries the money-free ServicioCalendarEntry. */
export interface ServicioChip {
  kind: 'servicio';
  id: string;
  date: string;
  servicio: ServicioCalendarEntry;
}

/* CAL-016 — a VENCIMIENTO render chip (a single-day document expiration). Untimed → all-day. */
export interface VencimientoChip {
  kind: 'vencimiento';
  id: string;
  date: string;
  vencimiento: VencimientoCalendarEntry;
}

/* The unified chip the calendar page feeds to the shared generic views. */
export type CalChip = ActivityChip | BirthdayChip | ServicioChip | VencimientoChip;

/* CAL-016 — fixed collection styles, deliberately distinct from BOTH area colors AND the manual
   SERVICIO indigo (SERVICE_COLOR below): an ops servicio reads teal, a vencimiento reads amber
   (warning family). Paired with their own icons via the views' getChipIcon slot. */
export const OPS_SERVICIO_STYLE = { bg: 'rgba(13,148,136,0.16)', color: '#0d9488' } as const; // teal
export const VENCIMIENTO_STYLE = { bg: 'rgba(217,119,6,0.16)', color: '#d97706' } as const; // amber

/* Fixed festive style for birthday chips — deliberately NOT an area color, so a birthday reads
   as a birthday on any view (paired with the Cake icon via the views' getChipIcon slot). */
export const BIRTHDAY_STYLE = { bg: 'rgba(219,39,119,0.14)', color: '#db2777' } as const;

const NEUTRAL_COLOR = '#64748b'; // slate — fallback when an area has no catalog color

/** UTC calendar parts of an @db.Date string. The stored day is the UTC day; reading it in UTC
 *  keeps the calendar day from shifting by the viewer's timezone. */
function utcParts(iso: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

/** THE ONE PLACE the wall-clock startTime string becomes a Date: numeric LOCAL construction
 *  `new Date(year, monthIdx, day, HH, mm)`. This plants the activity at HH:mm in the viewer's
 *  LOCAL clock. Untimed → local midnight → the DayView "Todo el día" bucket. toISOString
 *  serializes that exact instant losslessly, so the shared views' `new Date(chip.date)`
 *  recovers the same local clock — no string round-trip, no UTC re-anchoring. */
function localInstantIso(y: number, m: number, d: number, startTime: string | null): string {
  if (startTime) {
    const [hh, mm] = startTime.split(':').map(Number);
    return new Date(y, m, d, hh, mm).toISOString();
  }
  return new Date(y, m, d, 0, 0).toISOString();
}

function inSpan(day: Date, gridStart: Date, gridEnd: Date): boolean {
  return day.getTime() >= gridStart.getTime() && day.getTime() <= gridEnd.getTime();
}

/** Expand one activity into the chips visible within [gridStart, gridEnd] (both LOCAL midnights,
 *  gridEnd end-of-day). */
export function activityToChips(
  activity: CalendarActivity,
  gridStart: Date,
  gridEnd: Date,
): ActivityChip[] {
  const start = utcParts(activity.startDate);
  // Ranged iff there is an endDate on a DIFFERENT day (compare UTC day strings — no Date needed).
  const isRanged =
    !!activity.endDate && activity.startDate.slice(0, 10) !== activity.endDate.slice(0, 10);

  // Single-day timed: one chip at the numeric-local HH:mm instant.
  if (!isRanged && activity.startTime) {
    const localMidnight = new Date(start.y, start.m, start.d, 0, 0);
    if (!inSpan(localMidnight, gridStart, gridEnd)) return [];
    return [
      {
        kind: 'activity',
        id: activity.id,
        date: localInstantIso(start.y, start.m, start.d, activity.startTime),
        activity,
      },
    ];
  }

  // Untimed single-day OR range: one local-midnight chip per covered day, clamped to the span.
  const chips: ActivityChip[] = [];
  const end = utcParts(activity.endDate ?? activity.startDate);
  let cursor = Date.UTC(start.y, start.m, start.d);
  const lastUtc = Date.UTC(end.y, end.m, end.d);
  while (cursor <= lastUtc) {
    const c = new Date(cursor);
    const localMidnight = new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), 0, 0);
    if (inSpan(localMidnight, gridStart, gridEnd)) {
      chips.push({
        kind: 'activity',
        id: `${activity.id}:${dateKey(localMidnight)}`,
        date: localMidnight.toISOString(),
        activity,
      });
    }
    cursor += 86_400_000; // +1 day, in UTC — immune to DST hour shifts
  }
  return chips;
}

/** Distinct YYYY-MM months touched by the visible grid span (LOCAL months of the grid bounds).
 *  The page fetches the feed for EACH and merges — the two-month week (jul-27) pulls both July
 *  and August so a cross-month range paints on both sides. */
export function monthsInSpan(start: Date, end: Date): string[] {
  const out: string[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  const ey = end.getFullYear();
  const em = end.getMonth();
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(100, 116, 139, ${alpha})`; // neutral if malformed
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Chip background + text/border color from the AREA's catalog color (neutral fallback when the
 *  area or its color is missing). HECHA renders dimmed (decision e): lower alpha on both. */
const SERVICE_COLOR = '#4f46e5'; // CAL-014 — indigo; SERVICIO chips read as services, NOT area-colored

export function chipStyle(
  activity: CalendarActivity,
  area: ActivityArea | undefined,
): { bg: string; color: string } {
  // CAL-014 — a SERVICIO uses a fixed service color (distinct from every area color), so it's
  // distinguishable at a glance from area-colored actividades (paired with the Cog icon).
  const base = activity.kind === 'SERVICIO' ? SERVICE_COLOR : (area?.color ?? NEUTRAL_COLOR);
  if (activity.status === 'HECHA') {
    return { bg: hexToRgba(base, 0.07), color: hexToRgba(base, 0.6) };
  }
  return { bg: hexToRgba(base, 0.16), color: base };
}

/** Chip label — HECHA gets a leading check (decision e). */
export function chipLabel(activity: CalendarActivity): string {
  return activity.status === 'HECHA' ? `✓ ${activity.title}` : activity.title;
}

/** Compact area identifier for the week/day chip badge: uppercase initials, max 3 chars. */
export function areaBadge(name: string): string {
  const connectors = new Set(['y', 'e', 'de', 'del', 'la', 'el', 'los', 'las']);
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => !connectors.has(w.toLowerCase()));
  const initials = words.length >= 2 ? words.map((w) => w[0]).join('') : name.trim().slice(0, 3);
  return initials.toUpperCase().slice(0, 3);
}

/* ── CAL-006: birthdays + unified (activity | birthday) chip accessors ───────────────── */

/** Map each fetched "YYYY-MM" to its year, so a birthday (which carries month but NO year) can
 *  be planted on the correct grid cell — including a two-month span (jul → ago) or a Dec→Jan
 *  wrap where the same month number would otherwise be ambiguous. */
export function monthYearMap(months: string[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    map.set(m, y);
  }
  return map;
}

/** Place a birthday on its day within the visible span. The year comes from the month→year map
 *  (the birthday itself has none); the chip sits at LOCAL midnight → the "Todo el día" bucket. */
export function birthdayToChip(
  birthday: BirthdayEntry,
  monthToYear: Map<number, number>,
  gridStart: Date,
  gridEnd: Date,
): BirthdayChip | null {
  const year = monthToYear.get(birthday.month);
  if (year === undefined) return null;
  const localMidnight = new Date(year, birthday.month - 1, birthday.day, 0, 0);
  if (!inSpan(localMidnight, gridStart, gridEnd)) return null;
  return {
    kind: 'birthday',
    id: `bday:${birthday.employeeId}:${birthday.month}`,
    date: localMidnight.toISOString(),
    birthday,
  };
}

/* ── CAL-016: ops servicios (ranged) + vencimientos (single-day) chip expanders ───────── */

/** Expand one ops servicio into per-day chips within [gridStart, gridEnd] — identical shape to a
 *  ranged activity (one local-midnight chip per covered day, clamped to the span), so a
 *  jul-21→ago-01 order paints in BOTH July and August. Days are stepped in UTC (DST-immune). */
export function servicioToChips(
  servicio: ServicioCalendarEntry,
  gridStart: Date,
  gridEnd: Date,
): ServicioChip[] {
  const start = utcParts(servicio.executionStart);
  const end = utcParts(servicio.executionEnd);
  const chips: ServicioChip[] = [];
  let cursor = Date.UTC(start.y, start.m, start.d);
  const lastUtc = Date.UTC(end.y, end.m, end.d);
  while (cursor <= lastUtc) {
    const c = new Date(cursor);
    const localMidnight = new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), 0, 0);
    if (inSpan(localMidnight, gridStart, gridEnd)) {
      chips.push({
        kind: 'servicio',
        id: `svc:${servicio.serviceOrderId}:${dateKey(localMidnight)}`,
        date: localMidnight.toISOString(),
        servicio,
      });
    }
    cursor += 86_400_000;
  }
  return chips;
}

/** Place a single-day vencimiento on its expiration day within the visible span. */
export function vencimientoToChip(
  vencimiento: VencimientoCalendarEntry,
  gridStart: Date,
  gridEnd: Date,
): VencimientoChip | null {
  const { y, m, d } = utcParts(vencimiento.date);
  const localMidnight = new Date(y, m, d, 0, 0);
  if (!inSpan(localMidnight, gridStart, gridEnd)) return null;
  return {
    kind: 'vencimiento',
    id: `venc:${vencimiento.id}`,
    date: localMidnight.toISOString(),
    vencimiento,
  };
}

/** Chip background/color: area color for activities (dimmed if HECHA), fixed festive for
 *  birthdays, teal for ops servicios, amber (warning) for vencimientos. */
export function chipStyleFor(
  chip: CalChip,
  areaById: Map<string, ActivityArea>,
): { bg: string; color: string } {
  if (chip.kind === 'birthday') return { ...BIRTHDAY_STYLE };
  if (chip.kind === 'servicio') return { ...OPS_SERVICIO_STYLE };
  if (chip.kind === 'vencimiento') return { ...VENCIMIENTO_STYLE };
  return chipStyle(chip.activity, areaById.get(chip.activity.areaId));
}

/** Chip label: activity title (✓ if HECHA), birthday fullName, or the ops entry label. */
export function chipLabelFor(chip: CalChip): string {
  if (chip.kind === 'birthday') return chip.birthday.fullName;
  if (chip.kind === 'servicio') return chip.servicio.label;
  if (chip.kind === 'vencimiento') return chip.vencimiento.label;
  return chipLabel(chip.activity);
}

/** Week/Day chip badge: area initials for activities, short tags for the other collections. */
export function chipBadgeFor(chip: CalChip, areaById: Map<string, ActivityArea>): string {
  if (chip.kind === 'birthday') return 'CUMPLE';
  if (chip.kind === 'servicio') return 'OPS';
  if (chip.kind === 'vencimiento') return 'VENCE';
  return areaBadge(areaById.get(chip.activity.areaId)?.name ?? '—');
}

/** getEventTime: the raw wall-clock string for a timed activity; every other collection is
 *  untimed (birthdays, ops servicios, vencimientos) → null. */
export function eventTimeFor(chip: CalChip): string | null {
  if (chip.kind === 'activity') return chip.activity.startTime ?? null;
  return null;
}

/** Within-day ordering: untimed first (birthdays/servicios/vencimientos included), then startTime
 *  asc, then label. */
export function compareCalChips(a: CalChip, b: CalChip): number {
  const ta = a.kind === 'activity' ? a.activity.startTime : null;
  const tb = b.kind === 'activity' ? b.activity.startTime : null;
  if (!ta && tb) return -1;
  if (ta && !tb) return 1;
  if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
  return chipLabelFor(a).localeCompare(chipLabelFor(b));
}
