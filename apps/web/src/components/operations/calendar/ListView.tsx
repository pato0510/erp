'use client';

import { useMemo, useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { formatLongDay, isToday } from './utils';
import { SEVERITY_META, TYPE_META } from './types';
import type { CalendarEvent } from './types';

interface ListViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  /* When set, only the first `pageSize` events render and the user
     can click "Cargar más" to reveal the next page. Defaults to 50
     which keeps the DOM cheap on month-sized event lists. */
  pageSize?: number;
}

export function ListView({ events, onSelectEvent, pageSize = 50 }: ListViewProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const grouped = useMemo(() => groupByDay(events), [events]);

  /* Paginate at the day-bucket level so we never split a day across
     a "load more" boundary — feels less jarring when scrolling
     through a long timeline. */
  const visible = useMemo(() => {
    let count = 0;
    const out: typeof grouped = [];
    for (const day of grouped) {
      out.push(day);
      count += day.events.length;
      if (count >= visibleCount) break;
    }
    return out;
  }, [grouped, visibleCount]);

  const totalEvents = events.length;
  const visibleEvents = visible.reduce((acc, d) => acc + d.events.length, 0);
  const hasMore = visibleEvents < totalEvents;

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-12 text-center text-sm text-[var(--text-secondary)] shadow-sm">
        <Calendar size={20} className="opacity-60" />
        Sin eventos en este rango.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
      <ul className="divide-y divide-[var(--border-color)]">
        {visible.map(({ key, day, events }) => (
          <li key={key} className="px-4 py-3">
            <header className="mb-2 flex items-baseline gap-2">
              <span
                className={`text-sm font-semibold capitalize ${
                  isToday(day) ? 'text-blue-600' : 'text-[var(--text-primary)]'
                }`}
              >
                {formatLongDay(day)}
              </span>
              {isToday(day) && (
                <span className="rounded bg-blue-100 px-1 py-0 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Hoy
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--text-secondary)]">
                {events.length} evento{events.length === 1 ? '' : 's'}
              </span>
            </header>
            <ul className="flex flex-col gap-1.5">
              {events.map((e) => (
                <li key={e.id}>
                  <ListEventRow event={e} onClick={onSelectEvent} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="border-t border-[var(--border-color)] px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + pageSize)}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Cargar más eventos
          </button>
        </div>
      )}
    </div>
  );
}

function ListEventRow({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  const meta = TYPE_META[event.type];
  const sev = SEVERITY_META[event.severity];
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
    >
      <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ backgroundColor: meta.bg, color: meta.color }}
          >
            {meta.short}
          </span>
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ backgroundColor: sev.bg, color: sev.color }}
          >
            {sev.label}
          </span>
          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
            {event.title}
          </span>
        </div>
      </div>
      <ChevronRight
        size={14}
        className="text-[var(--text-secondary)] transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

function groupByDay(
  events: CalendarEvent[],
): Array<{ key: string; day: Date; events: CalendarEvent[] }> {
  const map = new Map<string, { day: Date; events: CalendarEvent[] }>();
  for (const e of events) {
    const d = new Date(e.date);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    const slot = map.get(key) ?? { day: d, events: [] };
    slot.events.push(e);
    map.set(key, slot);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].day.getTime() - b[1].day.getTime())
    .map(([key, v]) => ({ key, ...v }));
}

export default ListView;
