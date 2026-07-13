'use client';

import { useMemo } from 'react';
import {
  addDays,
  DAY_NAMES_SHORT,
  dateKey,
  endOfMonthGrid,
  isSameMonth,
  isToday,
  isWeekend,
  startOfMonthGrid,
} from './dateGrid';

/* MKT-004 — the SHARED, domain-agnostic month grid (extracted verbatim in behavior
   from the Operaciones MonthView, then parameterized). It knows nothing about
   documents, permits, campaigns, severities or TYPE_META: callers pass a generic event
   with an `id` + `date`, plus accessors for the chip color/label and (optionally) the
   per-day indicator dots. Rendering — the 6×7 grid, today outline, weekend shading, the
   3-per-cell cap with "+N más", chip styling — is identical to the previous ops view. */

export interface CalendarMonthEvent {
  id: string;
  date: string; // ISO / date string; bucketed by LOCAL dateKey (calendar is shown in the user's TZ)
}

export interface DayIndicators {
  critical: number;
  warning: number;
  info: number;
}

interface MonthViewProps<T extends CalendarMonthEvent> {
  focusedDate: Date;
  events: T[];
  /** Chip background + text/border color for an event. */
  getChipStyle: (event: T) => { bg: string; color: string };
  /** Chip text + tooltip for an event. */
  getChipLabel: (event: T) => string;
  onSelectEvent: (event: T) => void;
  /** Optional day-cell click (e.g. drill into a day view). */
  onSelectDay?: (day: Date) => void;
  /** Optional within-day ordering (e.g. by severity). Default: input order preserved. */
  sortDayEvents?: (a: T, b: T) => number;
  /** Optional severity-dot indicators computed from a day's full event list. */
  getDayIndicators?: (dayEvents: T[]) => DayIndicators;
}

const MAX_VISIBLE_PER_CELL = 3;

export function MonthView<T extends CalendarMonthEvent>({
  focusedDate,
  events,
  getChipStyle,
  getChipLabel,
  onSelectEvent,
  onSelectDay,
  sortDayEvents,
  getDayIndicators,
}: MonthViewProps<T>) {
  const cells = useMemo(() => {
    const start = startOfMonthGrid(focusedDate);
    const end = endOfMonthGrid(focusedDate);
    const days: Date[] = [];
    let cursor = start;
    while (cursor.getTime() <= end.getTime()) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [focusedDate]);

  const eventsByDay = useMemo(() => {
    const out = new Map<string, T[]>();
    for (const e of events) {
      const key = dateKey(new Date(e.date));
      const list = out.get(key) ?? [];
      list.push(e);
      out.set(key, list);
    }
    if (sortDayEvents) {
      for (const [k, list] of out) {
        list.sort(sortDayEvents);
        out.set(k, list);
      }
    }
    return out;
  }, [events, sortDayEvents]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
      <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
        {DAY_NAMES_SHORT.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
          >
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-[repeat(6,minmax(96px,1fr))]">
        {cells.map((day, idx) => {
          const inMonth = isSameMonth(day, focusedDate);
          const today = isToday(day);
          const weekend = isWeekend(day);
          const list = eventsByDay.get(dateKey(day)) ?? [];
          const visible = list.slice(0, MAX_VISIBLE_PER_CELL);
          const overflow = list.length - visible.length;
          const dots = getDayIndicators && list.length > 0 ? getDayIndicators(list) : null;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onSelectDay?.(day)}
              className={`group relative flex flex-col gap-1 border-b border-r border-[var(--border-color)] px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] ${
                weekend && inMonth ? 'bg-[rgba(0,0,0,0.015)] dark:bg-[rgba(255,255,255,0.02)]' : ''
              }`}
              style={{
                opacity: inMonth ? 1 : 0.45,
                outline: today ? '2px solid #2563eb' : undefined,
                outlineOffset: today ? '-2px' : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold ${
                    today ? 'text-blue-600' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {day.getDate()}
                </span>
                {today && (
                  <span className="rounded bg-blue-100 px-1 py-0 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Hoy
                  </span>
                )}
              </div>

              {dots && (dots.critical > 0 || dots.warning > 0 || dots.info > 0) && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(3, dots.critical) }).map((_, i) => (
                    <span key={`c-${i}`} className="h-1.5 w-1.5 rounded-full bg-red-600" />
                  ))}
                  {Array.from({ length: Math.min(3, dots.warning) }).map((_, i) => (
                    <span key={`w-${i}`} className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                  ))}
                  {Array.from({ length: Math.min(3, dots.info) }).map((_, i) => (
                    <span key={`i-${i}`} className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {visible.map((e) => {
                  const style = getChipStyle(e);
                  const label = getChipLabel(e);
                  return (
                    <span
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectEvent(e);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          ev.stopPropagation();
                          onSelectEvent(e);
                        }
                      }}
                      title={label}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium hover:opacity-80"
                      style={{
                        backgroundColor: style.bg,
                        color: style.color,
                        borderLeft: `2px solid ${style.color}`,
                      }}
                    >
                      <span className="truncate">{label}</span>
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[10px] text-[var(--text-secondary)]">+{overflow} más</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MonthView;
