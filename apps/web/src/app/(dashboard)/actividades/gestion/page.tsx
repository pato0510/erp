'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { ActivityDetailModal } from '../../../../components/actividades/ActivityDetailModal';
import { ActivityFormModal } from '../../../../components/actividades/ActivityFormModal';
import {
  STATUS_LABEL,
  STATUS_STYLE,
  STATUS_TARGETS,
} from '../../../../components/actividades/statusMachine';
import type {
  ActivityArea,
  ActivityStatus,
  CalendarActivity,
  MemberOption,
} from '../../../../components/actividades/activityTypes';
import { useCanWriteActividades } from '../../../../hooks/useActividadesPermissions';

/* CAL-010 — Vista Gestión: the weekly management table (§1.7). The list endpoint already
   carries the server's derived dueDate/overdue (Chilean-dated, CAL-008b) + latestNote/notesCount
   — this page PAINTS them, never recomputes. Inline estado dropdown offers only the machine's
   legal targets (STATUS_TARGETS, mirroring the backend); the Atrasadas / Esta semana chips filter
   CLIENT-SIDE over the fetched set's derived fields, because the server's from/to targets
   startDate (not the cierre = endDate ?? startDate) — bending it would be dishonest, and at this
   module's volumes client filtering is correct and cheap. */

type EstadoFilter = 'abiertas' | ActivityStatus | 'todas';

/** Chilean calendar week (Monday–Sunday) containing today in America/Santiago (the CAL-008b
    doctrine). Computed on the LOCAL calendar-date string, parsed at UTC midnight so the
    Monday-week math never drifts by timezone. */
function chileanWeek(): { monday: string; sunday: string; today: string } {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const d = new Date(today + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const toMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - toMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    monday: monday.toISOString().slice(0, 10),
    sunday: sunday.toISOString().slice(0, 10),
    today,
  };
}

function formatCierre(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function truncate(text: string, n = 46): string {
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}

export default function ActividadesGestionPage() {
  const canWrite = useCanWriteActividades('calendarActivity');

  const [activities, setActivities] = useState<CalendarActivity[]>([]);
  const [areas, setAreas] = useState<ActivityArea[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [estado, setEstado] = useState<EstadoFilter>('abiertas');
  const [areaId, setAreaId] = useState<string>('all');
  const [responsable, setResponsable] = useState<string>('all'); // 'all' | 'none' | userId
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyThisWeek, setOnlyThisWeek] = useState(false);

  const [selected, setSelected] = useState<CalendarActivity | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarActivity | null>(null);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const memberName = useCallback(
    (userId: string | null) =>
      userId ? (members.find((m) => m.userId === userId)?.displayName ?? '—') : '—',
    [members],
  );

  const fetchList = useCallback(() => {
    setLoading(true);
    apiClient
      .get<CalendarActivity[]>('/api/actividades/activities')
      .then((data) => {
        setActivities(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar las actividades.'))
      .finally(() => setLoading(false));
  }, []);

  /* Areas + members (the resolver maps) once on mount; the list on mount + after every change. */
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
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const week = useMemo(() => chileanWeek(), []);

  const rows = useMemo(() => {
    const matchEstado = (s: ActivityStatus) => {
      if (estado === 'todas') return true;
      if (estado === 'abiertas') return s === 'PENDIENTE' || s === 'EN_EJECUCION';
      return s === estado;
    };
    const filtered = activities.filter((a) => {
      if (!matchEstado(a.status)) return false;
      if (areaId !== 'all' && a.areaId !== areaId) return false;
      if (responsable === 'none' && a.assigneeId) return false;
      if (responsable !== 'all' && responsable !== 'none' && a.assigneeId !== responsable)
        return false;
      if (onlyOverdue && !a.overdue) return false; // the SERVER flag — never recomputed here
      if (onlyThisWeek) {
        const cierre = a.dueDate?.slice(0, 10);
        if (!cierre || cierre < week.monday || cierre > week.sunday) return false;
      }
      return true;
    });
    // Default order: overdue first, then fecha de cierre asc, then title.
    return filtered.sort((a, b) => {
      if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
      const da = a.dueDate ?? '';
      const db = b.dueDate ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [activities, estado, areaId, responsable, onlyOverdue, onlyThisWeek, week]);

  const changeStatus = async (a: CalendarActivity, status: ActivityStatus) => {
    if (status === a.status) return;
    setBusyId(a.id);
    setError(null);
    try {
      await apiClient.patch(`/api/actividades/activities/${a.id}/status`, { status });
      fetchList();
    } catch {
      setError('No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const selectCls =
    'rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-normal normal-case text-[var(--text-primary)]';

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      <div className="mb-2 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
        Actividades / Gestión
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Gestión de actividades
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            La reunión semanal, en vivo
          </p>
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

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 shadow-sm">
        <Chip active={onlyOverdue} onClick={() => setOnlyOverdue((v) => !v)}>
          Atrasadas
        </Chip>
        <Chip active={onlyThisWeek} onClick={() => setOnlyThisWeek((v) => !v)}>
          Esta semana
        </Chip>
        <span className="mx-1 h-4 w-px bg-[var(--border-color)]" />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoFilter)}
          className={selectCls}
        >
          <option value="abiertas">Abiertas</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="EN_EJECUCION">En ejecución</option>
          <option value="HECHA">Hechas</option>
          <option value="CANCELADA">Canceladas</option>
          <option value="todas">Todas</option>
        </select>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectCls}>
          <option value="all">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
          className={selectCls}
        >
          <option value="all">Todos los responsables</option>
          <option value="none">Sin responsable</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={fetchList}
          disabled={loading}
          aria-label="Actualizar"
          className="ml-auto inline-flex items-center rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] p-1.5 text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50 dark:bg-white/5">
            <tr>
              {[
                'Tarea',
                'Área',
                'Responsable',
                'Fecha cierre',
                'Estado',
                '',
                'Última observación',
              ].map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {loading && activities.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  <RefreshCw size={16} className="mx-auto mb-2 animate-spin opacity-60" /> Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  {activities.length === 0
                    ? 'No hay actividades todavía.'
                    : 'Ninguna actividad coincide con los filtros.'}
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const area = areaById.get(a.areaId);
                const st = STATUS_STYLE[a.status];
                return (
                  <tr key={a.id} className="hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelected(a)}
                        className="text-left font-medium text-[var(--text-primary)] hover:underline"
                      >
                        {a.title}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-[var(--border-color)]"
                          style={{ background: area?.color ?? '#64748b' }}
                        />
                        {area?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {memberName(a.assigneeId)}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                      {formatCierre(a.dueDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      {canWrite ? (
                        <select
                          value={a.status}
                          disabled={busyId === a.id}
                          onChange={(e) => changeStatus(a, e.target.value as ActivityStatus)}
                          className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60"
                          style={{ borderColor: st.color, background: st.bg, color: st.color }}
                        >
                          <option value={a.status}>{STATUS_LABEL[a.status]}</option>
                          {STATUS_TARGETS[a.status].map((t) => (
                            <option key={t} value={t}>
                              {STATUS_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {STATUS_LABEL[a.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.overdue && (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          Atrasada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.latestNote ? (
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <span className="truncate">{truncate(a.latestNote.text)}</span>
                          {!!a.notesCount && (
                            <span className="shrink-0 rounded-full bg-[var(--border-color)] px-1.5 text-[10px] text-[var(--text-secondary)]">
                              {a.notesCount}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)] opacity-50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ActivityDetailModal
          activity={selected}
          area={areaById.get(selected.areaId)}
          members={members}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            fetchList();
          }}
          onEdit={(act) => {
            setSelected(null);
            setEditing(act);
            setFormOpen(true);
          }}
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
            fetchList();
          }}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-xs font-medium transition"
      style={{
        borderColor: active ? '#2563eb' : 'var(--border-color)',
        background: active ? 'rgba(37,99,235,0.12)' : 'transparent',
        color: active ? '#1d4ed8' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
