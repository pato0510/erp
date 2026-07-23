'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Maximize2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../lib/api';
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

/* CAL-010/011 — Vista Gestión: the weekly management table, now with Excel-style inline editing.
   The list endpoint carries the server's derived dueDate/overdue (Chilean-dated, CAL-008b) +
   latestNote/notesCount — this page PAINTS them, NEVER recomputes. The grid is LOCKED by default;
   "Editar" (writers only) wakes per-cell editors with PER-ROW AUTOSAVE on blur (changed fields
   only). Estado stays a LIVE dropdown in both modes (it is an action, not data editing). The
   backend endpoints (POST/PATCH/PATCH status/DELETE) ARE this grid's API — zero api/ changes. */

type EstadoFilter = 'abiertas' | ActivityStatus | 'todas';
type RowField = 'title' | 'area' | 'assignee' | 'cierre';

interface RowDraft {
  title: string;
  areaId: string;
  assigneeId: string;
  cierre: string; // 'YYYY-MM-DD'
}
const EMPTY_DRAFT: RowDraft = { title: '', areaId: '', assigneeId: '', cierre: '' };

const CELL_INPUT =
  'w-full rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-1.5 py-1 text-sm text-[var(--text-primary)]';

/* CAL-011 — the CHANGED-FIELDS-ONLY PATCH body. Compares the row's local draft to the activity's
   current server values and emits ONLY what changed. FECHA CIERRE WRITE RULE: cierre is DERIVED
   (dueDate = endDate ?? startDate), so a change writes endDate when the activity HAS an endDate
   (a range keeps its start, moves its end), else startDate (a single day moves). The grid never
   creates or removes a range, and never touches hora — those stay in the modal. */
function buildRowDiff(activity: CalendarActivity, draft: RowDraft): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const title = draft.title.trim();
  if (title !== activity.title) diff.title = title;
  if (draft.areaId !== activity.areaId) diff.areaId = draft.areaId;
  const curAssignee = activity.assigneeId ?? '';
  if (draft.assigneeId !== curAssignee) diff.assigneeId = draft.assigneeId || null;
  const curCierre = (activity.dueDate ?? activity.startDate).slice(0, 10);
  if (draft.cierre && draft.cierre !== curCierre) {
    if (activity.endDate) diff.endDate = draft.cierre;
    else diff.startDate = draft.cierre;
  }
  return diff;
}

/* CAL-011 — the NEW-ROW MINIMUM GATE: a bottom row becomes real only with título + área + fecha.
   `partial` means "some data typed but not yet complete" → stays pending with a hint, and blocks
   a silent discard on exit. */
function newRowReady(d: RowDraft): boolean {
  return d.title.trim().length > 0 && !!d.areaId && !!d.cierre;
}
function newRowPartial(d: RowDraft): boolean {
  const any = d.title.trim().length > 0 || !!d.areaId || !!d.cierre || !!d.assigneeId;
  return any && !newRowReady(d);
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

/** Chilean calendar week (Monday–Sunday) containing today in America/Santiago (CAL-008b). */
function chileanWeek(): { monday: string; sunday: string } {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const d = new Date(today + 'T00:00:00Z');
  const dow = d.getUTCDay();
  const toMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - toMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { monday: monday.toISOString().slice(0, 10), sunday: sunday.toISOString().slice(0, 10) };
}

function focusCell(rowId: string, field: RowField) {
  const el = document.querySelector<HTMLElement>(`[data-cell="${rowId}:${field}"]`);
  el?.focus();
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
  const [responsable, setResponsable] = useState<string>('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyThisWeek, setOnlyThisWeek] = useState(false);

  const [selected, setSelected] = useState<CalendarActivity | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarActivity | null>(null);

  // CAL-011 — edit mode + the frozen order snapshot + the persistent new-row draft.
  const [editMode, setEditMode] = useState(false);
  const [frozenOrder, setFrozenOrder] = useState<string[]>([]);
  const [newDraft, setNewDraft] = useState<RowDraft>(EMPTY_DRAFT);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const activeAreas = useMemo(() => areas.filter((a) => a.active), [areas]);
  const memberName = useCallback(
    (userId: string | null) =>
      userId ? (members.find((m) => m.userId === userId)?.displayName ?? '—') : '—',
    [members],
  );

  const fetchList = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    return apiClient
      .get<CalendarActivity[]>('/api/actividades/activities')
      .then((data) => {
        setActivities(data);
        setError(null);
      })
      .catch(() => setError('No se pudieron cargar las actividades.'))
      .finally(() => setLoading(false));
  }, []);

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

  /* View-mode rows: filter + sort over fresh data. Also the snapshot source for the order freeze. */
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
    return filtered.sort((a, b) => {
      if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
      const da = a.dueDate ?? '';
      const db = b.dueDate ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [activities, estado, areaId, responsable, onlyOverdue, onlyThisWeek, week]);

  /* CAL-013 — the Monday numbers, derived CLIENT-SIDE from the fetched set (which carries every
     status; small volumes; the server's derived flags are the truth — overdue is NEVER recomputed
     here). CANCELADA counts nowhere. Definitions:
     - Pendientes           = status PENDIENTE (open).
     - En ejecución         = status EN_EJECUCION (open).
     - Atrasadas            = a.overdue (the SERVER flag; only open items are ever overdue).
     - Hechas de la semana  = status HECHA AND fechaCierre (dueDate) within the CURRENT CHILEAN WEEK
       (reuse chileanWeek(), CAL-008b; an item done early still counts by its cierre).
     Por responsable        = OPEN items (PENDIENTE + EN_EJECUCION) grouped by assignee. */
  const stats = useMemo(() => {
    let pendientes = 0;
    let enEjecucion = 0;
    let atrasadas = 0;
    let hechasSemana = 0;
    const byResponsable = new Map<string, number>(); // (assigneeId ?? '__none__') → open count
    for (const a of activities) {
      if (a.status === 'PENDIENTE') pendientes++;
      else if (a.status === 'EN_EJECUCION') enEjecucion++;
      if (a.overdue) atrasadas++; // the SERVER flag — never recomputed
      if (a.status === 'HECHA') {
        const cierre = a.dueDate?.slice(0, 10);
        if (cierre && cierre >= week.monday && cierre <= week.sunday) hechasSemana++;
      }
      if (a.status === 'PENDIENTE' || a.status === 'EN_EJECUCION') {
        const key = a.assigneeId ?? '__none__';
        byResponsable.set(key, (byResponsable.get(key) ?? 0) + 1);
      }
    }
    return { pendientes, enEjecucion, atrasadas, hechasSemana, byResponsable };
  }, [activities, week]);

  /* CAL-013 — each card toggles the matching table filter; clicking an active card clears it. */
  const clearCardFilters = () => {
    setEstado('abiertas');
    setOnlyOverdue(false);
    setOnlyThisWeek(false);
  };
  const cardActive = {
    pendientes: estado === 'PENDIENTE' && !onlyOverdue && !onlyThisWeek,
    enEjecucion: estado === 'EN_EJECUCION' && !onlyOverdue && !onlyThisWeek,
    atrasadas: onlyOverdue,
    hechasSemana: estado === 'HECHA' && onlyThisWeek,
  };
  const onPendientes = () => {
    if (cardActive.pendientes) return clearCardFilters();
    setEstado('PENDIENTE');
    setOnlyOverdue(false);
    setOnlyThisWeek(false);
  };
  const onEnEjecucion = () => {
    if (cardActive.enEjecucion) return clearCardFilters();
    setEstado('EN_EJECUCION');
    setOnlyOverdue(false);
    setOnlyThisWeek(false);
  };
  const onAtrasadas = () => {
    if (cardActive.atrasadas) return clearCardFilters();
    setEstado('abiertas');
    setOnlyOverdue(true);
    setOnlyThisWeek(false);
  };
  const onHechasSemana = () => {
    if (cardActive.hechasSemana) return clearCardFilters();
    setEstado('HECHA');
    setOnlyThisWeek(true);
    setOnlyOverdue(false);
  };

  /* CAL-011 — ORDER FREEZE: entering edit mode snapshots the current filtered+sorted ids; edit
     mode renders strictly in that order (each row looked up live by id), so a save that flips a
     row's overdue/cierre/estado updates its cells IN PLACE but never reorders or filters it out.
     New rows append their id to the snapshot. "Listo" clears it → normal sort/filter resumes. */
  const enterEdit = () => {
    setFrozenOrder(rows.map((r) => r.id));
    setNewDraft(EMPTY_DRAFT);
    setEditMode(true);
  };
  const exitEdit = () => {
    if (
      newRowPartial(newDraft) &&
      !window.confirm('La fila nueva está incompleta. ¿Descartarla?')
    ) {
      return;
    }
    setNewDraft(EMPTY_DRAFT);
    setFrozenOrder([]);
    setEditMode(false);
  };

  const editRows = useMemo(
    () => frozenOrder.map((id) => activityById.get(id)).filter((a): a is CalendarActivity => !!a),
    [frozenOrder, activityById],
  );

  const changeStatus = async (a: CalendarActivity, status: ActivityStatus) => {
    if (status === a.status) return;
    setBusyId(a.id);
    setError(null);
    try {
      await apiClient.patch(`/api/actividades/activities/${a.id}/status`, { status });
      await fetchList(editMode); // silent while editing so the frozen table doesn't flicker
    } catch {
      setError('No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  const onRowSaved = useCallback(() => fetchList(true), [fetchList]);
  const onRowDeleted = useCallback(
    async (id: string) => {
      try {
        await apiClient.delete(`/api/actividades/activities/${id}`);
        setFrozenOrder((f) => f.filter((x) => x !== id));
        fetchList(true);
      } catch {
        setError('No se pudo eliminar la actividad.');
      }
    },
    [fetchList],
  );
  const onNewCreated = useCallback(
    (id: string) => {
      // In edit mode the order is frozen, so pin the newborn at the bottom of the snapshot; in
      // view mode the refetched list re-derives `rows` and it appears in the normal sort.
      if (editMode) setFrozenOrder((f) => [...f, id]);
      setNewDraft(EMPTY_DRAFT);
      fetchList(true);
    },
    [editMode, fetchList],
  );

  const selectCls =
    'rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs font-normal normal-case text-[var(--text-primary)] disabled:opacity-50';
  const COLS = editMode ? 8 : 7;

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
          <div className="flex items-center gap-2">
            {editMode ? (
              <button
                type="button"
                onClick={exitEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
              >
                <Check size={14} /> Listo
              </button>
            ) : (
              // CAL-011b — "Nueva actividad" removed: creation here IS writing (the always-ready
              // bottom row). The full form stays reachable via each row's detail icon (rangos,
              // hora, bitácora). The Calendario page keeps its own button untouched.
              <button
                type="button"
                onClick={enterEdit}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ background: '#2563eb' }}
              >
                <Pencil size={14} /> Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* CAL-013 — the Monday numbers (readers see them too: the open module's read surface).
          Each card toggles the matching table filter; disabled while editing (order frozen). */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard
          label="Pendientes"
          value={stats.pendientes}
          color="#1d4ed8"
          active={cardActive.pendientes}
          disabled={editMode}
          onClick={onPendientes}
        />
        <KpiCard
          label="En ejecución"
          value={stats.enEjecucion}
          color="#b45309"
          active={cardActive.enEjecucion}
          disabled={editMode}
          onClick={onEnEjecucion}
        />
        <KpiCard
          label="Atrasadas"
          value={stats.atrasadas}
          color="#b91c1c"
          active={cardActive.atrasadas}
          disabled={editMode}
          onClick={onAtrasadas}
        />
        <KpiCard
          label="Hechas de la semana"
          value={stats.hechasSemana}
          color="#15803d"
          active={cardActive.hechasSemana}
          disabled={editMode}
          onClick={onHechasSemana}
        />
      </div>

      {stats.byResponsable.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold uppercase tracking-wide">Por responsable</span>
          {[...stats.byResponsable.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([key, count]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] px-2 py-0.5"
              >
                {key === '__none__' ? 'Sin responsable' : memberName(key)}
                <span className="rounded-full bg-[var(--border-color)] px-1.5 text-[10px]">
                  {count}
                </span>
              </span>
            ))}
        </div>
      )}

      {/* Filters — disabled while editing (the order is frozen). */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 shadow-sm">
        <Chip active={onlyOverdue} disabled={editMode} onClick={() => setOnlyOverdue((v) => !v)}>
          Atrasadas
        </Chip>
        <Chip active={onlyThisWeek} disabled={editMode} onClick={() => setOnlyThisWeek((v) => !v)}>
          Esta semana
        </Chip>
        <span className="mx-1 h-4 w-px bg-[var(--border-color)]" />
        <select
          value={estado}
          disabled={editMode}
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
        <select
          value={areaId}
          disabled={editMode}
          onChange={(e) => setAreaId(e.target.value)}
          className={selectCls}
        >
          <option value="all">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={responsable}
          disabled={editMode}
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
        {editMode && (
          <span className="text-[11px] italic text-[var(--text-secondary)]">
            Orden congelado mientras editás
          </span>
        )}
        <button
          type="button"
          onClick={() => fetchList()}
          disabled={loading || editMode}
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

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-gray-50 dark:bg-white/5">
            <tr>
              {['Tarea', 'Área', 'Responsable', 'Fecha cierre', 'Estado', '', 'Observaciones'].map(
                (h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    {h}
                  </th>
                ),
              )}
              {editMode && <th className="px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {editMode ? (
              editRows.map((a, idx) => (
                <EditRow
                  key={a.id}
                  activity={a}
                  areaById={areaById}
                  activeAreas={activeAreas}
                  members={members}
                  nextId={idx + 1 < editRows.length ? editRows[idx + 1].id : 'new'}
                  busy={busyId === a.id}
                  onStatusChange={changeStatus}
                  onSaved={onRowSaved}
                  onDeleted={onRowDeleted}
                  onOpenDetail={setSelected}
                />
              ))
            ) : loading && activities.length === 0 ? (
              <tr>
                <td
                  colSpan={COLS}
                  className="px-3 py-10 text-center text-sm text-[var(--text-secondary)]"
                >
                  <RefreshCw size={16} className="mx-auto mb-2 animate-spin opacity-60" /> Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLS}
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
                      <StatusCell
                        activity={a}
                        canWrite={canWrite}
                        busy={busyId === a.id}
                        onChange={changeStatus}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <AtrasadoBadge overdue={a.overdue} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ObsCell activity={a} canWrite={canWrite} onAppended={onRowSaved} />
                    </td>
                  </tr>
                );
              })
            )}
            {/* CAL-011b — the ALWAYS-READY writing row: canWrite, in BOTH modes (it escapes the
                lock). Existing rows stay locked until "Editar"; readers never see this row. */}
            {canWrite && (
              <NewRow
                draft={newDraft}
                setDraft={setNewDraft}
                activeAreas={activeAreas}
                members={members}
                onCreated={onNewCreated}
                editMode={editMode}
                cols={COLS}
              />
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
            fetchList(editMode);
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
            fetchList(editMode);
          }}
        />
      )}
    </div>
  );
}

/* ── Shared cells (identical in both modes) ─────────────────────────────────────────── */

function StatusCell({
  activity,
  canWrite,
  busy,
  onChange,
}: {
  activity: CalendarActivity;
  canWrite: boolean;
  busy: boolean;
  onChange: (a: CalendarActivity, s: ActivityStatus) => void;
}) {
  const st = STATUS_STYLE[activity.status];
  if (!canWrite) {
    return (
      <span
        className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: st.bg, color: st.color }}
      >
        {STATUS_LABEL[activity.status]}
      </span>
    );
  }
  return (
    <select
      value={activity.status}
      disabled={busy}
      onChange={(e) => onChange(activity, e.target.value as ActivityStatus)}
      className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-60"
      style={{ borderColor: st.color, background: st.bg, color: st.color }}
    >
      <option value={activity.status}>{STATUS_LABEL[activity.status]}</option>
      {STATUS_TARGETS[activity.status].map((t) => (
        <option key={t} value={t}>
          {STATUS_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

function AtrasadoBadge({ overdue }: { overdue?: boolean }) {
  if (!overdue) return null;
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300">
      Atrasada
    </span>
  );
}

/* CAL-011b — Observaciones IN-CELL APPEND. For writers this cell is ALWAYS live (like Estado —
   the other Monday action; the lock protects identity data only). Click → an EMPTY input (never
   prefilled with the previous note — the user is writing a NEW entry) → Enter/blur with text →
   POST /notes. APPEND IS THE ONLY VERB: no note id is ever read or sent, no edit/delete path
   (plan §1.6). Escape cancels; empty → no-op (no stray 400s); a 4xx surfaces VERBATIM inline and
   keeps the text. Readers see only the latest note + count. */
function ObsCell({
  activity,
  canWrite,
  onAppended,
}: {
  activity: CalendarActivity;
  canWrite: boolean;
  onAppended: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cancelled = useRef(false); // an Escape / post-success blur must NOT re-submit

  const display = activity.latestNote ? (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
      <span className="truncate">{truncate(activity.latestNote.text)}</span>
      {!!activity.notesCount && (
        <span className="shrink-0 rounded-full bg-[var(--border-color)] px-1.5 text-[10px] text-[var(--text-secondary)]">
          {activity.notesCount}
        </span>
      )}
    </span>
  ) : (
    <span className="text-[var(--text-secondary)] opacity-50">—</span>
  );

  if (!canWrite) return display;

  const submit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const t = text.trim();
    if (!t) {
      setEditing(false);
      setText('');
      setErr(null);
      return;
    }
    setPosting(true);
    setErr(null);
    try {
      await apiClient.post(`/api/actividades/activities/${activity.id}/notes`, { text: t });
      cancelled.current = true; // swallow the unmount blur that closing the input will trigger
      setText('');
      setEditing(false);
      onAppended();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo agregar la observación.');
    } finally {
      setPosting(false);
    }
  };

  if (editing) {
    return (
      <div>
        <input
          autoFocus
          value={text}
          disabled={posting}
          onChange={(e) => setText(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelled.current = true;
              setText('');
              setErr(null);
              setEditing(false);
            }
          }}
          placeholder="Agregar observación…"
          className={CELL_INPUT}
        />
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        cancelled.current = false;
        setErr(null);
        setText(''); // ALWAYS empty — a new entry, never editing the previous note
        setEditing(true);
      }}
      title="Agregar observación"
      className="w-full text-left hover:opacity-80"
    >
      {display}
    </button>
  );
}

/* ── CAL-011: the editable row (per-row autosave on blur) ───────────────────────────── */

function EditRow({
  activity,
  areaById,
  activeAreas,
  members,
  nextId,
  busy,
  onStatusChange,
  onSaved,
  onDeleted,
  onOpenDetail,
}: {
  activity: CalendarActivity;
  areaById: Map<string, ActivityArea>;
  activeAreas: ActivityArea[];
  members: MemberOption[];
  nextId: string;
  busy: boolean;
  onStatusChange: (a: CalendarActivity, s: ActivityStatus) => void;
  onSaved: () => void;
  onDeleted: (id: string) => void;
  onOpenDetail: (a: CalendarActivity) => void;
}) {
  const currentCierre = () => (activity.dueDate ?? activity.startDate).slice(0, 10);
  const [title, setTitle] = useState(activity.title);
  const [areaId, setAreaId] = useState(activity.areaId);
  const [assigneeId, setAssigneeId] = useState(activity.assigneeId ?? '');
  const [cierre, setCierre] = useState(currentCierre());
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Área options: active areas + the current area if it is now inactive (CAL-003 rule).
  const cur = areaById.get(activity.areaId);
  const areaOptions =
    cur && !cur.active ? [cur, ...activeAreas.filter((a) => a.id !== cur.id)] : activeAreas;

  const save = async () => {
    const diff = buildRowDiff(activity, { title, areaId, assigneeId, cierre });
    if (Object.keys(diff).length === 0) return;
    setState('saving');
    setErrMsg(null);
    try {
      await apiClient.patch(`/api/actividades/activities/${activity.id}`, diff);
      setState('saved');
      onSaved();
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (e) {
      // Keep local values (nothing lost); surface the backend's Spanish message VERBATIM.
      setState('error');
      setErrMsg(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    }
  };

  // Row lost focus entirely (focus did not stay within the row) → autosave.
  const onRowBlur = (e: React.FocusEvent<HTMLTableRowElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    save();
  };

  const key = (field: RowField) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusCell(nextId, field);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (field === 'title') setTitle(activity.title);
      if (field === 'area') setAreaId(activity.areaId);
      if (field === 'assignee') setAssigneeId(activity.assigneeId ?? '');
      if (field === 'cierre') setCierre(currentCierre());
    }
  };

  const rowBg =
    state === 'error'
      ? 'bg-red-50 dark:bg-red-950/30'
      : 'hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]';

  return (
    <>
      <tr className={rowBg} onBlur={onRowBlur}>
        <td className="px-3 py-1.5">
          <input
            data-cell={`${activity.id}:title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={key('title')}
            className={CELL_INPUT}
          />
        </td>
        <td className="px-3 py-1.5">
          <select
            data-cell={`${activity.id}:area`}
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            onKeyDown={key('area')}
            className={CELL_INPUT}
          >
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {!a.active ? ' (inactiva)' : ''}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <select
            data-cell={`${activity.id}:assignee`}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            onKeyDown={key('assignee')}
            className={CELL_INPUT}
          >
            <option value="">Sin responsable</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <input
            type="date"
            data-cell={`${activity.id}:cierre`}
            value={cierre}
            onChange={(e) => setCierre(e.target.value)}
            onKeyDown={key('cierre')}
            className={CELL_INPUT}
          />
        </td>
        <td className="px-3 py-1.5">
          {/* Estado stays LIVE in edit mode — an action, not data editing. */}
          <StatusCell activity={activity} canWrite busy={busy} onChange={onStatusChange} />
        </td>
        <td className="px-3 py-1.5">
          <AtrasadoBadge overdue={activity.overdue} />
        </td>
        <td className="px-3 py-1.5">
          <ObsCell activity={activity} canWrite onAppended={onSaved} />
        </td>
        <td className="px-3 py-1.5">
          <div className="flex items-center justify-end gap-1.5">
            {state === 'saving' && (
              <RefreshCw size={13} className="animate-spin text-[var(--text-secondary)]" />
            )}
            {state === 'saved' && <Check size={14} className="text-green-600" />}
            <button
              type="button"
              onClick={() => onOpenDetail(activity)}
              title="Abrir detalle / bitácora"
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Eliminar la actividad "${activity.title}"?`))
                  onDeleted(activity.id);
              }}
              title="Eliminar"
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
      {state === 'error' && errMsg && (
        <tr className="bg-red-50 dark:bg-red-950/30">
          <td colSpan={8} className="px-3 pb-2 text-xs text-red-600">
            {errMsg}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── CAL-011: the persistent bottom new-row ─────────────────────────────────────────── */

function NewRow({
  draft,
  setDraft,
  activeAreas,
  members,
  onCreated,
  editMode,
  cols,
}: {
  draft: RowDraft;
  setDraft: (d: RowDraft) => void;
  activeAreas: ActivityArea[];
  members: MemberOption[];
  onCreated: (id: string) => void;
  editMode: boolean;
  cols: number;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const create = async () => {
    if (!newRowReady(draft)) return;
    setState('saving');
    setErrMsg(null);
    try {
      const created = await apiClient.post<CalendarActivity>('/api/actividades/activities', {
        title: draft.title.trim(),
        areaId: draft.areaId,
        startDate: draft.cierre, // a new row is a single day; cierre = startDate (status forced server-side)
        assigneeId: draft.assigneeId || null,
      });
      onCreated(created.id);
      setState('idle');
    } catch (e) {
      setState('error');
      setErrMsg(e instanceof ApiError ? e.message : 'No se pudo crear.');
    }
  };

  const onRowBlur = (e: React.FocusEvent<HTMLTableRowElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (newRowReady(draft)) create();
  };

  return (
    <>
      <tr className="bg-[rgba(37,99,235,0.03)]" onBlur={onRowBlur}>
        <td className="px-3 py-1.5">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Nueva tarea…"
            className={CELL_INPUT}
          />
        </td>
        <td className="px-3 py-1.5">
          <select
            value={draft.areaId}
            onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}
            className={CELL_INPUT}
          >
            <option value="">Área…</option>
            {activeAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <select
            value={draft.assigneeId}
            onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}
            className={CELL_INPUT}
          >
            <option value="">Sin responsable</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5">
          <input
            type="date"
            value={draft.cierre}
            onChange={(e) => setDraft({ ...draft, cierre: e.target.value })}
            className={CELL_INPUT}
          />
        </td>
        {/* Estado + Atrasado: not applicable until the task is born. */}
        <td className="px-3 py-1.5 text-[var(--text-secondary)] opacity-40">—</td>
        <td className="px-3 py-1.5" />
        {/* Observaciones: inert for the writing row — first the task must exist (no chained
            create+note in V1). */}
        <td className="px-3 py-1.5">
          <span className="text-[11px] italic text-[var(--text-secondary)] opacity-60">
            primero nace la tarea
          </span>
        </td>
        {editMode && (
          <td className="px-3 py-1.5">
            {state === 'saving' && (
              <RefreshCw size={13} className="animate-spin text-[var(--text-secondary)]" />
            )}
          </td>
        )}
      </tr>
      {(state === 'saving' || newRowPartial(draft) || (state === 'error' && !!errMsg)) && (
        <tr className={state === 'error' ? 'bg-red-50 dark:bg-red-950/30' : ''}>
          <td colSpan={cols} className="px-3 pb-2 text-[11px]">
            <span className={state === 'error' ? 'text-red-600' : 'text-[var(--text-secondary)]'}>
              {state === 'saving'
                ? 'Creando…'
                : state === 'error'
                  ? errMsg
                  : 'Completa título, área y fecha para crear la tarea.'}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col rounded-xl border bg-[var(--bg-card)] px-3 py-2.5 text-left shadow-sm transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-60 disabled:hover:bg-[var(--bg-card)]"
      style={{
        borderColor: active ? color : 'var(--border-color)',
        boxShadow: active ? `0 0 0 1px ${color}` : undefined,
      }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="font-mono text-2xl font-semibold leading-tight" style={{ color }}>
        {value}
      </span>
    </button>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50"
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
