'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cake, ChevronDown, ChevronLeft, ChevronRight, Cog, Plus, RefreshCw } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { MonthView } from '../../../../components/calendar/MonthView';
import { WeekView } from '../../../../components/calendar/WeekView';
import { DayView } from '../../../../components/calendar/DayView';
import {
  endOfMonth,
  endOfMonthGrid,
  endOfWeek,
  formatLongDay,
  startOfDay,
  startOfMonth,
  startOfMonthGrid,
  startOfWeek,
} from '../../../../components/calendar/dateGrid';
import {
  activityToChips,
  birthdayToChip,
  chipBadgeFor,
  chipLabelFor,
  chipStyleFor,
  compareCalChips,
  eventTimeFor,
  monthsInSpan,
  monthYearMap,
  type CalChip,
} from '../../../../components/actividades/calendarAdapter';
import { ActivityDetailModal } from '../../../../components/actividades/ActivityDetailModal';
import { ActivityFormModal } from '../../../../components/actividades/ActivityFormModal';
import { BirthdayModal } from '../../../../components/actividades/BirthdayModal';
import type {
  ActivityArea,
  BirthdayEntry,
  CalendarActivity,
  MemberOption,
} from '../../../../components/actividades/activityTypes';
import { useCanWriteActividades } from '../../../../hooks/useActividadesPermissions';

type View = 'month' | 'week' | 'day';
const VIEWS: View[] = ['month', 'week', 'day'];
const VIEW_LABEL: Record<View, string> = { month: 'Mes', week: 'Semana', day: 'Día' };

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function writeDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function endOfDayLocal(d: Date): Date {
  const e = startOfDay(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** The visible grid span (LOCAL bounds) for a view — drives both the feed fetch (which months)
 *  and the adapter clamp. */
function spanFor(view: View, focused: Date): { gridStart: Date; gridEnd: Date } {
  if (view === 'month')
    return { gridStart: startOfMonthGrid(focused), gridEnd: endOfMonthGrid(focused) };
  if (view === 'week') return { gridStart: startOfWeek(focused), gridEnd: endOfWeek(focused) };
  return { gridStart: startOfDay(focused), gridEnd: endOfDayLocal(focused) };
}

function periodLabel(view: View, focused: Date): string {
  if (view === 'day') return formatLongDay(focused);
  if (view === 'week') {
    const s = startOfWeek(focused);
    const e = endOfWeek(focused);
    if (s.getMonth() === e.getMonth()) {
      return `Semana del ${s.getDate()}–${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${e.getFullYear()}`;
    }
    return `Semana del ${s.getDate()} ${MONTH_NAMES[s.getMonth()]} – ${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${MONTH_NAMES[focused.getMonth()]} ${focused.getFullYear()}`;
}

function navigateBy(view: View, focused: Date, dir: -1 | 1): Date {
  const next = new Date(focused);
  if (view === 'month') {
    next.setDate(1);
    next.setMonth(next.getMonth() + dir);
  } else if (view === 'week') {
    next.setDate(next.getDate() + 7 * dir);
  } else {
    next.setDate(next.getDate() + dir);
  }
  return next;
}

export default function ActividadesCalendarioPage() {
  const canWrite = useCanWriteActividades('calendarActivity');

  const [view, setView] = useState<View>('month');
  const [focusedDate, setFocusedDate] = useState<Date>(new Date());

  const [areas, setAreas] = useState<ActivityArea[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [activities, setActivities] = useState<CalendarActivity[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [cancelled, setCancelled] = useState<CalendarActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAreaId, setFilterAreaId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'PENDIENTE' | 'HECHA'>('all');
  // CAL-014 — segmented control over the module's OWN rows (kind); default Todos. Birthdays are a
  // separate collection and ALWAYS render regardless.
  const [kindSeg, setKindSeg] = useState<'todos' | 'ACTIVIDAD' | 'SERVICIO'>('todos');

  const [selected, setSelected] = useState<CalendarActivity | null>(null);
  const [selectedBirthday, setSelectedBirthday] = useState<BirthdayEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarActivity | null>(null);
  const [cancelledOpen, setCancelledOpen] = useState(false);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  /* Areas + members: one fetch each on mount (the members map — CAL-008/009 — resolves
     responsable + bitácora author names; fetched ONCE per page, not per entry). */
  useEffect(() => {
    apiClient
      .get<ActivityArea[]>('/api/actividades/areas')
      .then(setAreas)
      .catch(() => setAreas([]));
    apiClient
      .get<MemberOption[]>('/api/actividades/members')
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  /* Feed: fetch EVERY month the visible grid touches and merge. Activities dedupe by id (a
     cross-month range fetched from both months collapses to one row). Birthdays (CAL-006) are
     deduped by employeeId+month — each birthday belongs to one month, so the concat across
     months is naturally disjoint; the Map is belt-and-suspenders. */
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { gridStart, gridEnd } = spanFor(view, focusedDate);
      const months = monthsInSpan(gridStart, gridEnd);
      const feeds = await Promise.all(
        months.map((m) =>
          apiClient.get<{ activities: CalendarActivity[]; birthdays: BirthdayEntry[] }>(
            `/api/actividades/calendar?month=${m}`,
          ),
        ),
      );
      const byId = new Map<string, CalendarActivity>();
      const bdayById = new Map<string, BirthdayEntry>();
      for (const f of feeds) {
        for (const a of f.activities) byId.set(a.id, a);
        for (const b of f.birthdays) bdayById.set(`${b.employeeId}:${b.month}`, b);
      }
      setActivities([...byId.values()]);
      setBirthdays([...bdayById.values()]);
    } catch {
      setError('No se pudieron cargar las actividades.');
    } finally {
      setLoading(false);
    }
  }, [view, focusedDate]);

  /* Canceladas: the LIST endpoint for the focused month (the plan's filter-accessible path for
     cancelled activities — never painted on the grid). */
  const fetchCancelled = useCallback(async () => {
    const from = writeDate(startOfMonth(focusedDate));
    const to = writeDate(endOfMonth(focusedDate));
    try {
      const list = await apiClient.get<CalendarActivity[]>(
        `/api/actividades/activities?status=CANCELADA&from=${from}&to=${to}`,
      );
      setCancelled(list);
    } catch {
      setCancelled([]);
    }
  }, [focusedDate]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);
  useEffect(() => {
    fetchCancelled();
  }, [fetchCancelled]);

  const refresh = useCallback(() => {
    fetchFeed();
    fetchCancelled();
  }, [fetchFeed, fetchCancelled]);

  const filtered = useMemo(
    () =>
      activities.filter(
        (a) =>
          (kindSeg === 'todos' || a.kind === kindSeg) && // CAL-014 — client-side kind segment
          (filterAreaId === 'all' || a.areaId === filterAreaId) &&
          (filterStatus === 'all' || a.status === filterStatus),
      ),
    [activities, kindSeg, filterAreaId, filterStatus],
  );

  const chips = useMemo<CalChip[]>(() => {
    const { gridStart, gridEnd } = spanFor(view, focusedDate);
    const activityChips = filtered.flatMap((a) => activityToChips(a, gridStart, gridEnd));
    // Birthdays ignore the área/estado filters (they have neither) — they always render.
    const monthToYear = monthYearMap(monthsInSpan(gridStart, gridEnd));
    const birthdayChips = birthdays
      .map((b) => birthdayToChip(b, monthToYear, gridStart, gridEnd))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    return [...activityChips, ...birthdayChips];
  }, [filtered, birthdays, view, focusedDate]);

  /* ---- shared wiring (identical accessors across the three views; union-aware) ---- */
  const getChipStyle = useCallback((chip: CalChip) => chipStyleFor(chip, areaById), [areaById]);
  const getChipLabel = useCallback((chip: CalChip) => chipLabelFor(chip), []);
  const getChipBadge = useCallback((chip: CalChip) => chipBadgeFor(chip, areaById), [areaById]);
  // getEventTime returns the RAW wall-clock string (no Date); birthdays are untimed → null.
  const getEventTime = useCallback((chip: CalChip) => eventTimeFor(chip), []);
  // Birthdays carry the Cake icon; SERVICIO activities carry the Cog (CAL-014 — distinct at a
  // glance from area-colored actividades, which carry none).
  const getChipIcon = useCallback(
    (chip: CalChip) =>
      chip.kind === 'birthday' ? (
        <Cake size={11} />
      ) : chip.activity.kind === 'SERVICIO' ? (
        <Cog size={11} />
      ) : null,
    [],
  );
  const onSelectEvent = useCallback((chip: CalChip) => {
    if (chip.kind === 'birthday') setSelectedBirthday(chip.birthday);
    else setSelected(chip.activity);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: CalendarActivity) => {
    setSelected(null);
    setEditing(a);
    setFormOpen(true);
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
        Actividades / Calendario
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Calendario de actividades
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Actividades internas de la empresa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: '#2563eb' }}
            >
              <Plus size={14} /> Nueva actividad
            </button>
          )}
        </div>
      </div>

      {/* Navigation row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFocusedDate((d) => navigateBy(view, d, -1))}
            aria-label="Anterior"
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setFocusedDate(new Date())}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setFocusedDate((d) => navigateBy(view, d, 1))}
            aria-label="Siguiente"
            className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            <ChevronRight size={14} />
          </button>
          <h2 className="ml-2 text-base font-semibold text-[var(--text-primary)] capitalize">
            {periodLabel(view, focusedDate)}
          </h2>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Actualizar"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 shadow-sm">
        {/* CAL-014 — segmented control over the module's own rows (kind). Birthdays always show. */}
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-color)] text-xs">
          {(['todos', 'ACTIVIDAD', 'SERVICIO'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindSeg(k)}
              className={`px-2.5 py-1 font-medium transition ${
                kindSeg === k
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]'
              }`}
            >
              {k === 'todos' ? 'Todos' : k === 'ACTIVIDAD' ? 'Actividades' : 'Servicios'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Área
          <select
            value={filterAreaId}
            onChange={(e) => setFilterAreaId(e.target.value)}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-normal normal-case text-[var(--text-primary)]"
          >
            <option value="all">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Estado
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'PENDIENTE' | 'HECHA')}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-normal normal-case text-[var(--text-primary)]"
          >
            <option value="all">Todas</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="HECHA">Hechas</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* The selected view */}
      <div className="relative">
        {loading && activities.length === 0 ? (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center text-sm text-[var(--text-secondary)] shadow-sm">
            <RefreshCw size={18} className="mx-auto mb-2 animate-spin opacity-60" />
            Cargando actividades…
          </div>
        ) : view === 'month' ? (
          <MonthView<CalChip>
            focusedDate={focusedDate}
            events={chips}
            onSelectDay={(day) => {
              setFocusedDate(day);
              setView('day');
            }}
            onSelectEvent={onSelectEvent}
            getChipStyle={getChipStyle}
            getChipLabel={getChipLabel}
            getChipIcon={getChipIcon}
            sortDayEvents={compareCalChips}
          />
        ) : view === 'week' ? (
          <WeekView<CalChip>
            focusedDate={focusedDate}
            events={chips}
            onSelectEvent={onSelectEvent}
            getChipStyle={getChipStyle}
            getChipLabel={getChipLabel}
            getChipBadge={getChipBadge}
            getChipIcon={getChipIcon}
            getEventTime={getEventTime}
            sortDayEvents={compareCalChips}
          />
        ) : (
          <DayView<CalChip>
            focusedDate={focusedDate}
            events={chips}
            onSelectEvent={onSelectEvent}
            getChipStyle={getChipStyle}
            getChipLabel={getChipLabel}
            getChipBadge={getChipBadge}
            getChipIcon={getChipIcon}
            getEventTime={getEventTime}
          />
        )}
      </div>

      {/* Canceladas — collapsed, filter-accessible (never painted on the grid). Hidden at 0. */}
      {cancelled.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
          <button
            type="button"
            onClick={() => setCancelledOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]"
          >
            <span>Canceladas ({cancelled.length})</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${cancelledOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {cancelledOpen && (
            <ul className="divide-y divide-[var(--border-color)] border-t border-[var(--border-color)]">
              {cancelled.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(a)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border-color)]"
                      style={{ background: areaById.get(a.areaId)?.color ?? '#64748b' }}
                    />
                    <span className="flex-1 truncate text-sm text-[var(--text-primary)] line-through opacity-70">
                      {a.title}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {a.startDate.slice(8, 10)}/{a.startDate.slice(5, 7)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selected && (
        <ActivityDetailModal
          activity={selected}
          area={areaById.get(selected.areaId)}
          members={members}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            refresh();
          }}
          onEdit={openEdit}
        />
      )}

      {formOpen && (
        <ActivityFormModal
          editing={editing}
          areas={areas}
          members={members}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {selectedBirthday && (
        <BirthdayModal birthday={selectedBirthday} onClose={() => setSelectedBirthday(null)} />
      )}
    </div>
  );
}
