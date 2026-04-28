'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { Toast } from '../../../../components/shared/Toast';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../components/operations/DocumentStatusBadge';
import { PermitUploadModal } from '../../../../components/operations/PermitUploadModal';
import { formatDate } from '../../../../lib/formatters';

type PermitStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';

interface PermitTypeRef {
  id: string;
  name: string;
  code: string;
  category: string;
  criticality: string;
  blocksOperation: boolean;
  alertDaysBefore: number;
  hasExpiration: boolean;
  defaultValidityDays?: number | null;
  issuingAuthority?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
}

interface PermitRow {
  id: string;
  permitTypeId: string;
  assetId: string | null;
  locationId: string | null;
  permitNumber: string;
  issuingAuthority: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  scope: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: PermitStatus;
  statusReason: string | null;
  version: number;
  uploadedBy: string;
  createdAt: string;
  derivedStatus: DerivedDocumentStatus;
  permitType: PermitTypeRef;
  asset: {
    id: string;
    code: string;
    name: string;
    status: string;
    assetType?: { id: string; name: string; category: string } | null;
  } | null;
  location: { id: string; name: string; code?: string | null; address?: string | null } | null;
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PermitCompliance {
  total: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  compliancePercentage: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  MUNICIPAL: 'Municipal',
  SANITARY: 'Sanitario',
  ENVIRONMENTAL: 'Ambiental',
  FIRE_DEPT: 'Bomberos',
  LABOR: 'Laboral',
  ELECTRICAL: 'Eléctrico',
  OTHER: 'Otro',
};

const STATUS_FILTERS: Array<{ value: PermitStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'APPROVED', label: 'Vigentes' },
  { value: 'PENDING_REVIEW', label: 'Pendiente revisión' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'REJECTED', label: 'Rechazados' },
  { value: 'ARCHIVED', label: 'Archivados' },
];

const PAGE_SIZE = 20;

type Tab = 'externos' | 'trabajo';

export default function PermisosPage() {
  const { user } = useAuth();
  void user;

  const [tab, setTab] = useState<Tab>('externos');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [permitTypeId, setPermitTypeId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<'' | 'asset' | 'location'>('');
  const [statusFilter, setStatusFilter] = useState<PermitStatus | ''>('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<PermitRow> | null>(null);
  const [compliance, setCompliance] = useState<PermitCompliance | null>(null);
  const [permitTypes, setPermitTypes] = useState<PermitTypeRef[]>([]);
  const [permitTypesLoaded, setPermitTypesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Debounced search input. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, permitTypeId, categoryFilter, statusFilter, targetTypeFilter]);

  const loadCatalogs = useCallback(async () => {
    try {
      const t = await apiClient.get<PermitTypeRef[]>('/api/operations/permit-types');
      setPermitTypes(t.filter((x) => x.isActive !== false));
    } catch {
      /* Selectors empty — list still works. */
    } finally {
      setPermitTypesLoaded(true);
    }
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (permitTypeId) params.set('permitTypeId', permitTypeId);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    return params;
  }, [search, permitTypeId, statusFilter, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, comp] = await Promise.all([
        apiClient.get<Paginated<PermitRow>>(`/api/operations/permits?${buildParams().toString()}`),
        apiClient.get<PermitCompliance>('/api/operations/permits/compliance'),
      ]);
      setData(list);
      setCompliance(comp);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudieron cargar los permisos.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    if (tab === 'externos') load();
  }, [load, tab]);

  /* Apply local filters (category + target type) since the API doesn't
     accept those today. The dataset post-server-pagination is small so
     this stays cheap. */
  const filteredRows = (data?.data ?? []).filter((row) => {
    if (categoryFilter && row.permitType.category !== categoryFilter) return false;
    if (targetTypeFilter === 'asset' && !row.assetId) return false;
    if (targetTypeFilter === 'location' && !row.locationId) return false;
    return true;
  });

  const seedDefaults = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const res = await apiClient.post<{ created: number; skipped: number }>(
        '/api/operations/permit-types/seed-defaults',
        {},
      );
      setToast({
        message: `Pack chileno aplicado. ${res.created} creados, ${res.skipped} omitidos.`,
        type: 'success',
      });
      loadCatalogs();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo cargar el pack chileno.',
        type: 'error',
      });
    } finally {
      setSeeding(false);
    }
  };

  const triggerDownload = async (row: PermitRow) => {
    try {
      const blob = await apiClient.fetchBlob(`/api/operations/permits/${row.id}/file?download=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.fileName ?? 'permiso';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo descargar el archivo.',
        type: 'error',
      });
    }
  };

  const compliancePctColor =
    (compliance?.compliancePercentage ?? 0) >= 90
      ? '#15803d'
      : (compliance?.compliancePercentage ?? 0) >= 70
        ? '#a16207'
        : '#b91c1c';

  const isUnconfigured = permitTypesLoaded && permitTypes.length === 0;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-5">
        <div className="ops-breadcrumb">Operaciones / Permisos</div>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
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
              Permisos operacionales
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
              Permisos externos y autorizaciones vigentes
            </p>
          </div>
          {tab === 'externos' && (
            <button
              onClick={() => setUploadOpen(true)}
              disabled={isUnconfigured}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white disabled:opacity-50"
              style={{
                background: '#1C1C1E',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Upload size={14} /> Cargar permiso
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-6 p-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl"
        style={{ width: 'fit-content' }}
      >
        <button
          onClick={() => setTab('externos')}
          className="px-4 py-2 text-sm rounded-lg transition"
          style={{
            background: tab === 'externos' ? '#2563eb' : 'transparent',
            color: tab === 'externos' ? '#fff' : 'var(--text-secondary)',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: tab === 'externos' ? 600 : 500,
          }}
        >
          Externos
        </button>
        <button
          onClick={() => setTab('trabajo')}
          className="px-4 py-2 text-sm rounded-lg transition"
          style={{
            background: tab === 'trabajo' ? '#2563eb' : 'transparent',
            color: tab === 'trabajo' ? '#fff' : 'var(--text-secondary)',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: tab === 'trabajo' ? 600 : 500,
          }}
        >
          Permisos de trabajo
        </button>
      </div>

      {tab === 'trabajo' && (
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border-color)',
          }}
        >
          <ShieldCheck size={36} className="mx-auto mb-3 text-gray-300" />
          <p
            className="text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
          >
            Próximamente OPS-025
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Los permisos internos de trabajo se gestionarán aquí en una próxima entrega.
          </p>
        </div>
      )}

      {tab === 'externos' && (
        <>
          {/* Setup empty state */}
          {isUnconfigured && (
            <div
              className="mb-6 p-5 rounded-xl"
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <Settings size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />
                <div className="flex-1">
                  <p
                    className="text-[var(--text-primary)] mb-1"
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    Aún no hay tipos de permiso configurados
                  </p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Comienza configurando los tipos de permiso desde Configuración o aplicando el
                    pack recomendado para Chile.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={seedDefaults}
                  disabled={seeding}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full text-white disabled:opacity-50"
                  style={{
                    background: '#2563eb',
                    fontFamily: 'var(--font-outfit), sans-serif',
                    fontWeight: 500,
                  }}
                >
                  <Sparkles size={12} />
                  {seeding ? 'Aplicando...' : 'Cargar tipos chilenos por defecto'}
                </button>
                <Link
                  href="/operaciones/configuracion?tab=permisos"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full border border-gray-300 hover:bg-gray-50"
                  style={{
                    fontFamily: 'var(--font-outfit), sans-serif',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                  }}
                >
                  <Settings size={12} /> Ir a configuración <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}

          {/* KPIs */}
          {compliance && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard
                label="Cumplimiento"
                value={`${compliance.compliancePercentage}%`}
                valueColor={compliancePctColor}
                icon={<ShieldCheck size={16} />}
              />
              <KpiCard
                label="Vigentes"
                value={String(compliance.valid)}
                valueColor="#15803d"
                icon={<FileText size={16} />}
              />
              <KpiCard
                label="Por vencer"
                value={String(compliance.expiringSoon)}
                valueColor="#a16207"
                icon={<AlertCircle size={16} />}
              />
              <KpiCard
                label="Vencidos"
                value={String(compliance.expired)}
                valueColor="#b91c1c"
                icon={<AlertCircle size={16} />}
              />
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
                placeholder="Buscar por número, autoridad, activo, ubicación..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="cp-input pl-9"
              />
            </div>
            <select
              value={permitTypeId}
              onChange={(e) => setPermitTypeId(e.target.value)}
              className="cp-input"
              style={{ width: 'auto', minWidth: 200 }}
            >
              <option value="">Todos los tipos</option>
              {permitTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="cp-input"
              style={{ width: 'auto', minWidth: 160 }}
            >
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={targetTypeFilter}
              onChange={(e) => setTargetTypeFilter(e.target.value as '' | 'asset' | 'location')}
              className="cp-input"
              style={{ width: 'auto', minWidth: 160 }}
            >
              <option value="">Activos y ubicaciones</option>
              <option value="asset">Solo activos</option>
              <option value="location">Solo ubicaciones</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PermitStatus | '')}
              className="cp-input"
              style={{ width: 'auto', minWidth: 180 }}
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.value || 'all'} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {(search || permitTypeId || categoryFilter || statusFilter || targetTypeFilter) && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setPermitTypeId('');
                  setCategoryFilter('');
                  setStatusFilter('');
                  setTargetTypeFilter('');
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
            {loading && !data ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded"
                    style={{ height: 60, background: 'rgba(0,0,0,0.04)' }}
                  />
                ))}
              </div>
            ) : data && filteredRows.length === 0 ? (
              <div className="p-12 text-center">
                <FileText size={36} className="mx-auto text-gray-300 mb-3" />
                <p
                  className="text-[var(--text-secondary)]"
                  style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                >
                  No hay permisos que coincidan.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className="border-b border-[var(--border-color)]"
                      style={{ background: 'var(--input-bg)' }}
                    >
                      <Th>Tipo</Th>
                      <Th>N° permiso</Th>
                      <Th>Autoridad</Th>
                      <Th>Asociado a</Th>
                      <Th>Emisión</Th>
                      <Th>Vencimiento</Th>
                      <Th>Estado</Th>
                      <Th align="right" style={{ width: 110 }}>
                        Acciones
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <PermitRowView
                        key={row.id}
                        row={row}
                        onDownload={() => triggerDownload(row)}
                      />
                    ))}
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
                  Página {data.page} de {data.totalPages} · {data.total} permisos
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--input-bg)] transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--input-bg)] transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {uploadOpen && (
        <PermitUploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setToast({ message: 'Permiso cargado exitosamente.', type: 'success' });
            load();
          }}
        />
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
}: {
  label: string;
  value: string;
  valueColor?: string;
  icon: React.ReactNode;
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

function PermitRowView({ row, onDownload }: { row: PermitRow; onDownload: () => void }) {
  const isVehicle = row.asset?.assetType?.category === 'VEHICLE';
  return (
    <tr className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--input-bg)] transition">
      <td style={{ padding: '8px 16px' }}>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: row.permitType.color || '#475569',
              color: '#fff',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 9,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {row.permitType.code.slice(0, 4)}
          </span>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              {row.permitType.name}
            </div>
            <div
              className="text-[var(--text-muted)] mt-0.5"
              style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11 }}
            >
              {CATEGORY_LABELS[row.permitType.category] ?? row.permitType.category}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {row.permitNumber}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}>
          {row.issuingAuthority ?? row.permitType.issuingAuthority ?? '—'}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }}>
        {row.asset ? (
          <Link
            href={isVehicle ? `/operaciones/vehiculos` : `/operaciones/equipos/${row.asset.id}`}
            className="hover:underline"
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {row.asset.code}
          </Link>
        ) : row.location ? (
          <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}>
            📍 {row.location.name}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">—</span>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 12 }}>
          {row.issueDate ? formatDate(row.issueDate) : '—'}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }}>
        {row.expirationDate ? (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 12,
              color:
                row.derivedStatus === 'VENCIDO'
                  ? '#b91c1c'
                  : row.derivedStatus === 'POR_VENCER'
                    ? '#a16207'
                    : 'var(--text-primary)',
            }}
          >
            {formatDate(row.expirationDate)}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Sin vencimiento</span>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <DocumentStatusBadge status={row.derivedStatus} />
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
        <button
          onClick={onDownload}
          title="Descargar"
          className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
        >
          <Download size={13} />
        </button>
      </td>
    </tr>
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
    `}</style>
  );
}
