'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2, PlaneLanding,
  X, Plus, AlertCircle, Filter,
} from 'lucide-react';
import { KpiCard } from '../../../../components/operations/dashboard/KpiCard';
import { apiClient } from '../../../../lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type AvailabilityStatus =
  | 'DISPONIBLE'
  | 'VACACIONES'
  | 'LICENCIA'
  | 'CAPACITACION'
  | 'ASIGNADO'
  | 'DIA_LIBRE';

interface CalendarItem {
  date: string;      // ISO date
  status: AvailabilityStatus;
  notes?: string | null;
}

interface CalendarRow {
  employeeId: string;
  employeeName: string;
  cargo: string;
  area: string;
  items: CalendarItem[];
}

interface AvailabilityRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  cargo: string;
  area: string;
  date: string;
  endDate?: string | null;
  status: AvailabilityStatus;
  notes?: string | null;
}

interface Employee {
  id: string;
  nombre: string;
  cargo: string;
  area: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  DISPONIBLE:   'Disponible',
  VACACIONES:   'Vacaciones',
  LICENCIA:     'Licencia',
  CAPACITACION: 'Capacitación',
  ASIGNADO:     'Asignado',
  DIA_LIBRE:    'Día libre',
};

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STATUS_STYLES: Record<AvailabilityStatus, StatusStyle> = {
  DISPONIBLE:   { bg: 'rgba(34,197,94,0.18)',   text: '#15803d', border: '#22c55e', dot: '#22c55e'  },
  VACACIONES:   { bg: 'rgba(59,130,246,0.18)',   text: '#1d4ed8', border: '#3b82f6', dot: '#3b82f6'  },
  LICENCIA:     { bg: 'rgba(239,68,68,0.18)',    text: '#b91c1c', border: '#ef4444', dot: '#ef4444'  },
  CAPACITACION: { bg: 'rgba(168,85,247,0.18)',   text: '#7e22ce', border: '#a855f7', dot: '#a855f7'  },
  ASIGNADO:     { bg: 'rgba(245,158,11,0.18)',   text: '#b45309', border: '#f59e0b', dot: '#f59e0b'  },
  DIA_LIBRE:    { bg: 'rgba(148,163,184,0.18)',  text: '#475569', border: '#94a3b8', dot: '#94a3b8'  },
};

const ALL_STATUSES: AvailabilityStatus[] = [
  'DISPONIBLE', 'VACACIONES', 'LICENCIA', 'CAPACITACION', 'ASIGNADO', 'DIA_LIBRE',
];

const CARGOS = [
  'Piloto de Drone',
  'Operador de Cámara',
  'Inspector Técnico',
  'Supervisor de Limpieza',
  'Auxiliar de Limpieza',
  'Técnico de Terreno',
  'Ejecutivo Comercial',
];

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/* ------------------------------------------------------------------ */
/*  Date helpers                                                        */
/* ------------------------------------------------------------------ */

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(y, m - 1, dd);
}

function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}
function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                            */
/* ------------------------------------------------------------------ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[rgba(128,128,128,0.12)] ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*  Status cell                                                         */
/* ------------------------------------------------------------------ */

interface CellProps {
  status: AvailabilityStatus | null;
  notes?: string | null;
  isToday: boolean;
  isWeekend: boolean;
  onClick: () => void;
}

function StatusCell({ status, notes, isToday, isWeekend, onClick }: CellProps) {
  const style = status ? STATUS_STYLES[status] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      title={status ? `${STATUS_LABELS[status]}${notes ? ` — ${notes}` : ''}` : 'Sin registro — clic para registrar'}
      className={[
        'relative w-full h-7 rounded transition-all focus:outline-none focus:ring-1 focus:ring-[#2563eb]',
        isToday ? 'ring-2 ring-[#2563eb] ring-inset' : '',
        isWeekend && !status ? 'opacity-40' : '',
        status ? 'hover:opacity-80' : 'hover:bg-[rgba(37,99,235,0.08)]',
      ].join(' ')}
      style={
        style
          ? { backgroundColor: style.bg, border: `1px solid ${style.border}20` }
          : { backgroundColor: isWeekend ? 'rgba(128,128,128,0.04)' : 'transparent', border: '1px solid transparent' }
      }
      aria-label={status ? STATUS_LABELS[status] : 'Sin registro'}
    >
      {status && (
        <span
          className="absolute inset-0 flex items-center justify-center"
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: style!.dot }}
          />
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Set-availability modal                                              */
/* ------------------------------------------------------------------ */

interface SetAvailModalProps {
  employeeId: string;
  employeeName: string;
  cargo: string;
  date: string;
  existingId?: string;
  existingStatus?: AvailabilityStatus;
  existingNotes?: string | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}

function SetAvailModal({
  employeeId, employeeName, cargo, date,
  existingId, existingStatus, existingNotes,
  onClose, onSaved,
}: SetAvailModalProps) {
  const [status, setStatus] = useState<AvailabilityStatus>(existingStatus ?? 'DISPONIBLE');
  const [notes, setNotes] = useState(existingNotes ?? '');
  const [endDate, setEndDate] = useState(date);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const isEdit = Boolean(existingId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        employeeId,
        date,
        endDate: endDate !== date ? endDate : undefined,
        status,
        notes: notes.trim() || undefined,
      };
      if (isEdit && existingId) {
        await apiClient.patch<unknown>(`/api/rrhh/availability/${existingId}`, { status, notes: notes.trim() || undefined });
      } else {
        await apiClient.post<unknown>('/api/rrhh/availability', body);
      }
      onSaved();
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingId) return;
    if (!confirm('¿Eliminar este registro de disponibilidad?')) return;
    setDeleting(true);
    try {
      await apiClient.delete<unknown>(`/api/rrhh/availability/${existingId}`);
      onSaved();
    } catch {
      setError('No se pudo eliminar.');
      setDeleting(false);
    }
  }

  const displayDate = (() => {
    const d = parseLocalDate(date);
    return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <form
        className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-2xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}>
              {isEdit ? 'Editar disponibilidad' : 'Registrar disponibilidad'}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {employeeName} &middot; {cargo} &middot; {displayDate}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-1.5 hover:bg-[rgba(128,128,128,0.12)] text-[var(--text-secondary)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {/* Status selector */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Estado</label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_STATUSES.map((s) => {
              const st = STATUS_STYLES[s];
              const active = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all text-left"
                  style={{
                    backgroundColor: active ? st.bg : 'transparent',
                    borderColor: active ? st.border : 'var(--border-color)',
                    color: active ? st.text : 'var(--text-secondary)',
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: st.dot }} />
                  {STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* End date (for multi-day) */}
        {!isEdit && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Hasta (opcional)</label>
            <input
              type="date"
              value={endDate}
              min={date}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">Deja igual para un solo día. Extiende para registrar un rango.</p>
          </div>
        )}

        {/* Notes */}
        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Notas (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Faena Los Andes, permiso especial…"
            className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors disabled:opacity-60"
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.08)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-[#2563eb] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60 transition-colors"
          >
            {saving ? 'Guardando…' : (isEdit ? 'Actualizar' : 'Guardar')}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend                                                              */
/* ------------------------------------------------------------------ */

function Legend() {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_STATUSES.map((s) => {
        const st = STATUS_STYLES[s];
        return (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}40` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
            {STATUS_LABELS[s]}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Board (horizontal scroll matrix)                                   */
/* ------------------------------------------------------------------ */

interface ModalTarget {
  employeeId: string;
  employeeName: string;
  cargo: string;
  date: string;
  existingId?: string;
  existingStatus?: AvailabilityStatus;
  existingNotes?: string | null;
}

interface BoardProps {
  rows: CalendarRow[];
  year: number;
  month: number;
  todayKey: string;
  onCellClick: (target: ModalTarget) => void;
}

function Board({ rows, year, month, todayKey, onCellClick }: BoardProps) {
  const numDays = daysInMonth(year, month);
  const days = Array.from({ length: numDays }, (_, i) => i + 1);

  // Pre-build lookup: employeeId → date → item
  const lookup = new Map<string, Map<string, CalendarItem>>();
  for (const row of rows) {
    const dayMap = new Map<string, CalendarItem>();
    for (const item of row.items) {
      dayMap.set(item.date.slice(0, 10), item);
    }
    lookup.set(row.employeeId, dayMap);
  }

  const isWeekendDay = (day: number) => {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
      <table className="border-collapse" style={{ minWidth: `${180 + numDays * 36}px` }}>
        {/* Header row: day numbers */}
        <thead>
          <tr className="border-b border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
            {/* Sticky employee column header */}
            <th
              className="sticky left-0 z-20 bg-[var(--bg-card)] border-r border-[var(--border-color)] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
              style={{ minWidth: 180 }}
            >
              Trabajador
            </th>
            {days.map((day) => {
              const dateKey = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isToday = dateKey === todayKey;
              const isWknd = isWeekendDay(day);
              const d = new Date(year, month, day);
              const dayName = ['Do','Lu','Ma','Mi','Ju','Vi','Sá'][d.getDay()];
              return (
                <th
                  key={day}
                  className={[
                    'px-1 py-2 text-center',
                    isToday ? 'bg-[rgba(37,99,235,0.08)]' : '',
                    isWknd ? 'opacity-50' : '',
                  ].join(' ')}
                  style={{ width: 36 }}
                >
                  <div className={`text-[8px] font-medium uppercase ${isToday ? 'text-[#2563eb]' : 'text-[var(--text-secondary)]'}`}>
                    {dayName}
                  </div>
                  <div className={`text-xs font-bold leading-tight ${isToday ? 'text-[#2563eb]' : 'text-[var(--text-primary)]'}`}>
                    {day}
                  </div>
                  {isToday && (
                    <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-[#2563eb]" />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Body rows */}
        <tbody className="divide-y divide-[var(--border-color)]">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={numDays + 1}
                className="py-16 text-center text-sm text-[var(--text-secondary)]"
              >
                <div className="flex flex-col items-center gap-2">
                  <Users size={32} className="opacity-30" />
                  <span>No hay trabajadores que coincidan con los filtros.</span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const dayMap = lookup.get(row.employeeId) ?? new Map();
              return (
                <tr
                  key={row.employeeId}
                  className="hover:bg-[rgba(37,99,235,0.02)] transition-colors group"
                >
                  {/* Employee label — sticky */}
                  <td
                    className="sticky left-0 z-10 bg-[var(--bg-card)] group-hover:bg-[rgba(37,99,235,0.03)] border-r border-[var(--border-color)] px-4 py-2 transition-colors"
                    style={{ minWidth: 180 }}
                  >
                    <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight truncate">
                      {row.employeeName}
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
                      {row.cargo}
                    </p>
                  </td>

                  {/* Day cells */}
                  {days.map((day) => {
                    const dateKey = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const isToday = dateKey === todayKey;
                    const isWknd = isWeekendDay(day);
                    const item = dayMap.get(dateKey) ?? null;

                    return (
                      <td
                        key={day}
                        className={`px-0.5 py-1 ${isToday ? 'bg-[rgba(37,99,235,0.04)]' : ''}`}
                        style={{ width: 36 }}
                      >
                        <StatusCell
                          status={item?.status ?? null}
                          notes={item?.notes}
                          isToday={isToday}
                          isWeekend={isWknd}
                          onClick={() =>
                            onCellClick({
                              employeeId: row.employeeId,
                              employeeName: row.employeeName,
                              cargo: row.cargo,
                              date: dateKey,
                              existingId: item ? (item as CalendarItem & { id?: string }).id : undefined,
                              existingStatus: item?.status ?? undefined,
                              existingNotes: item?.notes ?? null,
                            })
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Role group header                                                   */
/* ------------------------------------------------------------------ */

function RoleGroupHeader({ cargo, count }: { cargo: string; count: number }) {
  return (
    <div className="mb-2 mt-5 first:mt-0 flex items-center gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        {cargo}
      </span>
      <span className="rounded-full bg-[rgba(37,99,235,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">
        {count}
      </span>
      <div className="flex-1 h-px bg-[var(--border-color)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function DisponibilidadPage() {
  const today = new Date();
  const todayKey = toKey(today);

  /* ── Navigation state ── */
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  /* ── Filters ── */
  const [filterCargo, setFilterCargo] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  /* ── Data ── */
  const [calendarRows, setCalendarRows] = useState<CalendarRow[]>([]);
  const [availList, setAvailList] = useState<AvailabilityRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Modal ── */
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);

  /* ── KPI derivations ── */
  const disponiblesHoy = availList.filter(
    (r) => r.date.slice(0, 10) === todayKey && r.status === 'DISPONIBLE'
  ).length;
  const asignadosHoy = availList.filter(
    (r) => r.date.slice(0, 10) === todayKey && r.status === 'ASIGNADO'
  ).length;
  const ausentes = availList.filter(
    (r) =>
      r.date.slice(0, 10) === todayKey &&
      (r.status === 'VACACIONES' || r.status === 'LICENCIA')
  ).length;

  /* ── Fetch ── */
  const from = toKey(monthStart(year, month));
  const to = toKey(monthEnd(year, month));

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<CalendarRow[]>(`/api/rrhh/availability/calendar?from=${from}&to=${to}`),
      apiClient.get<AvailabilityRecord[]>(`/api/rrhh/availability?from=${from}&to=${to}`),
      apiClient.get<Employee[]>('/api/rrhh/employees'),
    ])
      .then(([cal, list, emps]) => {
        setCalendarRows(Array.isArray(cal) ? cal : []);
        setAvailList(Array.isArray(list) ? list : []);
        setEmployees(Array.isArray(emps) ? emps : []);
      })
      .catch(() => setError('No se pudo cargar la disponibilidad. Verifica la conexión.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Nav ── */
  const prevMonth = useCallback(() => {
    setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; });
  }, []);
  const nextMonth = useCallback(() => {
    setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; });
  }, []);
  const goToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.getFullYear(), today.getMonth()]);

  /* ── Build rows with availability map ── */
  // Merge calendarRows with availability records so cells can get IDs for PATCH
  const rowsWithIds: (CalendarRow & { itemsWithId: (CalendarItem & { id?: string })[] })[] =
    calendarRows.map((row) => {
      const employeeRecords = availList.filter((r) => r.employeeId === row.employeeId);
      const itemsWithId = row.items.map((item) => {
        const match = employeeRecords.find((r) => r.date.slice(0, 10) === item.date.slice(0, 10));
        return { ...item, id: match?.id };
      });
      return { ...row, itemsWithId };
    });

  /* ── Filter rows ── */
  const filteredRows = rowsWithIds.filter((r) => {
    if (filterCargo && r.cargo !== filterCargo) return false;
    if (filterArea && r.area !== filterArea) return false;
    return true;
  });

  /* ── Group by cargo ── */
  const grouped = new Map<string, typeof filteredRows>();
  for (const row of filteredRows) {
    const cargo = row.cargo || 'Sin cargo';
    if (!grouped.has(cargo)) grouped.set(cargo, []);
    grouped.get(cargo)!.push(row);
  }

  /* ── Derive unique areas ── */
  const allAreas = Array.from(new Set(calendarRows.map((r) => r.area).filter(Boolean))).sort();

  /* ── Active filter count ── */
  const activeFilters = (filterCargo ? 1 : 0) + (filterArea ? 1 : 0);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1600px] mx-auto">
      {/* ── Page header ── */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
          >
            Disponibilidad del Personal
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Tablero mensual por trabajador &middot; asignaciones · vacaciones · licencias
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Today button */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[rgba(37,99,235,0.06)] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
            >
              Hoy
            </button>
          )}

          {/* Month nav */}
          <div className="flex items-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={prevMonth}
              className="flex items-center justify-center px-3 py-2 hover:bg-[rgba(128,128,128,0.08)] text-[var(--text-secondary)] transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span
              className="px-3 py-2 text-sm font-semibold text-[var(--text-primary)] min-w-[140px] text-center"
              style={{ fontFamily: 'var(--font-outfit, sans-serif)' }}
            >
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="flex items-center justify-center px-3 py-2 hover:bg-[rgba(128,128,128,0.08)] text-[var(--text-secondary)] transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Filters */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilters((o) => !o)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeFilters > 0
                  ? 'border-[#2563eb] bg-[rgba(37,99,235,0.08)] text-[#2563eb]'
                  : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[rgba(128,128,128,0.08)]'
              }`}
            >
              <Filter size={13} />
              Filtros
              {activeFilters > 0 && (
                <span className="flex items-center justify-center h-4 w-4 rounded-full bg-[#2563eb] text-[9px] text-white font-bold">
                  {activeFilters}
                </span>
              )}
            </button>

            {showFilters && (
              <div
                className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Filtros</span>
                  {activeFilters > 0 && (
                    <button
                      type="button"
                      onClick={() => { setFilterCargo(''); setFilterArea(''); }}
                      className="text-xs text-[#2563eb] hover:underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Cargo</p>
                  <select
                    value={filterCargo}
                    onChange={(e) => setFilterCargo(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
                  >
                    <option value="">Todos los cargos</option>
                    {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Área</p>
                  <select
                    value={filterArea}
                    onChange={(e) => setFilterArea(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#2563eb] focus:outline-none"
                  >
                    <option value="">Todas las áreas</option>
                    {allAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="w-full rounded-lg bg-[#2563eb] py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors"
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>

          {/* Register availability */}
          <button
            type="button"
            onClick={() => {
              if (employees.length > 0) {
                const emp = employees[0];
                setModalTarget({
                  employeeId: emp.id,
                  employeeName: emp.nombre,
                  cargo: emp.cargo ?? '',
                  date: todayKey,
                });
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition-colors shadow-sm"
          >
            <Plus size={14} />
            Registrar
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ── KPI Strip ── */}
      <div className="mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Disponibles hoy"
              value={String(disponiblesHoy)}
              subtitle="Con estado DISPONIBLE"
              icon={CheckCircle2}
              valueColor={disponiblesHoy > 0 ? '#15803d' : undefined}
            />
            <KpiCard
              label="Asignados hoy"
              value={String(asignadosHoy)}
              subtitle="En faena o servicio activo"
              icon={Users}
              valueColor={asignadosHoy > 0 ? '#b45309' : undefined}
            />
            <KpiCard
              label="Vacaciones / Licencia"
              value={String(ausentes)}
              subtitle="Fuera del trabajo hoy"
              icon={PlaneLanding}
              valueColor={ausentes > 0 ? '#1d4ed8' : undefined}
            />
          </>
        )}
      </div>

      {/* ── Legend ── */}
      {!loading && (
        <div className="mb-4">
          <Legend />
        </div>
      )}

      {/* ── Board (grouped by cargo) ── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredRows.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <Users size={36} className="text-[var(--text-secondary)] opacity-30" />
          <p className="text-sm text-[var(--text-secondary)]">
            No hay datos de disponibilidad para {MONTH_NAMES[month]} {year}.
          </p>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="text-xs text-[#2563eb] hover:underline"
            >
              Volver al mes actual
            </button>
          )}
        </div>
      ) : filterCargo ? (
        /* When a cargo filter is active, show single flat board */
        <Board
          rows={filteredRows}
          year={year}
          month={month}
          todayKey={todayKey}
          onCellClick={(target) => {
            // Resolve existingId from merged rows
            const row = rowsWithIds.find((r) => r.employeeId === target.employeeId);
            const item = row?.itemsWithId.find((it) => it.date.slice(0, 10) === target.date);
            setModalTarget({
              ...target,
              existingId: item?.id,
              existingStatus: item?.status,
              existingNotes: item?.notes,
            });
          }}
        />
      ) : (
        /* Grouped by cargo */
        <div className="space-y-6">
          {CARGOS.map((cargo) => {
            const rows = grouped.get(cargo);
            if (!rows || rows.length === 0) return null;
            return (
              <div key={cargo}>
                <RoleGroupHeader cargo={cargo} count={rows.length} />
                <Board
                  rows={rows}
                  year={year}
                  month={month}
                  todayKey={todayKey}
                  onCellClick={(target) => {
                    const row = rowsWithIds.find((r) => r.employeeId === target.employeeId);
                    const item = row?.itemsWithId.find((it) => it.date.slice(0, 10) === target.date);
                    setModalTarget({
                      ...target,
                      existingId: item?.id,
                      existingStatus: item?.status,
                      existingNotes: item?.notes,
                    });
                  }}
                />
              </div>
            );
          })}
          {/* Any cargo not in the known list */}
          {Array.from(grouped.keys())
            .filter((c) => !CARGOS.includes(c))
            .map((cargo) => {
              const rows = grouped.get(cargo)!;
              return (
                <div key={cargo}>
                  <RoleGroupHeader cargo={cargo} count={rows.length} />
                  <Board
                    rows={rows}
                    year={year}
                    month={month}
                    todayKey={todayKey}
                    onCellClick={(target) => {
                      const row = rowsWithIds.find((r) => r.employeeId === target.employeeId);
                      const item = row?.itemsWithId.find((it) => it.date.slice(0, 10) === target.date);
                      setModalTarget({
                        ...target,
                        existingId: item?.id,
                        existingStatus: item?.status,
                        existingNotes: item?.notes,
                      });
                    }}
                  />
                </div>
              );
            })}
        </div>
      )}

      {/* ── Footer summary ── */}
      {!loading && filteredRows.length > 0 && (
        <p className="mt-4 text-xs text-[var(--text-secondary)] text-right">
          {filteredRows.length} trabajador{filteredRows.length !== 1 ? 'es' : ''} &middot;{' '}
          {MONTH_NAMES[month]} {year}
          {activeFilters > 0 && (
            <span className="ml-2 text-[#2563eb]">({activeFilters} filtro{activeFilters !== 1 ? 's' : ''} activo{activeFilters !== 1 ? 's' : ''})</span>
          )}
        </p>
      )}

      {/* ── Modal ── */}
      {modalTarget && (
        <SetAvailModal
          key={`${modalTarget.employeeId}-${modalTarget.date}`}
          employees={employees}
          {...modalTarget}
          onClose={() => setModalTarget(null)}
          onSaved={() => {
            setModalTarget(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
