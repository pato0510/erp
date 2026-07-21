'use client';

import { useMemo, type ReactNode } from 'react';
import { addDays, DAY_NAMES_SHORT, dateKey, isToday, isWeekend, startOfWeek } from './dateGrid';

/* CAL-004 — the SHARED, domain-agnostic week grid (extracted verbatim in behavior from the
   Operaciones WeekView, then parameterized exactly like MonthView<T>). It knows nothing about
   permits, documents, severities or TYPE_META: callers pass a generic event with `id` + `date`
   plus accessors for the chip color, title, short badge and — the lifted ops coupling — the
   optional per-event time string. Rendering (7 day columns, today/weekend shading, "Sin
   eventos", the card with its 3px left border) is identical to the previous ops view. */

export interface CalendarWeekEvent {
  id: string;
  date: string; // ISO / date string; bucketed by LOCAL dateKey (calendar shown in user's TZ)
}

interface WeekViewProps<T extends CalendarWeekEvent> {
  focusedDate: Date;
  events: T[];
  onSelectEvent: (event: T) => void;
  /** Card background + text/border color for an event. */
  getChipStyle: (event: T) => { bg: string; color: string };
  /** Card title text. */
  getChipLabel: (event: T) => string;
  /** Short code badge (e.g. "PT", "DOC"). */
  getChipBadge: (event: T) => string;
  /** Optional leading icon node inside the card (e.g. a birthday Cake). Omitted → nothing. */
  getChipIcon?: (event: T) => ReactNode;
  /** Optional pre-formatted time string (e.g. "08:00 – 12:00"); null → no time shown. This is
   *  the lifted `work_permit_scheduled` coupling — the CALLER decides which events carry a
   *  clock. */
  getEventTime?: (event: T) => string | null;
  /** Optional within-day ordering (e.g. by severity). Default: input order preserved. */
  sortDayEvents?: (a: T, b: T) => number;
}

export function WeekView<T extends CalendarWeekEvent>({
  focusedDate,
  events,
  onSelectEvent,
  getChipStyle,
  getChipLabel,
  getChipBadge,
  getChipIcon,
  getEventTime,
  sortDayEvents,
}: WeekViewProps<T>) {
  const days = useMemo(() => {
    const start = startOfWeek(focusedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
      <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-[var(--border-color)]">
        {days.map((day, i) => {
          const today = isToday(day);
          const weekend = isWeekend(day);
          const list = eventsByDay.get(dateKey(day)) ?? [];
          return (
            <div
              key={i}
              className={`flex min-h-[160px] flex-col px-2 py-2 ${
                today
                  ? 'bg-blue-50/60 dark:bg-blue-950/20'
                  : weekend
                    ? 'bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]'
                    : ''
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                    {DAY_NAMES_SHORT[i]}
                  </span>
                  <span
                    className={`text-base font-semibold ${
                      today ? 'text-blue-600' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
                {today && (
                  <span className="rounded bg-blue-100 px-1 py-0 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Hoy
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {list.length === 0 ? (
                  <span className="text-[11px] italic text-[var(--text-secondary)] opacity-60">
                    Sin eventos
                  </span>
                ) : (
                  list.map((e) => (
                    <WeekEventCard
                      key={e.id}
                      event={e}
                      onClick={onSelectEvent}
                      getChipStyle={getChipStyle}
                      getChipLabel={getChipLabel}
                      getChipBadge={getChipBadge}
                      getChipIcon={getChipIcon}
                      getEventTime={getEventTime}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekEventCard<T extends CalendarWeekEvent>({
  event,
  onClick,
  getChipStyle,
  getChipLabel,
  getChipBadge,
  getChipIcon,
  getEventTime,
}: {
  event: T;
  onClick: (e: T) => void;
  getChipStyle: (e: T) => { bg: string; color: string };
  getChipLabel: (e: T) => string;
  getChipBadge: (e: T) => string;
  getChipIcon?: (e: T) => ReactNode;
  getEventTime?: (e: T) => string | null;
}) {
  const style = getChipStyle(event);
  const time = getEventTime?.(event) ?? null;
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex flex-col gap-1 rounded-md p-2 text-left transition-colors hover:opacity-90"
      style={{
        backgroundColor: style.bg,
        borderLeft: `3px solid ${style.color}`,
      }}
    >
      {time && (
        <span className="text-[10px] font-mono" style={{ color: style.color, opacity: 0.85 }}>
          {time}
        </span>
      )}
      <span className="flex items-start gap-1 text-xs font-medium" style={{ color: style.color }}>
        {getChipIcon?.(event)}
        <span className="line-clamp-2">{getChipLabel(event)}</span>
      </span>
      <span
        className="inline-flex w-fit items-center rounded px-1 py-0 text-[9px] font-semibold tracking-wide"
        style={{ backgroundColor: 'rgba(255,255,255,0.45)', color: style.color }}
      >
        {getChipBadge(event)}
      </span>
    </button>
  );
}

export default WeekView;
