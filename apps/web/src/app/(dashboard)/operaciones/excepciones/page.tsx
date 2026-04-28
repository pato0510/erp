'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Search,
  ShieldOff,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { Toast } from '../../../../components/shared/Toast';
import {
  ExceptionApproveModal,
  ExceptionDetailModal,
  ExceptionRejectModal,
  ExceptionRevokeModal,
} from '../../../../components/operations/ExceptionModals';
import { formatDate, formatRelativeDate } from '../../../../lib/formatters';

type ExceptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

interface ExceptionRow {
  id: string;
  assetId: string;
  status: ExceptionStatus;
  requestedReason: string;
  requestedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  asset: {
    id: string;
    code: string;
    name: string;
    status: string;
    assetType?: { id: string; name: string; category: string } | null;
  };
  requestedByUser: { firstName?: string; lastName?: string; email: string } | null;
  requestedDocumentTypes: Array<{ id: string; name: string; code: string }>;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_META: Record<ExceptionStatus, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Pendiente', bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  APPROVED: { label: 'Aprobada', bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d' },
  REJECTED: { label: 'Rechazada', bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
  EXPIRED: { label: 'Expirada', bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  REVOKED: { label: 'Revocada', bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c' },
};

const STATUS_FILTERS: Array<{ value: ExceptionStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Aprobadas (vigentes)' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'EXPIRED', label: 'Expiradas' },
  { value: 'REVOKED', label: 'Revocadas' },
];

interface AssetOption {
  id: string;
  code: string;
  name: string;
}

const PAGE_SIZE = 20;

export default function ExcepcionesPage() {
  return (
    <Suspense fallback={null}>
      <ExcepcionesContent />
    </Suspense>
  );
}

function ExcepcionesContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const activeCompanyId = apiClient.getCompanyId();
  const userRole = user?.companies.find((c) => c.companyId === activeCompanyId)?.role ?? null;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  const initialId = searchParams.get('id');
  const [statusFilter, setStatusFilter] = useState<ExceptionStatus | ''>('');
  const [assetId, setAssetId] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<ExceptionRow> | null>(null);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [kpis, setKpis] = useState<{
    pending: number;
    active: number;
    expiringSoon: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const [approveTarget, setApproveTarget] = useState<ExceptionRow | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(initialId);

  /* Debounced search → since the backend doesn't have a search filter
     for exceptions (yet), we filter client-side on the page slice. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, assetId]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (assetId) params.set('assetId', assetId);
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    return params;
  }, [statusFilter, assetId, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Paginated<ExceptionRow>>(
        `/api/operations/exceptions?${buildParams().toString()}`,
      );
      setData(res);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando excepciones.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  /* Compose KPI card numbers from a few targeted count calls so the
     header stays in sync regardless of the active filters below. */
  const loadKpis = useCallback(async () => {
    try {
      const [pending, active, all] = await Promise.all([
        apiClient.get<Paginated<ExceptionRow>>('/api/operations/exceptions?status=PENDING&limit=1'),
        apiClient.get<Paginated<ExceptionRow>>(
          '/api/operations/exceptions?status=APPROVED&limit=100',
        ),
        apiClient.get<Paginated<ExceptionRow>>('/api/operations/exceptions?limit=1'),
      ]);
      const sevenDays = Date.now() + 7 * 24 * 3600_000;
      const expiringSoon = active.data.filter(
        (a) => a.validUntil && new Date(a.validUntil).getTime() <= sevenDays,
      ).length;
      setKpis({
        pending: pending.total,
        active: active.total,
        expiringSoon,
        total: all.total,
      });
    } catch {
      /* Non-critical — keep stale numbers. */
    }
  }, []);

  const loadCatalogs = useCallback(async () => {
    try {
      const a = await apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100');
      setAssets(a.data);
    } catch {
      /* Selectors will be empty — list still renders. */
    }
  }, []);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    load();
    loadKpis();
  }, [load, loadKpis]);

  const filteredRows = (data?.data ?? []).filter((row) => {
    if (!search) return true;
    const haystack = [
      row.asset.code,
      row.asset.name,
      row.requestedReason,
      row.requestedByUser
        ? `${row.requestedByUser.firstName} ${row.requestedByUser.lastName} ${row.requestedByUser.email}`
        : '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });

  const onChange = () => {
    load();
    loadKpis();
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-5">
        <div className="ops-breadcrumb">
          <Link href="/operaciones" className="ops-breadcrumb__link">
            Operaciones
          </Link>
          {' / '}
          <span style={{ color: 'var(--text-primary)' }}>Excepciones</span>
        </div>
        <h1
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Excepciones temporales
        </h1>
        <p
          className="mt-1"
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Gestión de liberaciones temporales de bloqueos
        </p>
      </div>

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KpiCard
            label="Pendientes"
            value={kpis.pending}
            valueColor="#b91c1c"
            icon={<AlertCircle size={16} />}
          />
          <KpiCard
            label="Activas"
            value={kpis.active}
            valueColor="#a16207"
            icon={<ShieldOff size={16} />}
          />
          <KpiCard
            label="Próximas a expirar"
            value={kpis.expiringSoon}
            valueColor="#c2410c"
            icon={<Calendar size={16} />}
            subtitle="Próximos 7 días"
          />
          <KpiCard label="Histórico" value={kpis.total} icon={<History size={16} />} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar por activo, razón, solicitante..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="cp-input pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ExceptionStatus | '')}
          className="cp-input"
          style={{ width: 'auto', minWidth: 200 }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value || 'all'} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 220 }}
        >
          <option value="">Todos los activos</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
        {(statusFilter || assetId || search) && (
          <button
            onClick={() => {
              setStatusFilter('');
              setAssetId('');
              setSearchInput('');
              setSearch('');
            }}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 rounded-lg"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {loading && !data && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded"
                style={{ height: 60, background: 'rgba(0,0,0,0.04)' }}
              />
            ))}
          </div>
        )}
        {data && filteredRows.length === 0 && !loading && (
          <div className="p-12 text-center">
            <ShieldOff size={36} className="mx-auto text-gray-300 mb-3" />
            <p
              className="text-[var(--text-secondary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              No hay excepciones que coincidan.
            </p>
          </div>
        )}
        {data && filteredRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  className="border-b border-[var(--border-color)]"
                  style={{ background: 'var(--input-bg)' }}
                >
                  <Th>Activo</Th>
                  <Th>Razón</Th>
                  <Th>Solicitante</Th>
                  <Th>Fecha</Th>
                  <Th>Vigencia</Th>
                  <Th>Estado</Th>
                  <Th align="right" style={{ width: 200 }}>
                    Acciones
                  </Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const stat = STATUS_META[row.status];
                  const isVehicle =
                    (row.asset.assetType?.category ?? '').toUpperCase() === 'VEHICLE';
                  const assetHref = isVehicle
                    ? `/operaciones/vehiculos`
                    : `/operaciones/equipos/${row.asset.id}`;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--input-bg)] transition"
                    >
                      <td style={{ padding: '8px 16px' }}>
                        <Link
                          href={assetHref}
                          className="hover:underline"
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {row.asset.code}
                        </Link>
                        <div
                          className="text-[var(--text-muted)] mt-0.5"
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: 12,
                          }}
                        >
                          {row.asset.name}
                        </div>
                      </td>
                      <td style={{ padding: '8px 16px', maxWidth: 320 }}>
                        <div
                          className="truncate"
                          title={row.requestedReason}
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: 13,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {row.requestedReason}
                        </div>
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: 13,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {row.requestedByUser
                            ? row.requestedByUser.firstName
                              ? `${row.requestedByUser.firstName} ${row.requestedByUser.lastName ?? ''}`.trim()
                              : row.requestedByUser.email
                            : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        <span
                          className="text-[var(--text-secondary)]"
                          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 12 }}
                          title={formatDate(row.requestedAt)}
                        >
                          {formatRelativeDate(row.requestedAt)}
                        </span>
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        {row.status === 'APPROVED' && row.validFrom && row.validUntil ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 12,
                            }}
                          >
                            {formatDate(row.validFrom)} → {formatDate(row.validUntil)}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        <span className="cfg-chip" style={{ background: stat.bg, color: stat.fg }}>
                          {stat.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                        <RowAction onClick={() => setDetailId(row.id)} title="Ver detalle">
                          <Eye size={13} />
                        </RowAction>
                        {row.status === 'PENDING' && isAdmin && (
                          <>
                            <button
                              onClick={() => setApproveTarget(row)}
                              className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full text-white"
                              style={{
                                background: '#15803d',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontWeight: 500,
                              }}
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => setRejectTargetId(row.id)}
                              className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full text-white"
                              style={{
                                background: '#DC2626',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontWeight: 500,
                              }}
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {row.status === 'APPROVED' && isAdmin && (
                          <button
                            onClick={() => setRevokeTargetId(row.id)}
                            className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full text-white"
                            style={{
                              background: '#D97706',
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontWeight: 500,
                            }}
                          >
                            Revocar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <span
              className="text-[var(--text-secondary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 12 }}
            >
              Página {data.page} de {data.totalPages} · {data.total} excepciones
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {approveTarget && (
        <ExceptionApproveModal
          exception={approveTarget}
          onClose={() => setApproveTarget(null)}
          onSubmitted={() => {
            setToast({ message: 'Excepción aprobada.', type: 'success' });
            onChange();
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}
      {rejectTargetId && (
        <ExceptionRejectModal
          exceptionId={rejectTargetId}
          onClose={() => setRejectTargetId(null)}
          onSubmitted={() => {
            setToast({ message: 'Excepción rechazada.', type: 'success' });
            onChange();
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}
      {revokeTargetId && (
        <ExceptionRevokeModal
          exceptionId={revokeTargetId}
          onClose={() => setRevokeTargetId(null)}
          onSubmitted={(reblocked) => {
            setToast({
              message: reblocked
                ? 'Excepción revocada. El activo fue re-bloqueado automáticamente.'
                : 'Excepción revocada.',
              type: 'success',
            });
            onChange();
          }}
          onError={(msg) => setToast({ message: msg, type: 'error' })}
        />
      )}
      {detailId && (
        <ExceptionDetailModal exceptionId={detailId} onClose={() => setDetailId(null)} />
      )}

      <PageStyles />
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueColor,
  icon,
  subtitle,
}: {
  label: string;
  value: number;
  valueColor?: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl"
      style={{ padding: 16 }}
    >
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        {icon}
        <span
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="mt-2"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: '-0.01em',
          color: valueColor ?? 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      {subtitle && <p className="text-xs text-[var(--text-secondary)] mt-1">{subtitle}</p>}
    </div>
  );
}

function Th({
  children,
  align,
  style,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        padding: '10px 16px',
        fontFamily: 'var(--font-ibm-plex-mono), monospace',
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function RowAction({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
    >
      {children}
    </button>
  );
}

function PageStyles() {
  return (
    <style jsx global>{`
      .ops-breadcrumb {
        font-family: var(--font-ibm-plex-mono), var(--font-jetbrains-mono), monospace;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(0, 0, 0, 0.5);
        margin-bottom: 14px;
      }
      html.dark .ops-breadcrumb {
        color: rgba(255, 255, 255, 0.5);
      }
      .ops-breadcrumb__link {
        color: inherit;
        text-decoration: none;
      }
      .cp-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-family: var(--font-outfit), sans-serif;
        font-size: 14px;
        color: var(--text-primary);
        background: var(--input-bg);
        outline: none;
      }
      .cp-input:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }
      .cfg-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-family: var(--font-jetbrains-mono), monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
    `}</style>
  );
}
