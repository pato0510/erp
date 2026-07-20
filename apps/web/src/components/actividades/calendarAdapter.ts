import { dateKey } from '../calendar/dateGrid';
import type { ActivityArea, CalendarActivity } from './activityTypes';

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
  id: string; // unique per rendered chip (activityId, or activityId:dayKey for ranged)
  date: string; // ISO of the exact instant this chip sits at (see localInstantIso)
  activity: CalendarActivity;
}

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
export function chipStyle(
  activity: CalendarActivity,
  area: ActivityArea | undefined,
): { bg: string; color: string } {
  const base = area?.color ?? NEUTRAL_COLOR;
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

/** Week within-day ordering: untimed first, then startTime asc (string compare is fine for
 *  "HH:mm"), then title. */
export function compareChips(a: ActivityChip, b: ActivityChip): number {
  const ta = a.activity.startTime;
  const tb = b.activity.startTime;
  if (!ta && tb) return -1;
  if (ta && !tb) return 1;
  if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
  return a.activity.title.localeCompare(b.activity.title);
}
