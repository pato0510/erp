'use client';

import { useMemo } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { formatLongDay, formatShortTime, isToday } from './utils';
import { SEVERITY_META, TYPE_META } from './types';
import type { CalendarEvent } from './types';

interface DayViewProps {
  focusedDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}

export function DayView({ focusedDate, events, onSelectEvent }: DayViewProps) {
  /* Filter to events whose date falls on the focused day. Multi-day
     work permits whose start lands today are included (the source
     query already only returns plannedStart in window, so this is
     mostly defensive). */
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
                  <DayEventCard key={e.id} event={e} onClick={onSelectEvent} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DayEventCard({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  const meta = TYPE_META[event.type];
  const sev = SEVERITY_META[event.severity];
  const isWorkPermit = event.type === 'work_permit_scheduled';
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex items-start gap-3 rounded-md p-3 text-left transition-colors hover:opacity-95"
      style={{
        backgroundColor: meta.bg,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ backgroundColor: 'rgba(255,255,255,0.4)', color: meta.color }}
          >
            {meta.short}
          </span>
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ backgroundColor: sev.bg, color: sev.color }}
          >
            {sev.label}
          </span>
          {isWorkPermit && event.endDate && (
            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
              {formatShortTime(new Date(event.date))} – {formatShortTime(new Date(event.endDate))}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-medium" style={{ color: meta.color }}>
          {event.title}
        </div>
      </div>
    </button>
  );
}

function groupByHour(events: CalendarEvent[]): Array<{ hour: string; events: CalendarEvent[] }> {
  const map = new Map<string, CalendarEvent[]>();
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
