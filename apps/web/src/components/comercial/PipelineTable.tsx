'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCLP, formatDate, formatRelativeDate } from '../../lib/formatters';
import { EnterpriseSelect } from './EnterpriseSelect';
import {
  ACTIVE_STAGES,
  CLOSED_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  StageBadge,
  isClosedStage,
  stageStyle,
  type OpportunityStage,
} from './stageLabels';

/* COM-020 — Pipeline 2.0: the TABLE view of the pipeline (founder decision 2026-09-17,
 * "inspired by Monday but minimalist", NO drag-and-drop — deferred; it would be an
 * extension over this view). Groups by stage in STAGE_ORDER: one collapsible group per
 * open stage (button + aria-expanded/aria-controls; open groups expanded, empty groups
 * collapsed with "0"), plus GANADA/PERDIDA groups (collapsed) when "Ver cerradas" is on.
 * The stage pill is a native <select> for writers — choosing a stage calls the page's
 * attemptMove, i.e. EXACTLY the kanban's path (GANADA light confirm, PERDIDA modal,
 * canonical PATCH /:id/stage, optimistic + revert + toast) — read-only users see the
 * static pill. Filters are server-side (the page owns them and refetches); sorting is
 * client-side within each group (aria-sort headers). Token utilities only. */

export interface PipelineRow {
  id: string;
  accountId: string;
  name: string;
  stage: string;
  estimatedValue: string | null;
  expectedCloseDate: string | null;
  ownerId: string | null;
  closedAt: string | null;
  updatedAt: string;
  lastMovementAt?: string | null;
  account?: { id: string; name: string; enterprise: { id: string; name: string } | null } | null;
}

export interface PipelineFilters {
  q: string;
  stages: string[];
  ownerId: string;
  enterprise: string; // '' | NO_ENTERPRISE | id
  showClosed: boolean;
}

type SortKey = 'name' | 'value' | 'lastMovement' | 'expectedClose';
type SortDir = 'asc' | 'desc';

const OPEN_STAGES: OpportunityStage[] = [...ACTIVE_STAGES, 'EN_PAUSA'];
const SELECT =
  'rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

const COLUMNS: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Oportunidad' },
  { key: null, label: 'Cuenta' },
  { key: null, label: 'Empresa' },
  { key: null, label: 'Etapa' },
  { key: 'value', label: 'Valor', align: 'right' },
  { key: null, label: 'Responsable' },
  { key: 'lastMovement', label: 'Último movimiento' },
  { key: 'expectedClose', label: 'Cierre esperado' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PipelineTable({
  rows,
  loading,
  canWrite,
  filters,
  onFiltersChange,
  ownerOptions,
  ownerLabel,
  onChangeStage,
}: {
  rows: PipelineRow[];
  loading: boolean;
  canWrite: boolean;
  filters: PipelineFilters;
  onFiltersChange: (next: PipelineFilters) => void;
  ownerOptions: { id: string; label: string }[];
  ownerLabel: (ownerId: string | null) => string;
  onChangeStage: (row: PipelineRow, stage: OpportunityStage) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const stages: OpportunityStage[] = filters.showClosed
    ? [...OPEN_STAGES, ...CLOSED_STAGES]
    : OPEN_STAGES;

  const byStage = useMemo(() => {
    const m = new Map<string, PipelineRow[]>();
    for (const r of rows) {
      const list = m.get(r.stage) ?? [];
      list.push(r);
      m.set(r.stage, list);
    }
    return m;
  }, [rows]);

  const sortRows = (list: PipelineRow[]): PipelineRow[] => {
    if (!sortKey) return list;
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: PipelineRow): number | string | null => {
      switch (sortKey) {
        case 'name':
          return r.name.toLowerCase();
        case 'value':
          return r.estimatedValue === null ? null : Number(r.estimatedValue);
        case 'lastMovement':
          return r.lastMovementAt ? new Date(r.lastMovementAt).getTime() : null;
        case 'expectedClose':
          return r.expectedCloseDate ? new Date(r.expectedCloseDate).getTime() : null;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // nulls last, whatever the direction
      if (vb === null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const isCollapsed = (stage: string, count: number) =>
    collapsed[stage] ?? (count === 0 || isClosedStage(stage));
  const toggleGroup = (stage: string, count: number) =>
    setCollapsed((cur) => ({ ...cur, [stage]: !isCollapsed(stage, count) }));

  const set = (patch: Partial<PipelineFilters>) => onFiltersChange({ ...filters, ...patch });
  const hasFilters =
    filters.q !== '' ||
    filters.stages.length > 0 ||
    filters.ownerId !== '' ||
    filters.enterprise !== '';

  const colCount = COLUMNS.length;

  return (
    <div className="space-y-4">
      {/* Filters — server-side (the page refetches on change). */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="pipeline-q" className="sr-only">
            Buscar oportunidad o cuenta
          </label>
          <input
            id="pipeline-q"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar oportunidad o cuenta…"
            className={`${SELECT} w-full`}
          />
        </div>
        <div>
          <label htmlFor="pipeline-stages" className="sr-only">
            Etapas
          </label>
          <select
            id="pipeline-stages"
            multiple
            value={filters.stages}
            onChange={(e) =>
              set({ stages: Array.from(e.target.selectedOptions).map((o) => o.value) })
            }
            className={`${SELECT} h-[42px] min-w-[160px]`}
            title="Etapas (Ctrl/Cmd + clic para varias)"
          >
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pipeline-owner" className="sr-only">
            Responsable
          </label>
          <select
            id="pipeline-owner"
            value={filters.ownerId}
            onChange={(e) => set({ ownerId: e.target.value })}
            className={SELECT}
          >
            <option value="">Todos los responsables</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <EnterpriseSelect
          mode="filter"
          id="pipeline-enterprise"
          value={filters.enterprise}
          onChange={(v) => set({ enterprise: v })}
          className={SELECT}
        />
        <label className="flex items-center gap-2 py-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={filters.showClosed}
            onChange={(e) => set({ showClosed: e.target.checked })}
            className="h-4 w-4 rounded border-[var(--border-color)]"
          />
          Ver cerradas (90 días)
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => set({ q: '', stages: [], ownerId: '', enterprise: '' })}
            className="py-2 text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Grouped table — horizontally scrollable in narrow viewports. */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-subtle">
            <tr>
              {COLUMNS.map((c) => {
                const active = c.key !== null && sortKey === c.key;
                const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={c.key ? ariaSort : undefined}
                    className={`label px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--text-secondary)] ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key as SortKey)}
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]"
                      >
                        {c.label}
                        {active && <span aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {loading ? (
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: colCount }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-24 rounded bg-subtle-hover" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : (
            stages.map((stage) => {
              const group = byStage.get(stage) ?? [];
              const count = group.length;
              const total = group.reduce((acc, r) => acc + Number(r.estimatedValue ?? 0), 0);
              const open = !isCollapsed(stage, count);
              const bodyId = `pipeline-group-${stage}`;
              return (
                <tbody key={stage} className="border-t border-[var(--border-color)]">
                  <tr className="bg-subtle">
                    <td colSpan={colCount} className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(stage, count)}
                        aria-expanded={open}
                        aria-controls={bodyId}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="text-[var(--text-secondary)]" aria-hidden="true">
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <StageBadge stage={stage} />
                        <span className="text-xs text-[var(--text-secondary)]">
                          {count} {count === 1 ? 'oportunidad' : 'oportunidades'}
                        </span>
                        <span className="ml-auto text-xs font-medium text-[var(--text-primary)]">
                          {formatCLP(total)}
                        </span>
                      </button>
                    </td>
                  </tr>
                  {open &&
                    (count === 0 ? (
                      <tr id={bodyId}>
                        <td
                          colSpan={colCount}
                          className="px-4 py-3 text-sm text-[var(--text-secondary)]"
                        >
                          Sin oportunidades en esta etapa.
                        </td>
                      </tr>
                    ) : (
                      sortRows(group).map((r, i) => (
                        <tr
                          key={r.id}
                          id={i === 0 ? bodyId : undefined}
                          className="border-t border-[var(--border-color)] hover:bg-black/[0.02]"
                        >
                          <td className="px-4 py-3 font-medium">
                            <Link
                              href={`/comercial/pipeline/${r.id}`}
                              className="hover:underline"
                              style={{ color: 'var(--color-accent)' }}
                            >
                              {r.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {r.account ? (
                              <Link
                                href={`/comercial/cuentas/${r.account.id}`}
                                className="hover:underline"
                              >
                                {r.account.name}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {r.account?.enterprise?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            {canWrite && !isClosedStage(r.stage) ? (
                              <>
                                <label htmlFor={`pipeline-stage-${r.id}`} className="sr-only">
                                  Etapa de {r.name}
                                </label>
                                <select
                                  id={`pipeline-stage-${r.id}`}
                                  value={r.stage}
                                  onChange={(e) =>
                                    onChangeStage(r, e.target.value as OpportunityStage)
                                  }
                                  className="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-medium"
                                  style={stageStyle(r.stage)}
                                >
                                  {STAGE_ORDER.map((s) => (
                                    <option key={s} value={s}>
                                      {STAGE_LABELS[s]}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <StageBadge stage={r.stage} />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--text-primary)]">
                            {r.estimatedValue != null ? formatCLP(r.estimatedValue) : '—'}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {ownerLabel(r.ownerId)}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {r.lastMovementAt ? (
                              <span title={formatDateTime(r.lastMovementAt)}>
                                {formatRelativeDate(r.lastMovementAt)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--text-secondary)]">
                            {r.expectedCloseDate ? formatDate(r.expectedCloseDate) : '—'}
                          </td>
                        </tr>
                      ))
                    ))}
                </tbody>
              );
            })
          )}
        </table>
      </div>
    </div>
  );
}

export default PipelineTable;
