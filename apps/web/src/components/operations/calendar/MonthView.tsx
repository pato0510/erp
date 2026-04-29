'use client';

import { useMemo } from 'react';
import {
  addDays,
  bucketEventsByDay,
  DAY_NAMES_SHORT,
  dateKey,
  endOfMonthGrid,
  isSameMonth,
  isToday,
  isWeekend,
  startOfMonthGrid,
} from './utils';
import { TYPE_META } from './types';
import type { CalendarEvent } from './types';

interface MonthViewProps {
  focusedDate: Date;
  events: CalendarEvent[];
  onSelectDay: (day: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}

const MAX_VISIBLE_PER_CELL = 3;

export function MonthView({ focusedDate, events, onSelectDay, onSelectEvent }: MonthViewProps) {
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

  const eventsByDay = useMemo(() => bucketEventsByDay(events), [events]);

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
          /* Severity dots — a red/orange/blue triplet capped at 3
             dots each. Visual density without overwhelming the
             cell. */
          let critical = 0;
          let warning = 0;
          let info = 0;
          for (const e of list) {
            if (e.severity === 'CRITICAL' || e.severity === 'BLOCKING') critical++;
            else if (e.severity === 'WARNING') warning++;
            else info++;
          }
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onSelectDay(day)}
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

              {(critical > 0 || warning > 0 || info > 0) && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(3, critical) }).map((_, i) => (
                    <span key={`c-${i}`} className="h-1.5 w-1.5 rounded-full bg-red-600" />
                  ))}
                  {Array.from({ length: Math.min(3, warning) }).map((_, i) => (
                    <span key={`w-${i}`} className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                  ))}
                  {Array.from({ length: Math.min(3, info) }).map((_, i) => (
                    <span key={`i-${i}`} className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {visible.map((e) => {
                  const meta = TYPE_META[e.type];
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
                      title={e.title}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium hover:opacity-80"
                      style={{
                        backgroundColor: meta.bg,
                        color: meta.color,
                        borderLeft: `2px solid ${meta.color}`,
                      }}
                    >
                      <span className="truncate">{e.title}</span>
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
