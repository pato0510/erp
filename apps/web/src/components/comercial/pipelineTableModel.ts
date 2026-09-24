import { STAGE_ORDER, type OpportunityStage } from './stageLabels';

/* COM-025 — the pipeline table's pure model: row shape, columns, client-side search /
 * filters, grouping (Etapa | Cuenta) and in-group sorting. No React here, so ola 2 can
 * add columns (Lead between 6 and 8) and derived fields without touching the view.
 * COM-029 — column 7 «Lead» (the lead that originated the opportunity; COM-024 api). */

export interface PipelineRow {
  id: string;
  accountId: string;
  name: string;
  stage: string;
  estimatedValue: string | null;
  probability: number | null;
  expectedCloseDate: string | null;
  ownerId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMovementAt?: string | null;
  // COM-026 — derived by the api (COM-022); displayed, never recomputed.
  pendingActions?: number;
  overdueActions?: number;
  lastUpdate?: { at: string; kind: string } | null;
  valueFromBundle?: boolean; // COM-023 — value derived from service lines (read-only)
  account?: { id: string; name: string; enterprise: { id: string; name: string } | null } | null;
  // COM-029 — the lead that originated the opportunity (COM-024); null = none linked.
  leadId?: string | null;
  lead?: { id: string; name: string } | null;
}

export type GroupBy = 'stage' | 'account';
export type SortKey = 'name' | 'value' | 'created' | 'expectedClose' | 'updated' | 'probability';
export type SortDir = 'asc' | 'desc';

export type ColumnKey =
  | 'opportunity'
  | 'owner'
  | 'stage'
  | 'value'
  | 'created'
  | 'expectedClose'
  | 'lead'
  | 'account'
  | 'updated'
  | 'probability';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  help: string;
  sort?: SortKey;
  align?: 'right';
  /** Tailwind width classes for the <col> (table-fixed: every group lines up). */
  width: string;
}

/** The spec's order; column 7 «Lead» sits between expectedClose and account (COM-029). */
export const COLUMNS: ColumnDef[] = [
  {
    key: 'opportunity',
    label: 'Oportunidad y Cuenta',
    help: 'Nombre de la oportunidad y su cuenta. Clic en el nombre para ver y registrar sus acciones.',
    sort: 'name',
    width: 'w-[200px] md:w-[240px]',
  },
  {
    key: 'owner',
    label: 'Responsable',
    help: 'Persona a cargo de la oportunidad.',
    width: 'w-[112px]',
  },
  {
    key: 'stage',
    label: 'Etapa',
    help: 'Etapa del pipeline. Si tienes permiso, cámbiala desde la celda.',
    width: 'w-[148px]',
  },
  {
    key: 'value',
    label: 'Valor estimado',
    help: 'Monto estimado del negocio, en pesos.',
    sort: 'value',
    align: 'right',
    width: 'w-[136px]',
  },
  {
    key: 'created',
    label: 'Fecha de creación',
    help: 'Fecha en que se registró la oportunidad.',
    sort: 'created',
    width: 'w-[120px]',
  },
  {
    key: 'expectedClose',
    label: 'Fecha estimada de cierre',
    help: 'Fecha en que se espera cerrar. En rojo si ya pasó y la oportunidad sigue abierta.',
    sort: 'expectedClose',
    width: 'w-[136px]',
  },
  {
    key: 'lead',
    label: 'Lead',
    help: 'Lead que originó la oportunidad. Clic en el nombre para ver su ficha.',
    width: 'w-[152px]',
  },
  {
    key: 'account',
    label: 'Cuenta',
    help: 'Cuenta del cliente; abre su ficha.',
    width: 'w-[176px]',
  },
  {
    key: 'updated',
    label: 'Actualización',
    help: 'Último cambio registrado en la oportunidad y qué fue.',
    sort: 'updated',
    width: 'w-[128px]',
  },
  {
    key: 'probability',
    label: 'Probabilidad',
    help: 'Probabilidad estimada de ganar el negocio.',
    sort: 'probability',
    width: 'w-[124px]',
  },
];

/* ── Search: case- and accent-insensitive («cotizacion» finds «Cotización») ── */

export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-CL');

export interface TableFilters {
  q: string;
  ownerId: string; // '' = all
  enterprise: string; // '' | NO_ENTERPRISE | enterprise id
}

export function filterRows(
  rows: PipelineRow[],
  f: TableFilters,
  noEnterprise: string,
): PipelineRow[] {
  const q = normalizeText(f.q.trim());
  return rows.filter((r) => {
    if (f.ownerId && r.ownerId !== f.ownerId) return false;
    if (f.enterprise === noEnterprise) {
      if (r.account?.enterprise) return false;
    } else if (f.enterprise && r.account?.enterprise?.id !== f.enterprise) return false;
    if (!q) return true;
    return normalizeText(r.name).includes(q) || normalizeText(r.account?.name ?? '').includes(q);
  });
}

/* ── Groups ── */

export interface RowGroup {
  /** Stage enum value, or the account id. */
  key: string;
  kind: GroupBy;
  label: string;
  rows: PipelineRow[];
}

const byName = (a: string, b: string) => normalizeText(a).localeCompare(normalizeText(b), 'es-CL');

export function groupRows(rows: PipelineRow[], groupBy: GroupBy): RowGroup[] {
  if (groupBy === 'stage') {
    const m = new Map<string, PipelineRow[]>(STAGE_ORDER.map((s) => [s, []]));
    rows.forEach((r) => m.get(r.stage)?.push(r));
    return STAGE_ORDER.map((s: OpportunityStage) => ({
      key: s,
      kind: 'stage' as const,
      label: s,
      rows: m.get(s) ?? [],
    }));
  }
  const m = new Map<string, RowGroup>();
  for (const r of rows) {
    const g = m.get(r.accountId) ?? {
      key: r.accountId,
      kind: 'account' as const,
      label: r.account?.name ?? 'Cuenta sin nombre',
      rows: [],
    };
    g.rows.push(r);
    m.set(r.accountId, g);
  }
  return [...m.values()].sort((a, b) => byName(a.label, b.label));
}

/* ── Sorting inside a group (nulls last in both directions) ── */

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

function sortValue(r: PipelineRow, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return normalizeText(r.name);
    case 'value':
      return r.estimatedValue === null ? null : Number(r.estimatedValue);
    case 'created':
      return time(r.createdAt);
    case 'expectedClose':
      // Civil date string compares correctly as text (YYYY-MM-DD).
      return r.expectedCloseDate ? r.expectedCloseDate.slice(0, 10) : null;
    case 'updated':
      return time(r.lastUpdate?.at ?? r.lastMovementAt);
    case 'probability':
      return r.probability;
  }
}

export function sortRows(rows: PipelineRow[], key: SortKey | null, dir: SortDir): PipelineRow[] {
  if (!key) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string' && typeof vb === 'string')
      return va.localeCompare(vb, 'es-CL') * sign;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
  });
}
