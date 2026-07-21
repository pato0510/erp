'use client';

import { useMemo, type ReactNode } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { formatLongDay, isToday } from './dateGrid';

/* CAL-004 — the SHARED, domain-agnostic day agenda (extracted verbatim in behavior from the
   Operaciones DayView, then parameterized like MonthView<T> / WeekView<T>). It knows nothing
   about permits, severities or TYPE_META: callers pass a generic event with `id` + `date` plus
   accessors for the chip color, title, short badge, an OPTIONAL severity badge, and — the
   lifted ops coupling — the optional per-event time string. Rendering (long-day header,
   hour grouping with "Todo el día" floated to top, the card with its 3px left border) is
   identical to the previous ops view. */

export interface CalendarDayEvent {
  id: string;
  date: string; // ISO / date string; the hour grouping reads the LOCAL clock of this date
}

interface DayViewProps<T extends CalendarDayEvent> {
  focusedDate: Date;
  events: T[];
  onSelectEvent: (event: T) => void;
  /** Card background + text/border color for an event. */
  getChipStyle: (event: T) => { bg: string; color: string };
  /** Card title text. */
  getChipLabel: (event: T) => string;
  /** Short code badge (e.g. "PT", "DOC"). */
  getChipBadge: (event: T) => string;
  /** Optional leading icon node next to the title (e.g. a birthday Cake). Omitted → nothing. */
  getChipIcon?: (event: T) => ReactNode;
  /** Optional second badge (e.g. severity). null → no badge rendered for this event. */
  getSeverityBadge?: (event: T) => { label: string; color: string; bg: string } | null;
  /** Optional pre-formatted time string (e.g. "08:00 – 12:00"); null → no time shown. This is
   *  the lifted `work_permit_scheduled` coupling — the CALLER decides which events carry a
   *  clock. */
  getEventTime?: (event: T) => string | null;
}

export function DayView<T extends CalendarDayEvent>({
  focusedDate,
  events,
  onSelectEvent,
  getChipStyle,
  getChipLabel,
  getChipBadge,
  getChipIcon,
  getSeverityBadge,
  getEventTime,
}: DayViewProps<T>) {
  /* Filter to events whose date falls on the focused day. */
  const dayEvents = useMemo(() => {
    return events.filter((e) => {
      const d = new Date(e.date);
      return (
        d.getFullYear() === focusedDate.getFullYear() &&
        d.getMonth() === focusedDate.getMonth() &&
        d.getDate() === focusedDate.getDate()
      );
    });
  }, [events, focusedDate]);

  const today = isToday(focusedDate);
  const grouped = useMemo(() => groupByHour(dayEvents), [dayEvents]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
      <header className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[var(--text-secondary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)] capitalize">
            {formatLongDay(focusedDate)}
          </h3>
        </div>
        {today && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            Hoy
          </span>
        )}
      </header>

      {dayEvents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-[var(--text-secondary)]">
          <Clock size={20} className="opacity-60" />
          Sin eventos en este día.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-color)]">
          {grouped.map(({ hour, events }) => (
            <li key={hour} className="flex gap-3 px-4 py-3">
              <div className="w-14 shrink-0 pt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                {hour}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                {events.map((e) => (
                  <DayEventCard
                    key={e.id}
                    event={e}
                    onClick={onSelectEvent}
                    getChipStyle={getChipStyle}
                    getChipLabel={getChipLabel}
                    getChipBadge={getChipBadge}
                    getChipIcon={getChipIcon}
                    getSeverityBadge={getSeverityBadge}
                    getEventTime={getEventTime}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DayEventCard<T extends CalendarDayEvent>({
  event,
  onClick,
  getChipStyle,
  getChipLabel,
  getChipBadge,
  getChipIcon,
  getSeverityBadge,
  getEventTime,
}: {
  event: T;
  onClick: (e: T) => void;
  getChipStyle: (e: T) => { bg: string; color: string };
  getChipLabel: (e: T) => string;
  getChipBadge: (e: T) => string;
  getChipIcon?: (e: T) => ReactNode;
  getSeverityBadge?: (e: T) => { label: string; color: string; bg: string } | null;
  getEventTime?: (e: T) => string | null;
}) {
  const style = getChipStyle(event);
  const sev = getSeverityBadge?.(event) ?? null;
  const time = getEventTime?.(event) ?? null;
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex items-start gap-3 rounded-md p-3 text-left transition-colors hover:opacity-95"
      style={{
        backgroundColor: style.bg,
        borderLeft: `3px solid ${style.color}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ backgroundColor: 'rgba(255,255,255,0.4)', color: style.color }}
          >
            {getChipBadge(event)}
          </span>
          {sev && (
            <span
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
              style={{ backgroundColor: sev.bg, color: sev.color }}
            >
              {sev.label}
            </span>
          )}
          {time && (
            <span className="text-[10px] font-mono text-[var(--text-secondary)]">{time}</span>
          )}
        </div>
        <div
          className="mt-1 flex items-center gap-1.5 text-sm font-medium"
          style={{ color: style.color }}
        >
          {getChipIcon?.(event)}
          {getChipLabel(event)}
        </div>
      </div>
    </button>
  );
}

function groupByHour<T extends CalendarDayEvent>(
  events: T[],
): Array<{ hour: string; events: T[] }> {
  const map = new Map<string, T[]>();
  for (const e of events) {
    const d = new Date(e.date);
    const isMidnight = d.getHours() === 0 && d.getMinutes() === 0;
    const label = isMidnight ? 'Todo el día' : `${String(d.getHours()).padStart(2, '0')}:00`;
    const list = map.get(label) ?? [];
    list.push(e);
    map.set(label, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => {
      /* "Todo el día" floats to the top; numeric hours sort numerically. */
      if (a[0] === 'Todo el día') return -1;
      if (b[0] === 'Todo el día') return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([hour, events]) => ({ hour, events }));
}

export default DayView;
