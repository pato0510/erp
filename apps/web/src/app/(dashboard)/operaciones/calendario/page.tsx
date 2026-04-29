'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { DayView } from '../../../../components/operations/calendar/DayView';
import { EventDetailModal } from '../../../../components/operations/calendar/EventDetailModal';
import { ListView } from '../../../../components/operations/calendar/ListView';
import { MonthView } from '../../../../components/operations/calendar/MonthView';
import { WeekView } from '../../../../components/operations/calendar/WeekView';
import {
  ALL_SEVERITIES,
  ALL_TYPES,
  TYPE_META,
} from '../../../../components/operations/calendar/types';
import type {
  CalendarEvent,
  CalendarEventsResponse,
  CalendarEventType,
  CalendarFilters,
  CalendarSeverity,
  CalendarView,
} from '../../../../components/operations/calendar/types';
import {
  addDays,
  endOfDay,
  endOfMonthGrid,
  endOfWeek,
  formatLongDay,
  formatMonthYear,
  formatWeekRange,
  startOfDay,
  startOfMonthGrid,
  startOfWeek,
} from '../../../../components/operations/calendar/utils';

const VIEW_STORAGE_KEY = 'ops-calendar-view';
const VIEWS: CalendarView[] = ['month', 'week', 'day', 'list'];

const DEFAULT_FILTERS: CalendarFilters = {
  types: [...ALL_TYPES],
  assetId: null,
  locationId: null,
  severity: null,
};

interface PendingControllerRef {
  controller: AbortController | null;
}

/* ---- URL sync helpers --------------------------------------- */

function readDateFromUrl(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function writeDateToUrl(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* For each view, what server-side range do we ask for? */
function rangeForView(view: CalendarView, focusedDate: Date): { start: Date; end: Date } {
  switch (view) {
    case 'month':
      return { start: startOfMonthGrid(focusedDate), end: endOfMonthGrid(focusedDate) };
    case 'week':
      return { start: startOfWeek(focusedDate), end: endOfWeek(focusedDate) };
    case 'day':
      return { start: startOfDay(focusedDate), end: endOfDay(focusedDate) };
    case 'list': {
      /* Show the focused month plus one month of padding either side
         so scrolling forward/back stays snappy. */
      const start = startOfDay(addDays(focusedDate, -45));
      const end = endOfDay(addDays(focusedDate, 45));
      return { start, end };
    }
  }
}

function navigateBy(view: CalendarView, focusedDate: Date, direction: -1 | 1): Date {
  const next = new Date(focusedDate);
  switch (view) {
    case 'month':
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      return next;
    case 'week':
      next.setDate(next.getDate() + 7 * direction);
      return next;
    case 'day':
      next.setDate(next.getDate() + direction);
      return next;
    case 'list':
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      return next;
  }
}

function periodLabel(view: CalendarView, focusedDate: Date): string {
  switch (view) {
    case 'month':
      return formatMonthYear(focusedDate);
    case 'week':
      return formatWeekRange(focusedDate);
    case 'day':
      return formatLongDay(focusedDate);
    case 'list':
      return formatMonthYear(focusedDate);
  }
}

/* ---- Page ---------------------------------------------------- */

export default function OperacionesCalendarioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  /* Initial view: URL → localStorage → mobile-default → 'month'. The
     mobile default falls through to a useEffect below since
     window isn't available during the initial render of a client
     component. */
  const initialViewRef = useRef<CalendarView>('month');
  if (initialViewRef.current === 'month') {
    const fromUrl = searchParams.get('view') as CalendarView | null;
    if (fromUrl && VIEWS.includes(fromUrl)) {
      initialViewRef.current = fromUrl;
    } else if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY) as CalendarView | null;
      if (stored && VIEWS.includes(stored)) {
        initialViewRef.current = stored;
      }
    }
  }
  const [view, setViewState] = useState<CalendarView>(initialViewRef.current);

  const initialDate = readDateFromUrl(searchParams.get('date')) ?? new Date();
  const [focusedDate, setFocusedDate] = useState<Date>(initialDate);

  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);
  const [response, setResponse] = useState<CalendarEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [exporting, setExporting] = useState(false);

  /* Mobile detection — defaults to List if no explicit URL or
     localStorage preference exists. We only run this once on mount. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = searchParams.get('view');
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!fromUrl && !stored && window.matchMedia('(max-width: 767px)').matches) {
      setViewState('list');
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    }
  }, []);

  /* Sync (view, date) into the URL using replaceState — keeps
     navigation clean (no extra history entries) and supports
     deep-linking. We use a debounced effect so rapid clicks don't
     spam the URL. */
  const urlSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (urlSyncTimer.current) clearTimeout(urlSyncTimer.current);
    urlSyncTimer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', view);
      params.set('date', writeDateToUrl(focusedDate));
      router.replace(`/operaciones/calendario?${params.toString()}`, { scroll: false });
    }, 150);
    return () => {
      if (urlSyncTimer.current) clearTimeout(urlSyncTimer.current);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [view, focusedDate]);

  /* Fetch events when view/date/filters change. We cancel the prior
     in-flight request so a fast click-through doesn't paint stale
     data into a newer view. */
  const pendingRef = useRef<PendingControllerRef>({ controller: null });
  const fetchEvents = useCallback(async () => {
    pendingRef.current.controller?.abort();
    const controller = new AbortController();
    pendingRef.current.controller = controller;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = rangeForView(view, focusedDate);
      const params = new URLSearchParams();
      params.set('startDate', start.toISOString());
      params.set('endDate', end.toISOString());
      if (filters.types.length > 0 && filters.types.length < ALL_TYPES.length) {
        params.set('types', filters.types.join(','));
      }
      if (filters.assetId) params.set('assetId', filters.assetId);
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.severity) params.set('severity', filters.severity);
      const data = await apiClient.get<CalendarEventsResponse>(
        `/api/operations/calendar/events?${params.toString()}`,
      );
      if (controller.signal.aborted) return;
      setResponse(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg =
        err instanceof Error ? err.message : 'No se pudieron cargar los eventos del calendario.';
      setError(msg);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [view, focusedDate, filters]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const events = response?.events ?? [];
  const summary = response?.summary;

  /* ---- Handlers -------------------------------------------- */

  const goPrev = useCallback(() => {
    setFocusedDate((d) => navigateBy(view, d, -1));
  }, [view]);
  const goNext = useCallback(() => {
    setFocusedDate((d) => navigateBy(view, d, 1));
  }, [view]);
  const goToday = useCallback(() => setFocusedDate(new Date()), []);

  const onPickDate = useCallback((value: string) => {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) setFocusedDate(d);
  }, []);

  const onSelectDayFromMonth = useCallback(
    (day: Date) => {
      setFocusedDate(day);
      setView('day');
    },
    [setView],
  );

  const toggleType = useCallback((t: CalendarEventType) => {
    setFilters((f) => {
      const set = new Set(f.types);
      if (set.has(t)) set.delete(t);
      else set.add(t);
      /* Don't allow zero types — empty would be confusing; reset to
         all instead. */
      const next = Array.from(set);
      return { ...f, types: next.length === 0 ? [...ALL_TYPES] : next };
    });
  }, []);

  const setSeverityFilter = useCallback((s: CalendarSeverity | null) => {
    setFilters((f) => ({ ...f, severity: s }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { start, end } = rangeForView(view, focusedDate);
      const params = new URLSearchParams();
      params.set('startDate', start.toISOString());
      params.set('endDate', end.toISOString());
      params.set('format', 'ical');
      if (filters.types.length > 0 && filters.types.length < ALL_TYPES.length) {
        params.set('types', filters.types.join(','));
      }
      if (filters.assetId) params.set('assetId', filters.assetId);
      if (filters.locationId) params.set('locationId', filters.locationId);
      const blob = await apiClient.fetchBlob(
        `/api/operations/calendar/export?${params.toString()}`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `excelsia-operaciones-${writeDateToUrl(start)}-a-${writeDateToUrl(end)}.ics`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo exportar el calendario.';
      setError(msg);
    } finally {
      setExporting(false);
    }
  }, [view, focusedDate, filters]);

  /* KPI counts — derived from the summary so we don't recompute on
     every render. */
  const kpis = useMemo(() => {
    return {
      critical: (summary?.bySeverity.critical ?? 0) + (summary?.bySeverity.blocking ?? 0),
      warning: summary?.bySeverity.warning ?? 0,
      info: summary?.bySeverity.info ?? 0,
      total: summary?.total ?? 0,
    };
  }, [summary]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
        Operaciones / Calendario
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Calendario operacional
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Eventos y vencimientos del módulo de operaciones
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View switcher */}
          <div
            role="tablist"
            aria-label="Modo de vista"
            className="inline-flex overflow-hidden rounded-md border border-[var(--border-color)] text-xs"
          >
            {VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium transition ${
                  view === v
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]'
                }`}
              >
                {v === 'month' && 'Mes'}
                {v === 'week' && 'Semana'}
                {v === 'day' && 'Día'}
                {v === 'list' && 'Lista'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
          >
            <Download size={12} className={exporting ? 'animate-bounce' : ''} />
            Exportar (.ics)
          </button>
        </div>
      </div>

      {/* Navigation row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Anterior"
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Siguiente"
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            <ChevronRight size={14} />
          </button>
          <h2 className="ml-2 text-base font-semibold text-[var(--text-primary)] capitalize">
            {periodLabel(view, focusedDate)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-[var(--text-secondary)]" />
          <input
            type="date"
            value={writeDateToUrl(focusedDate)}
            onChange={(e) => onPickDate(e.target.value)}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
          />
          <button
            type="button"
            onClick={fetchEvents}
            disabled={loading}
            aria-label="Actualizar"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiPill
          label="Críticos"
          value={kpis.critical}
          icon={AlertCircle}
          fg="#b91c1c"
          bg="rgba(239,68,68,0.10)"
          active={filters.severity === 'CRITICAL' || filters.severity === 'BLOCKING'}
          onClick={() => setSeverityFilter(filters.severity === 'CRITICAL' ? null : 'CRITICAL')}
        />
        <KpiPill
          label="Warnings"
          value={kpis.warning}
          icon={AlertTriangle}
          fg="#a16207"
          bg="rgba(234,179,8,0.12)"
          active={filters.severity === 'WARNING'}
          onClick={() => setSeverityFilter(filters.severity === 'WARNING' ? null : 'WARNING')}
        />
        <KpiPill
          label="Info"
          value={kpis.info}
          icon={Info}
          fg="#1d4ed8"
          bg="rgba(37,99,235,0.10)"
          active={filters.severity === 'INFO'}
          onClick={() => setSeverityFilter(filters.severity === 'INFO' ? null : 'INFO')}
        />
        <KpiPill
          label="Total"
          value={kpis.total}
          icon={CalendarDays}
          fg="#475569"
          bg="rgba(100,116,139,0.10)"
        />
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 shadow-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Tipos
        </span>
        {ALL_TYPES.map((t) => {
          const meta = TYPE_META[t];
          const active = filters.types.includes(t);
          return (
            <button
              type="button"
              key={t}
              onClick={() => toggleType(t)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition"
              style={{
                backgroundColor: active ? meta.bg : 'transparent',
                color: active ? meta.color : 'var(--text-secondary)',
                border: `1px solid ${active ? meta.color : 'var(--border-color)'}`,
                opacity: active ? 1 : 0.7,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={filters.severity ?? ''}
            onChange={(e) => setSeverityFilter((e.target.value || null) as CalendarSeverity | null)}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            <option value="">Todas las severidades</option>
            {ALL_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Limpiar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* The selected view */}
      <div className="relative">
        {loading && events.length === 0 ? (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center text-sm text-[var(--text-secondary)] shadow-sm">
            <RefreshCw size={18} className="mx-auto mb-2 animate-spin opacity-60" />
            Cargando eventos…
          </div>
        ) : view === 'month' ? (
          <MonthView
            focusedDate={focusedDate}
            events={events}
            onSelectDay={onSelectDayFromMonth}
            onSelectEvent={setSelectedEvent}
          />
        ) : view === 'week' ? (
          <WeekView focusedDate={focusedDate} events={events} onSelectEvent={setSelectedEvent} />
        ) : view === 'day' ? (
          <DayView focusedDate={focusedDate} events={events} onSelectEvent={setSelectedEvent} />
        ) : (
          <ListView events={events} onSelectEvent={setSelectedEvent} />
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
        <span className="font-semibold uppercase tracking-wide">Leyenda:</span>
        {ALL_TYPES.map((t) => {
          const meta = TYPE_META[t];
          return (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </span>
          );
        })}
      </div>

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

function KpiPill({
  label,
  value,
  icon: Icon,
  fg,
  bg,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number }>;
  fg: string;
  bg: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border bg-[var(--bg-card)] px-3 py-2.5 text-left transition ${
        interactive ? 'hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]' : ''
      }`}
      style={{
        borderColor: active ? fg : 'var(--border-color)',
        boxShadow: active ? `0 0 0 1px ${fg}` : undefined,
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-md"
        style={{ backgroundColor: bg, color: fg }}
      >
        <Icon size={14} />
      </span>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </span>
        <span
          className="font-mono text-lg font-semibold leading-none"
          style={{ color: active ? fg : 'var(--text-primary)' }}
        >
          {value}
        </span>
      </div>
    </button>
  );
}
