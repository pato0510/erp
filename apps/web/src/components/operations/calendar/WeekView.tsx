'use client';

import { useMemo } from 'react';
import {
  addDays,
  bucketEventsByDay,
  DAY_NAMES_SHORT,
  dateKey,
  formatShortTime,
  isToday,
  isWeekend,
  startOfWeek,
} from './utils';
import { TYPE_META } from './types';
import type { CalendarEvent } from './types';

interface WeekViewProps {
  focusedDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}

export function WeekView({ focusedDate, events, onSelectEvent }: WeekViewProps) {
  const days = useMemo(() => {
    const start = startOfWeek(focusedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [focusedDate]);

  const eventsByDay = useMemo(() => bucketEventsByDay(events), [events]);

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
                  list.map((e) => <WeekEventCard key={e.id} event={e} onClick={onSelectEvent} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekEventCard({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  const meta = TYPE_META[event.type];
  /* Show the time only when the event is a work permit (which has a
     real start clock). Other event types are deadline-style and
     showing 00:00 would be misleading. */
  const showTime = event.type === 'work_permit_scheduled';
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex flex-col gap-1 rounded-md p-2 text-left transition-colors hover:opacity-90"
      style={{
        backgroundColor: meta.bg,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      {showTime && (
        <span className="text-[10px] font-mono" style={{ color: meta.color, opacity: 0.85 }}>
          {formatShortTime(new Date(event.date))}
          {event.endDate ? ` – ${formatShortTime(new Date(event.endDate))}` : ''}
        </span>
      )}
      <span className="line-clamp-2 text-xs font-medium" style={{ color: meta.color }}>
        {event.title}
      </span>
      <span
        className="inline-flex w-fit items-center rounded px-1 py-0 text-[9px] font-semibold tracking-wide"
        style={{ backgroundColor: 'rgba(255,255,255,0.45)', color: meta.color }}
      >
        {meta.short}
      </span>
    </button>
  );
}

export default WeekView;
