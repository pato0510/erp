'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Edit,
  Eye,
  FileText,
  HardHat,
  LayoutGrid,
  Leaf,
  List,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { Toast } from '../../../../components/shared/Toast';
import { ProcedureFormModal } from '../../../../components/operations/ProcedureFormModal';

type ProcedureStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUPERSEDED' | 'DEPRECATED';
type ProcedureCategory =
  | 'OPERATION'
  | 'MAINTENANCE'
  | 'EMERGENCY'
  | 'SAFETY'
  | 'QUALITY'
  | 'ENVIRONMENTAL'
  | 'OTHER';

interface ProcedureRow {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  category: ProcedureCategory;
  version: string;
  authoredBy: string;
  publishedAt?: string | null;
  status: ProcedureStatus;
  requiresAcknowledgment: boolean;
  acknowledgmentDeadlineDays?: number | null;
  estimatedReadingMinutes?: number | null;
  applicableAssetIds: string[];
  applicableAssetTypeIds: string[];
  applicableLocationIds: string[];
  applicableRoles: string[];
  createdAt: string;
  updatedAt: string;
}

interface KpiCounts {
  published: number;
  inReview: number;
  draft: number;
  withAck: number;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_LABELS: Record<ProcedureStatus, string> = {
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  PUBLISHED: 'Publicado',
  SUPERSEDED: 'Reemplazado',
  DEPRECATED: 'Deprecado',
};

const STATUS_META: Record<ProcedureStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  IN_REVIEW: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  PUBLISHED: { bg: 'rgba(34, 197, 94, 0.14)', fg: '#15803d' },
  SUPERSEDED: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  DEPRECATED: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
};

const CATEGORY_META: Record<
  ProcedureCategory,
  { label: string; color: string; icon: typeof BookOpen }
> = {
  OPERATION: { label: 'Operación', color: '#2563EB', icon: HardHat },
  MAINTENANCE: { label: 'Mantenimiento', color: '#64748B', icon: BookOpen },
  EMERGENCY: { label: 'Emergencia', color: '#EF4444', icon: AlertTriangle },
  SAFETY: { label: 'Seguridad', color: '#EAB308', icon: ShieldCheck },
  QUALITY: { label: 'Calidad', color: '#A855F7', icon: Sparkles },
  ENVIRONMENTAL: { label: 'Ambiental', color: '#22C55E', icon: Leaf },
  OTHER: { label: 'Otro', color: '#475569', icon: FileText },
};

const PAGE_SIZE = 20;
const VIEW_KEY = 'ops27.procedures.view';

export default function ProcedimientosPage() {
  const { user } = useAuth();
  const userRole = (user as { role?: string } | null)?.role;
  const canCreate = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'MANAGER';

  const [kpi, setKpi] = useState<KpiCounts | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<ProcedureCategory, number> | null>(
    null,
  );
  const [list, setList] = useState<Paginated<ProcedureRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProcedureStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<ProcedureCategory | ''>('');
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [applicableToMe, setApplicableToMe] = useState(false);

  const [view, setView] = useState<'table' | 'cards'>(() => {
    if (typeof window === 'undefined') return 'table';
    return (window.localStorage.getItem(VIEW_KEY) as 'table' | 'cards') ?? 'table';
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_KEY, view);
    }
  }, [view]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    if (search.trim()) p.set('search', search.trim());
    if (categoryFilter) p.set('category', categoryFilter);
    if (includeDeprecated) p.set('includeDeprecated', 'true');
    if (applicableToMe) p.set('applicableToMe', 'true');
    for (const s of statusFilter) p.append('status', s);
    return p;
  }, [page, search, statusFilter, categoryFilter, includeDeprecated, applicableToMe]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, cats, listRes] = await Promise.all([
        apiClient.get<KpiCounts>('/api/operations/procedures/kpi'),
        apiClient.get<Record<ProcedureCategory, number>>(
          '/api/operations/procedures/category-counts',
        ),
        apiClient.get<Paginated<ProcedureRow>>(
          `/api/operations/procedures?${buildParams().toString()}`,
        ),
      ]);
      setKpi(k);
      setCategoryCounts(cats);
      setList(listRes);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando procedimientos.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    load();
  }, [load]);

  const filtersDirty =
    search.trim().length > 0 ||
    statusFilter.length > 0 ||
    categoryFilter !== '' ||
    includeDeprecated ||
    applicableToMe;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter([]);
    setCategoryFilter('');
    setIncludeDeprecated(false);
    setApplicableToMe(false);
    setPage(1);
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div
            className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              letterSpacing: '0.18em',
              marginBottom: 14,
            }}
          >
            Operaciones / Procedimientos
          </div>
          <h1
            className="text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: '-0.01em',
              margin: '0 0 8px',
            }}
          >
            Biblioteca de procedimientos
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            Instructivos y procedimientos operacionales
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: '#2563EB',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
            }}
          >
            <Plus size={14} /> Nuevo procedimiento
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Publicados activos"
          value={kpi?.published ?? 0}
          icon={CheckCircle2}
          color="#22C55E"
        />
        <KpiCard label="En revisión" value={kpi?.inReview ?? 0} icon={Clock} color="#EAB308" />
        <KpiCard label="En borrador" value={kpi?.draft ?? 0} icon={Edit} color="#64748B" />
        <KpiCard label="Con acuse pendiente" value={kpi?.withAck ?? 0} icon={Eye} color="#F97316" />
      </div>

      {/* Categories */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-5">
        {(Object.keys(CATEGORY_META) as ProcedureCategory[]).map((c) => {
          const meta = CATEGORY_META[c];
          const Icon = meta.icon;
          const count = categoryCounts?.[c] ?? 0;
          const active = categoryFilter === c;
          return (
            <button
              key={c}
              onClick={() => {
                setCategoryFilter((prev) => (prev === c ? '' : c));
                setPage(1);
              }}
              className="p-3 rounded-xl text-left transition"
              style={{
                background: active ? `${meta.color}22` : 'var(--bg-card)',
                border: `1px solid ${active ? meta.color : 'var(--border-color)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon size={16} style={{ color: meta.color }} />
                <span
                  className="text-xs"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    color: meta.color,
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              </div>
              <div
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                {meta.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div
        className="flex flex-wrap items-end gap-2 p-3 mb-4 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-[var(--text-secondary)]">Buscar</label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Código, título o palabra clave"
              className="cp-input pl-7"
            />
          </div>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="text-xs text-[var(--text-secondary)]">Estado</label>
          <select
            value={statusFilter[0] ?? ''}
            onChange={(e) => {
              setStatusFilter(e.target.value ? [e.target.value as ProcedureStatus] : []);
              setPage(1);
            }}
            className="cp-input"
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as ProcedureStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={includeDeprecated}
            onChange={(e) => setIncludeDeprecated(e.target.checked)}
          />
          Mostrar deprecados
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={applicableToMe}
            onChange={(e) => setApplicableToMe(e.target.checked)}
          />
          Solo aplicables a mí
        </label>
        <div className="ml-auto flex items-center gap-2">
          {filtersDirty && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs rounded-full border border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <X size={12} /> Limpiar
            </button>
          )}
          <div
            className="flex p-0.5 rounded-full"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
          >
            <button
              onClick={() => setView('table')}
              className="p-1.5 rounded-full"
              style={{
                background: view === 'table' ? '#2563EB' : 'transparent',
                color: view === 'table' ? '#fff' : 'var(--text-secondary)',
              }}
              title="Vista tabla"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView('cards')}
              className="p-1.5 rounded-full"
              style={{
                background: view === 'cards' ? '#2563EB' : 'transparent',
                color: view === 'cards' ? '#fff' : 'var(--text-secondary)',
              }}
              title="Vista tarjetas"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div
          className="p-10 text-center text-[var(--text-secondary)] rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          Cargando...
        </div>
      ) : !list || list.data.length === 0 ? (
        <div
          className="p-10 text-center text-[var(--text-secondary)] rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <BookOpen size={32} className="mx-auto mb-2 text-gray-300" />
          <p>No hay procedimientos que coincidan con los filtros.</p>
        </div>
      ) : view === 'table' ? (
        <ProceduresTable rows={list.data} />
      ) : (
        <ProceduresCards rows={list.data} />
      )}

      {/* Pagination */}
      {list && list.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-[var(--text-secondary)]">
            Página {list.page} de {list.totalPages} · {list.total} procedimientos
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-full disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= list.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-full disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <ProcedureFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            setToast({ message: 'Procedimiento creado.', type: 'success' });
            load();
          }}
        />
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof BookOpen;
  color: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs uppercase tracking-wider text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', letterSpacing: '0.18em' }}
        >
          {label}
        </span>
        <Icon size={16} style={{ color }} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 700,
          fontSize: 28,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ProceduresTable({ rows }: { rows: ProcedureRow[] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Título</Th>
              <Th>Categoría</Th>
              <Th>Versión</Th>
              <Th>Estado</Th>
              <Th>Aplicable a</Th>
              <Th>Acuses</Th>
              <Th>Actualizado</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const meta = CATEGORY_META[p.category];
              const Icon = meta.icon;
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <Td>
                    <Link
                      href={`/operaciones/procedimientos/${p.id}`}
                      className="text-blue-600 hover:underline"
                      style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12 }}
                    >
                      {p.code}
                    </Link>
                  </Td>
                  <Td>
                    <div style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}>
                      {p.title}
                    </div>
                    {p.description && (
                      <div
                        className="text-xs text-[var(--text-muted)] mt-0.5"
                        style={{
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.description}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: `${meta.color}22`,
                        color: meta.color,
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 600,
                      }}
                    >
                      <Icon size={11} /> {meta.label}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                      style={{
                        background: 'rgba(100, 116, 139, 0.14)',
                        color: '#475569',
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                      }}
                    >
                      v{p.version}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>
                    <ApplicableSummary p={p} />
                  </Td>
                  <Td>
                    {p.requiresAcknowledgment ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{ background: 'rgba(249, 115, 22, 0.14)', color: '#c2410c' }}
                      >
                        <Eye size={11} /> Requiere acuse
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatRelative(p.updatedAt)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProceduresCards({ rows }: { rows: ProcedureRow[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((p) => {
        const meta = CATEGORY_META[p.category];
        const Icon = meta.icon;
        return (
          <Link
            key={p.id}
            href={`/operaciones/procedimientos/${p.id}`}
            className="block p-4 rounded-xl hover:shadow-sm transition"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderLeft: `4px solid ${meta.color}`,
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ background: `${meta.color}22`, color: meta.color, fontWeight: 600 }}
              >
                <Icon size={11} /> {meta.label}
              </span>
              <StatusBadge status={p.status} />
            </div>
            <div
              className="text-sm mb-1"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {p.title}
            </div>
            <div
              className="text-xs text-[var(--text-muted)] mb-2"
              style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
            >
              {p.code} · v{p.version}
            </div>
            {p.description && (
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-2">
                {p.description}
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{formatRelative(p.updatedAt)}</span>
              {p.requiresAcknowledgment && (
                <span style={{ color: '#c2410c' }}>
                  <Eye size={11} className="inline mr-0.5" /> Acuse
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: ProcedureStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
      style={{
        background: meta.bg,
        color: meta.fg,
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 600,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ApplicableSummary({ p }: { p: ProcedureRow }) {
  const total =
    p.applicableAssetIds.length +
    p.applicableAssetTypeIds.length +
    p.applicableLocationIds.length +
    p.applicableRoles.length;
  if (total === 0) return <span className="text-[var(--text-muted)] text-xs">Toda la empresa</span>;
  const parts: string[] = [];
  if (p.applicableAssetIds.length) parts.push(`${p.applicableAssetIds.length} activos`);
  if (p.applicableAssetTypeIds.length) parts.push(`${p.applicableAssetTypeIds.length} tipos`);
  if (p.applicableLocationIds.length) parts.push(`${p.applicableLocationIds.length} ubicaciones`);
  if (p.applicableRoles.length) parts.push(`${p.applicableRoles.length} roles`);
  return <span className="text-xs text-[var(--text-secondary)]">{parts.join(' · ')}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 14px',
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        fontWeight: 500,
        background: 'var(--input-bg)',
        borderBottom: '1px solid var(--border-color)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '10px 14px',
        fontSize: 14,
        color: 'var(--text-primary)',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `hace ${days}d`;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(d);
}
