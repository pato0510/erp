'use client';

import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import { formatCLP } from '../../lib/formatters';
import {
  civilDate,
  formatDbDate,
  formatSantiagoDate,
  relativeDayLabel,
  santiagoToday,
} from '../../lib/dates';
import { MemberAvatar } from '../shared/MemberAvatar';
import { ColumnHelp } from './ColumnHelp';
import { EnterpriseSelect, NO_ENTERPRISE } from './EnterpriseSelect';
import { PipelineQuickAdd, type QuickAddBody } from './PipelineQuickAdd';
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
 * creates at PROSPECTO) and every Cuenta group. Rows accept an optional full-width
 * detail row (expandedId + renderRowDetail) for ola 2's actions panel. Token utilities
 * only; hex only through stageLabels. */

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
  expandedId = null,
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
  /** Ola 2 — the row whose full-width detail row is open. */
  expandedId?: string | null;
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
  const loadedOnce = useRef(false);
  if (!loading) loadedOnce.current = true;

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
  const showSkeleton = loading && !loadedOnce.current;
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
          Aún no hay oportunidades. Crea la primera con «Agregar oportunidad».
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}

      {/* relative: the sr-only (absolute) texts must stay inside the scroll box. */}
      <div className="relative overflow-x-auto rounded-xl border border-line bg-card-solid">
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
                  canCreate && (g.kind === 'account' || g.key === 'PROSPECTO') ? (
                    <PipelineQuickAdd
                      groupLabel={g.kind === 'stage' ? STAGE_LABELS[g.key] : g.label}
                      fixedAccountId={g.kind === 'account' ? g.key : undefined}
                      accounts={sortedAccounts}
                      currentUserId={currentUserId}
                      restColSpan={N_COLS - 1}
                      onAdd={onAdd}
                      onCreated={onCreated}
                    />
                  ) : null
                }
                expandedId={expandedId}
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
  expandedId,
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
  expandedId: string | null;
  renderRowDetail?: (row: PipelineRow) => ReactNode;
}) {
  const bodyId = `pipeline-group-${group.kind}-${group.key}`;
  const isStage = group.kind === 'stage';
  const accent = isStage ? stageAccent(group.key) : undefined;
  const total = rows.reduce((acc, r) => acc + Number(r.estimatedValue ?? 0), 0);
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
            <span className="text-xs text-fg-secondary">
              {countLabel(rows.length)}
              {isStage && isClosedStage(group.key) && ' · últimos 90 días'}
            </span>
          </button>
        </th>
        <td colSpan={N_COLS - 1} className="border-b border-line bg-subtle" />
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
          {rows.map((r) => (
            <Fragment key={r.id}>
              <DataRow
                row={r}
                today={today}
                canWrite={canWrite}
                nameOf={nameOf}
                onChangeStage={onChangeStage}
              />
              {expandedId === r.id && renderRowDetail && (
                <tr>
                  <td colSpan={N_COLS} className="border-b border-line p-0">
                    {renderRowDetail(r)}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
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
                    <span className="sr-only">
                      Valor estimado total de {isStage ? STAGE_LABELS[group.key] : group.label}
                      :{' '}
                    </span>
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

function DataRow({
  row: r,
  today,
  canWrite,
  nameOf,
  onChangeStage,
}: {
  row: PipelineRow;
  today: string;
  canWrite: boolean;
  nameOf: (userId: string | null | undefined) => string | null;
  onChangeStage: (row: PipelineRow, stage: OpportunityStage) => void;
}) {
  const accountName = r.account?.name ?? '—';
  const ownerName = r.ownerId ? (nameOf(r.ownerId) ?? 'Usuario desconocido') : null;
  const overdue =
    !!r.expectedCloseDate && isActiveStage(r.stage) && civilDate(r.expectedCloseDate) < today;
  const targets = canWrite ? stageMoveTargets(r.stage) : [];
  const fill = { background: stageAccent(r.stage) };

  return (
    <tr className="group hover:bg-subtle">
      {/* 1 · Oportunidad y Cuenta (sticky) */}
      <td className={`${TD} ${STICKY} bg-card-solid group-hover:bg-subtle`}>
        <Link
          href={`/comercial/pipeline/${r.id}`}
          title={r.name}
          className={`block truncate rounded font-semibold text-fg hover:text-accent hover:underline ${FOCUS}`}
        >
          {r.name}
        </Link>
        <span className="block truncate text-xs text-fg-secondary" title={accountName}>
          {accountName}
        </span>
      </td>

      {/* 2 · Responsable */}
      <td className={TD}>
        {ownerName ? (
          <MemberAvatar size="sm" displayName={ownerName} />
        ) : (
          <span className="text-xs text-fg-secondary">Sin responsable</span>
        )}
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
        {r.estimatedValue != null ? formatCLP(r.estimatedValue) : '—'}
      </td>

      {/* 5 · Fecha de creación */}
      <td className={`${TD} tabular-nums text-fg-secondary`}>{formatSantiagoDate(r.createdAt)}</td>

      {/* 6 · Fecha estimada de cierre */}
      <td className={`${TD} tabular-nums`}>
        {r.expectedCloseDate ? (
          overdue ? (
            <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
              <AlertTriangle size={13} aria-hidden="true" />
              {formatDbDate(r.expectedCloseDate)}
              <span className="sr-only"> (vencida)</span>
            </span>
          ) : (
            <span className="text-fg-secondary">{formatDbDate(r.expectedCloseDate)}</span>
          )
        ) : (
          <span className="text-fg-secondary">—</span>
        )}
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

      {/* 9 · Actualización — interim source lastMovementAt (ola 2: the api's lastUpdate) */}
      <td className={`${TD} text-fg-secondary`}>
        {r.lastMovementAt ? (
          <span title={formatSantiagoDateTime(r.lastMovementAt)}>
            {relativeDayLabel(r.lastMovementAt)}
          </span>
        ) : (
          '—'
        )}
      </td>

      {/* 10 · Probabilidad */}
      <td className={TD}>
        {r.probability != null ? (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 w-14 overflow-hidden rounded-full bg-subtle-hover"
            >
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${Math.max(0, Math.min(100, r.probability))}%` }}
              />
            </span>
            <span className="tabular-nums">{r.probability}%</span>
          </span>
        ) : (
          <span className="text-fg-secondary">—</span>
        )}
      </td>
    </tr>
  );
}

export default PipelineTable;
