'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Plus, Search } from 'lucide-react';
import { formatCLP } from '../../lib/formatters';
import {
  daysBetween,
  formatSantiagoDate,
  relativeDayLabel,
  santiagoDate,
  santiagoToday,
} from '../../lib/dates';
import { ColumnHelp } from './ColumnHelp';
import { lastUpdateKindLabel } from './activityLabels';
import { EnterpriseSelect, NO_ENTERPRISE } from './EnterpriseSelect';
import { PipelineQuickAdd, type QuickAddBody } from './PipelineQuickAdd';
import {
  CloseDateCell,
  OwnerCell,
  ProbabilityCell,
  ValueCell,
  type EditField,
  type SaveField,
} from './PipelineInlineCells';
import {
  COLUMNS,
  filterRows,
  groupRows,
  sortRows,
  type GroupBy,
  type PipelineRow,
  type RowGroup,
  type SortDir,
  type SortKey,
  type TableFilters,
} from './pipelineTableModel';
import {
  STAGE_LABELS,
  isActiveStage,
  isClosedStage,
  stageAccent,
  stageMoveTargets,
  type OpportunityStage,
} from './stageLabels';

export type { PipelineRow } from './pipelineTableModel';

/* COM-025 — Pipeline table v2, the daily work view (replaces COM-020's table). ONE
 * <table> with a <tbody> per group, table-fixed + <colgroup> so every group lines up,
 * ONE horizontal scroll container and a sticky first column (header, rows, group
 * headers, footers). Grouped by Etapa (the eight stages in STAGE_ORDER; Ganada and
 * Perdida start collapsed) or Cuenta (one group per account, by name). Search and the
 * Responsable / Empresa filters are client-side over the page's single fetch
 * (?includeClosed=true); while any is active, groups without matches hide.
 *
 * The stage cell is filled with the stage's accent (white text ≥ 4.9:1 on all eight);
 * writers get a native <select> over the same targets as CardMoveMenu, calling the
 * page's attemptMove — the kanban's own path. Quick add: Prospecto group (today's POST
 * creates at PROSPECTO) and every Cuenta group. Token utilities only; hex only through
 * stageLabels.
 *
 * COM-026 — the actions dropdown (Monday-subitem style): the opportunity name is a toggle
 * that opens a full-width detail row rendered by the page (renderRowDetail → ActionList);
 * the table owns the open set, so several rows stay open across refetches, sorting and
 * Etapa ↔ Cuenta. The detail row's content is sticky at the left and exactly as wide as
 * the scroll box (container query units), so it never needs horizontal scrolling. Row
 * and group indicators show the api's pendingActions / overdueActions (display only) and
 * «Actualización» reads the api's lastUpdate { at, kind }.
 *
 * COM-027 — quick add in every active-stage group (at that stage, with the fields the
 * stage requires) and in every Cuenta group (at Prospecto); inline edits of Valor
 * estimado, Fecha estimada de cierre, Probabilidad and Responsable (PipelineInlineCells;
 * one cell at a time, the table owns the editing key). */

/** COM-027 — what a row needs to render its editable cells. */
interface RowEdit {
  canEdit: boolean;
  editing: EditField | null;
  start: (field: EditField) => void;
  close: (field: EditField) => void;
  onSave: SaveField;
  members: { userId: string; displayName: string }[];
}

const CONTROL =
  'h-9 rounded-lg border border-line bg-card-solid px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const TD = 'border-b border-line px-3 py-2.5 align-middle';
const STICKY = 'sticky left-0 z-10';
const N_COLS = COLUMNS.length;
const EMPTY_FILTERS: TableFilters = { q: '', ownerId: '', enterprise: '' };

const santiagoTime = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const formatSantiagoDateTime = (iso: string) =>
  `${formatSantiagoDate(iso)} ${santiagoTime.format(new Date(iso))}`;

const countLabel = (n: number) => `${n} ${n === 1 ? 'oportunidad' : 'oportunidades'}`;
const pendingLabel = (n: number) => `${n} ${n === 1 ? 'pendiente' : 'pendientes'}`;
const overdueSr = (n: number) => `, ${n} ${n === 1 ? 'vencida' : 'vencidas'}`;
const RED_TEXT = 'text-red-700 dark:text-red-400';

/** COM-026 — «N pendientes» (red + icon + sr-only «, N vencidas» when any is overdue). */
function PendingCount({ pending, overdue }: { pending: number; overdue: number }) {
  if (pending <= 0) return null;
  return overdue > 0 ? (
    <span className={`inline-flex items-center gap-1 font-medium ${RED_TEXT}`}>
      <AlertTriangle size={12} aria-hidden="true" />
      {pendingLabel(pending)}
      <span className="sr-only">{overdueSr(overdue)}</span>
    </span>
  ) : (
    <span>{pendingLabel(pending)}</span>
  );
}

export function PipelineTable({
  rows,
  loading,
  accounts,
  canWrite,
  canCreate,
  currentUserId,
  ownerOptions,
  nameOf,
  onChangeStage,
  onNew,
  onAdd,
  onCreated,
  onEditField,
  ownerMembers = [],
  renderRowDetail,
}: {
  rows: PipelineRow[];
  loading: boolean;
  accounts: { id: string; name: string }[];
  canWrite: boolean;
  canCreate: boolean;
  currentUserId: string | null;
  ownerOptions: { id: string; label: string }[];
  nameOf: (userId: string | null | undefined) => string | null;
  onChangeStage: (row: PipelineRow, stage: OpportunityStage) => void;
  /** Opens the page's NewOpportunityModal. */
  onNew: () => void;
  /** POSTs the quick-add row; true on success (the page toasts errors). */
  onAdd: (body: QuickAddBody) => Promise<boolean>;
  /** Refetch after a write. */
  onCreated: () => void;
  /** COM-027 — one single-field PATCH; the page refetches (true on success). */
  onEditField?: SaveField;
  /** COM-027 — active members for the Responsable editor. */
  ownerMembers?: { userId: string; displayName: string }[];
  /** COM-026 — the content of a row's full-width actions panel. */
  renderRowDetail?: (row: PipelineRow) => ReactNode;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('stage');
  const [filters, setFilters] = useState<TableFilters>(EMPTY_FILTERS);
  const [collapsed, setCollapsed] = useState<Record<GroupBy, Record<string, boolean>>>({
    stage: {},
    account: {},
  });
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // Skeleton only on the first load: a refetch after a write keeps the table mounted, so
  // focus (e.g. back on «+ Agregar oportunidad») survives it.
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading) setLoadedOnce(true);
  }, [loading]);
  // COM-027 — the one cell being edited: `${rowId}:${field}`.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const rowEdit = (rowId: string): RowEdit => {
    const [id, field] = (editingKey ?? ':').split(':');
    return {
      canEdit: canWrite && !!onEditField,
      editing: id === rowId ? (field as EditField) : null,
      start: (f) => setEditingKey(`${rowId}:${f}`),
      // Only close if this cell is still the one being edited (a slow save must not
      // close an editor the user opened meanwhile).
      close: (f) => setEditingKey((k) => (k === `${rowId}:${f}` ? null : k)),
      onSave: onEditField ?? (async () => false),
      members: ownerMembers,
    };
  };
  // COM-026 — rows whose actions panel is open (several at once, like Monday).
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const toggleRow = (id: string) =>
    setOpenRows((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = filters.q.trim();
  const hasFilters = filters.ownerId !== '' || filters.enterprise !== '';
  const narrowing = q !== '' || hasFilters;
  const today = santiagoToday();

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name, 'es-CL')),
    [accounts],
  );

  const groups = useMemo(() => {
    const all = groupRows(filterRows(rows, filters, NO_ENTERPRISE), groupBy);
    return narrowing ? all.filter((g) => g.rows.length > 0) : all;
  }, [rows, filters, groupBy, narrowing]);

  const isCollapsed = (g: RowGroup) =>
    collapsed[groupBy][g.key] ?? (g.kind === 'stage' && isClosedStage(g.key));
  const toggleGroup = (g: RowGroup) =>
    setCollapsed((cur) => ({
      ...cur,
      [groupBy]: { ...cur[groupBy], [g.key]: !isCollapsed(g) },
    }));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const set = (patch: Partial<TableFilters>) => setFilters((f) => ({ ...f, ...patch }));

  /* ── toolbar ── */
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <label htmlFor="pipeline-q" className="sr-only">
          Buscar oportunidad o cuenta
        </label>
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary"
        />
        <input
          id="pipeline-q"
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Buscar oportunidad o cuenta…"
          className={`${CONTROL} w-full pl-9`}
        />
      </div>
      <div className="flex items-center gap-2">
        <span id="pipeline-groupby-label" className="text-sm text-fg-secondary">
          Agrupar por
        </span>
        <div
          role="group"
          aria-labelledby="pipeline-groupby-label"
          className="inline-flex rounded-lg border border-line p-0.5"
        >
          {(
            [
              ['stage', 'Etapa'],
              ['account', 'Cuenta'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={groupBy === value}
              onClick={() => setGroupBy(value)}
              className={`rounded-md px-3 py-1 text-sm ${FOCUS} ${
                groupBy === value ? 'bg-accent text-white' : 'text-fg-secondary hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="pipeline-owner" className="sr-only">
        Responsable
      </label>
      <select
        id="pipeline-owner"
        value={filters.ownerId}
        onChange={(e) => set({ ownerId: e.target.value })}
        className={CONTROL}
      >
        <option value="">Todos los responsables</option>
        {ownerOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor="pipeline-enterprise" className="sr-only">
        Empresa
      </label>
      <EnterpriseSelect
        mode="filter"
        id="pipeline-enterprise"
        value={filters.enterprise}
        onChange={(v) => set({ enterprise: v })}
        className={CONTROL}
      />
      {hasFilters && (
        <button
          type="button"
          onClick={() => set({ ownerId: '', enterprise: '' })}
          className={`rounded-md px-1 text-sm text-fg-secondary underline-offset-2 hover:text-fg hover:underline ${FOCUS}`}
        >
          Limpiar filtros
        </button>
      )}
      {canCreate && (
        <button
          type="button"
          onClick={onNew}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus size={16} aria-hidden="true" /> Agregar oportunidad
        </button>
      )}
    </div>
  );

  /* ── empty states ── */
  const showSkeleton = loading && !loadedOnce;
  if (!showSkeleton && narrowing && groups.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-xl border border-line bg-card-solid px-6 py-10 text-center">
          <p className="text-sm text-fg">
            {q
              ? `No hay oportunidades que coincidan con «${q}».`
              : 'No hay oportunidades que coincidan con los filtros.'}
          </p>
          <div className="mt-3 flex justify-center gap-4">
            {q && (
              <button
                type="button"
                onClick={() => set({ q: '' })}
                className={`rounded-md text-sm font-medium text-accent hover:underline ${FOCUS}`}
              >
                Limpiar búsqueda
              </button>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={() => set({ ownerId: '', enterprise: '' })}
                className={`rounded-md text-sm font-medium text-accent hover:underline ${FOCUS}`}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (!showSkeleton && groups.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="rounded-xl border border-line bg-card-solid px-6 py-10 text-center text-sm text-fg-secondary">
          Aún no hay oportunidades.
          {canCreate && ' Crea la primera con «Agregar oportunidad».'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}

      {/* relative: the sr-only (absolute) texts must stay inside the scroll box.
          container-type: the actions panel sizes itself to this box (100cqw). */}
      <div className="relative overflow-x-auto rounded-xl border border-line bg-card-solid [container-type:inline-size]">
        <table className="w-full min-w-[1280px] table-fixed border-separate border-spacing-0 text-sm text-fg md:min-w-[1320px]">
          <caption className="sr-only">
            Pipeline agrupado por {groupBy === 'stage' ? 'etapa' : 'cuenta'}
          </caption>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} className={c.width} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c, i) => {
                const active = c.sort !== undefined && sortKey === c.sort;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      c.sort
                        ? active
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                    className={`border-b border-line bg-subtle px-3 py-2.5 align-bottom text-xs font-medium text-fg-secondary ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    } ${i === 0 ? 'sticky left-0 z-20' : ''}`}
                  >
                    <ColumnHelp help={c.help}>
                      {c.sort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.sort as SortKey)}
                          className={`inline-flex items-center gap-1 rounded text-left hover:text-fg ${FOCUS} ${
                            active ? 'text-fg' : ''
                          }`}
                        >
                          {c.label}
                          <span aria-hidden="true" className="w-3 shrink-0">
                            {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                          </span>
                        </button>
                      ) : (
                        <span tabIndex={0} className={`rounded ${FOCUS}`}>
                          {c.label}
                        </span>
                      )}
                    </ColumnHelp>
                  </th>
                );
              })}
            </tr>
          </thead>

          {showSkeleton ? (
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {COLUMNS.map((c, j) => (
                    <td key={c.key} className={`${TD} ${j === 0 ? `${STICKY} bg-card-solid` : ''}`}>
                      <div className="h-4 w-3/4 rounded bg-subtle-hover" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : (
            groups.map((g) => (
              <GroupBody
                key={`${g.kind}-${g.key}`}
                group={g}
                open={!isCollapsed(g)}
                onToggle={() => toggleGroup(g)}
                rows={sortRows(g.rows, sortKey, sortDir)}
                today={today}
                canWrite={canWrite}
                nameOf={nameOf}
                onChangeStage={onChangeStage}
                quickAdd={
                  canCreate && (g.kind === 'account' || isActiveStage(g.key)) ? (
                    <PipelineQuickAdd
                      groupLabel={g.kind === 'stage' ? STAGE_LABELS[g.key] : g.label}
                      fixedAccountId={g.kind === 'account' ? g.key : undefined}
                      stage={g.kind === 'stage' ? (g.key as OpportunityStage) : undefined}
                      accounts={sortedAccounts}
                      currentUserId={currentUserId}
                      restColSpan={N_COLS - 1}
                      onAdd={onAdd}
                      onCreated={onCreated}
                    />
                  ) : null
                }
                openRows={openRows}
                onToggleRow={toggleRow}
                rowEdit={rowEdit}
                renderRowDetail={renderRowDetail}
              />
            ))
          )}
        </table>
      </div>
    </div>
  );
}

/* ── one group: header row, data rows, quick add, footer ── */

function GroupBody({
  group,
  open,
  onToggle,
  rows,
  today,
  canWrite,
  nameOf,
  onChangeStage,
  quickAdd,
  openRows,
  onToggleRow,
  rowEdit,
  renderRowDetail,
}: {
  group: RowGroup;
  open: boolean;
  onToggle: () => void;
  rows: PipelineRow[];
  today: string;
  canWrite: boolean;
  nameOf: (userId: string | null | undefined) => string | null;
  onChangeStage: (row: PipelineRow, stage: OpportunityStage) => void;
  quickAdd: ReactNode;
  openRows: Set<string>;
  onToggleRow: (id: string) => void;
  rowEdit: (rowId: string) => RowEdit;
  renderRowDetail?: (row: PipelineRow) => ReactNode;
}) {
  const bodyId = `pipeline-group-${group.kind}-${group.key}`;
  const isStage = group.kind === 'stage';
  const accent = isStage ? stageAccent(group.key) : undefined;
  const groupName = isStage ? STAGE_LABELS[group.key] : group.label;
  const total = rows.reduce((acc, r) => acc + Number(r.estimatedValue ?? 0), 0);
  // COM-026 — sums of the api's per-row counts (display, not re-derivation).
  const pending = rows.reduce((acc, r) => acc + (r.pendingActions ?? 0), 0);
  const overdue = rows.reduce((acc, r) => acc + (r.overdueActions ?? 0), 0);
  const valueIndex = COLUMNS.findIndex((c) => c.key === 'value');

  return (
    <tbody id={bodyId}>
      <tr>
        <th
          scope="rowgroup"
          className={`${STICKY} border-b border-line bg-subtle px-3 py-2 text-left font-normal`}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md text-left ${FOCUS}`}
          >
            <span className="text-fg-secondary" aria-hidden="true">
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
            {isStage ? (
              <span
                className="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold text-white"
                style={{ background: accent }}
              >
                {STAGE_LABELS[group.key]}
              </span>
            ) : (
              <span className="min-w-0 truncate text-sm font-semibold text-fg">{group.label}</span>
            )}
            <span className="inline-flex flex-wrap items-center gap-x-1 text-xs text-fg-secondary">
              {countLabel(rows.length)}
              {isStage && isClosedStage(group.key) && ' · últimos 90 días'}
              {pending > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <PendingCount pending={pending} overdue={overdue} />
                </>
              )}
            </span>
          </button>
        </th>
        {/* Collapsed: the group's Σ under «Valor estimado» (expanded, the footer has it). */}
        <td colSpan={valueIndex - 1} className="border-b border-line bg-subtle" />
        <td className="border-b border-line bg-subtle px-3 py-2 text-right text-xs font-semibold tabular-nums text-fg">
          {!open && rows.length > 0 && (
            <>
              <span className="sr-only">Valor estimado total de {groupName}: </span>
              {formatCLP(total)}
            </>
          )}
        </td>
        <td colSpan={N_COLS - valueIndex - 1} className="border-b border-line bg-subtle" />
      </tr>

      {open && (
        <>
          {rows.length === 0 && (
            <tr>
              <td className={`${TD} ${STICKY} bg-card-solid text-fg-secondary`}>
                Sin oportunidades en esta etapa.
              </td>
              <td colSpan={N_COLS - 1} className={TD} />
            </tr>
          )}
          {rows.map((r) => {
            const expanded = openRows.has(r.id) && !!renderRowDetail;
            const panelId = `pipeline-actions-${r.id}`;
            return (
              <Fragment key={r.id}>
                <DataRow
                  row={r}
                  today={today}
                  canWrite={canWrite}
                  nameOf={nameOf}
                  onChangeStage={onChangeStage}
                  expanded={expanded}
                  panelId={panelId}
                  edit={rowEdit(r.id)}
                  onToggle={renderRowDetail ? () => onToggleRow(r.id) : undefined}
                />
                {expanded && renderRowDetail && (
                  <tr id={panelId}>
                    <td colSpan={N_COLS} className="border-b border-line bg-subtle p-0">
                      {/* Sticky + as wide as the scroll box: the panel never scrolls sideways. */}
                      <div className="sticky left-0 w-[100cqw] py-3 pl-3 pr-3 sm:pl-6 md:pl-10">
                        <div
                          role="region"
                          aria-label={`Acciones de «${r.name}»`}
                          className="border-l-[3px] pl-2 sm:pl-3 md:pl-4"
                          style={{ borderLeftColor: stageAccent(r.stage) }}
                        >
                          {renderRowDetail(r)}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {quickAdd}
          <tr>
            {COLUMNS.map((c, i) => (
              <td
                key={c.key}
                className={`border-t-2 px-3 py-2 ${isStage ? '' : 'border-line'} ${
                  i === 0 ? `${STICKY} bg-card-solid text-xs text-fg-secondary` : ''
                } ${i === valueIndex ? 'text-right font-semibold tabular-nums' : ''}`}
                style={isStage ? { borderTopColor: accent } : undefined}
              >
                {i === 0 && 'Total'}
                {i === valueIndex && (
                  <>
                    <span className="sr-only">Valor estimado total de {groupName}: </span>
                    {formatCLP(total)}
                  </>
                )}
              </td>
            ))}
          </tr>
        </>
      )}
    </tbody>
  );
}

/* ── one opportunity ── */

/** COM-026 — «Sin acción» / «N pendientes» under the account name. En Pausa and closed
 *  rows show nothing (ALERT-001's rule: only the five active stages ask for a next step). */
function ActionIndicator({ row: r }: { row: PipelineRow }) {
  const pending = r.pendingActions ?? 0;
  const overdue = r.overdueActions ?? 0;
  if (pending > 0) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${
          overdue > 0
            ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
            : 'bg-subtle-hover text-fg-secondary'
        }`}
      >
        {overdue > 0 && <AlertTriangle size={11} aria-hidden="true" />}
        {pendingLabel(pending)}
        {overdue > 0 && <span className="sr-only">{overdueSr(overdue)}</span>}
      </span>
    );
  }
  if (isActiveStage(r.stage) && r.pendingActions !== undefined) {
    return (
      <span className="inline-flex shrink-0 rounded-full bg-red-100 px-1.5 py-px text-[11px] font-medium text-red-800 dark:bg-red-500/20 dark:text-red-300">
        Sin acción
      </span>
    );
  }
  return null;
}

/** COM-026 — «Actualización»: relative day + what changed (the api's lastUpdate). Active
 *  stages turn amber after 3 Santiago days and red after 7; the text says the days, so
 *  colour is never the only signal. The exact date/time is a keyboard-reachable tip. */
function LastUpdateCell({ row: r, today }: { row: PipelineRow; today: string }) {
  const at = r.lastUpdate?.at ?? r.lastMovementAt ?? null;
  if (!at) return <span className="text-fg-secondary">—</span>;
  const days = daysBetween(santiagoDate(at), today);
  const tone = !isActiveStage(r.stage)
    ? 'text-fg-secondary'
    : days > 7
      ? `font-medium ${RED_TEXT}`
      : days > 3
        ? 'font-medium text-amber-700 dark:text-amber-400'
        : 'text-fg-secondary';
  return (
    <span className="block min-w-0">
      <ColumnHelp help={`Fecha exacta: ${formatSantiagoDateTime(at)}`}>
        <span tabIndex={0} className={`block truncate rounded ${tone} ${FOCUS}`}>
          {relativeDayLabel(at)}
        </span>
      </ColumnHelp>
      {r.lastUpdate && (
        <span className="block truncate text-xs text-fg-secondary">
          {lastUpdateKindLabel(r.lastUpdate.kind)}
        </span>
      )}
    </span>
  );
}

function DataRow({
  row: r,
  today,
  canWrite,
  nameOf,
  onChangeStage,
  expanded,
  panelId,
  onToggle,
  edit,
}: {
  row: PipelineRow;
  today: string;
  canWrite: boolean;
  nameOf: (userId: string | null | undefined) => string | null;
  onChangeStage: (row: PipelineRow, stage: OpportunityStage) => void;
  expanded: boolean;
  panelId: string;
  /** Opens / closes the row's actions panel (absent → the name is a plain link). */
  onToggle?: () => void;
  edit: RowEdit;
}) {
  const accountName = r.account?.name ?? '—';
  const ownerName = r.ownerId ? (nameOf(r.ownerId) ?? 'Usuario desconocido') : null;
  const targets = canWrite ? stageMoveTargets(r.stage) : [];
  const fill = { background: stageAccent(r.stage) };
  const cell = (field: EditField) => ({
    row: r,
    canEdit: edit.canEdit,
    editing: edit.editing === field,
    onStart: () => edit.start(field),
    onClose: () => edit.close(field),
    onSave: edit.onSave,
  });

  return (
    <tr className="group hover:bg-subtle">
      {/* 1 · Oportunidad y Cuenta (sticky): name = actions toggle, icon = ficha */}
      <td className={`${TD} ${STICKY} bg-card-solid group-hover:bg-subtle`}>
        <div className="flex min-w-0 items-center gap-1">
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={expanded ? panelId : undefined}
              title={r.name}
              className={`flex min-w-0 flex-1 items-center gap-1 rounded text-left font-semibold text-fg hover:text-accent ${FOCUS}`}
            >
              <span className="shrink-0 text-fg-secondary" aria-hidden="true">
                {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </span>
              <span className="truncate">{r.name}</span>
            </button>
          ) : (
            <span className="min-w-0 flex-1 truncate font-semibold text-fg" title={r.name}>
              {r.name}
            </span>
          )}
          <Link
            href={`/comercial/pipeline/${r.id}`}
            aria-label={`Abrir ficha de «${r.name}»`}
            title="Abrir ficha"
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-secondary hover:bg-subtle-hover hover:text-accent ${FOCUS}`}
          >
            <ExternalLink size={13} aria-hidden="true" />
          </Link>
        </div>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-5">
          <span className="min-w-0 truncate text-xs text-fg-secondary" title={accountName}>
            {accountName}
          </span>
          <ActionIndicator row={r} />
        </span>
      </td>
      {/* 2 · Responsable */}
      <td className={TD}>
        <OwnerCell {...cell('owner')} ownerName={ownerName} members={edit.members} />
      </td>

      {/* 3 · Etapa — full-cell fill */}
      <td className="relative h-12 border-b border-line p-0">
        {targets.length > 0 ? (
          <>
            <label htmlFor={`pipeline-stage-${r.id}`} className="sr-only">
              Etapa de «{r.name}»
            </label>
            <select
              id={`pipeline-stage-${r.id}`}
              value={r.stage}
              onChange={(e) => onChangeStage(r, e.target.value as OpportunityStage)}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 pl-3 pr-8 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
              style={fill}
            >
              <option value={r.stage} className="bg-card-solid text-fg">
                {STAGE_LABELS[r.stage] ?? r.stage}
              </option>
              {targets.map((t) => (
                <option key={t} value={t} className="bg-card-solid text-fg">
                  {STAGE_LABELS[t]}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white"
            />
          </>
        ) : (
          <span
            className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-white"
            style={fill}
          >
            {STAGE_LABELS[r.stage] ?? r.stage}
          </span>
        )}
      </td>

      {/* 4 · Valor estimado */}
      <td className={`${TD} text-right tabular-nums`}>
        <ValueCell {...cell('value')} />
      </td>

      {/* 5 · Fecha de creación */}
      <td className={`${TD} tabular-nums text-fg-secondary`}>{formatSantiagoDate(r.createdAt)}</td>

      {/* 6 · Fecha estimada de cierre */}
      <td className={`${TD} tabular-nums`}>
        <CloseDateCell {...cell('close')} today={today} />
      </td>

      {/* 8 · Cuenta (column 7 «Lead» arrives in ola 2) */}
      <td className={TD}>
        <Link
          href={`/comercial/cuentas/${r.accountId}`}
          title={accountName}
          className={`block truncate rounded text-fg-secondary hover:text-fg hover:underline ${FOCUS}`}
        >
          {accountName}
        </Link>
      </td>

      {/* 9 · Actualización — the api's lastUpdate (COM-026) */}
      <td className={TD}>
        <LastUpdateCell row={r} today={today} />
      </td>

      {/* 10 · Probabilidad */}
      <td className={TD}>
        <ProbabilityCell {...cell('probability')} />
      </td>
    </tr>
  );
}

export default PipelineTable;
