'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Layers,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../components/operations/DocumentStatusBadge';
import { formatDate } from '../../../../lib/formatters';

type RecordStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';

interface DocumentRow {
  id: string;
  assetId: string;
  documentTypeId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  issueDate?: string | null;
  expirationDate?: string | null;
  status: RecordStatus;
  version: number;
  derivedStatus: DerivedDocumentStatus;
  createdAt: string;
  asset: {
    id: string;
    code: string;
    name: string;
    assetType?: { id: string; name: string; category: string; color?: string | null } | null;
  };
  documentType: {
    id: string;
    name: string;
    code: string;
    category: string;
    criticality: string;
    blocksOperation: boolean;
    alertDaysBefore: number;
    hasExpiration: boolean;
    defaultValidityDays?: number | null;
    color?: string | null;
  };
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ComplianceResponse {
  totalAssets: number;
  assetsWithFullCompliance: number;
  assetsWithIssues: number;
  totalRequiredDocuments: number;
  uploaded: number;
  missing: number;
  expired: number;
  expiringSoon: number;
  valid: number;
  compliancePercentage: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
}
interface DocumentTypeOption {
  id: string;
  name: string;
  code: string;
  category: string;
}

type StatusFilter =
  | ''
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REPLACED'
  | 'ARCHIVED';

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'VIGENTE', label: 'Vigente' },
  { value: 'POR_VENCER', label: 'Por vencer' },
  { value: 'VENCIDO', label: 'Vencido' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'PENDING_REVIEW', label: 'Pendiente de revisión' },
  { value: 'APPROVED', label: 'Aprobado' },
  { value: 'REJECTED', label: 'Rechazado' },
  { value: 'REPLACED', label: 'Reemplazado' },
  { value: 'ARCHIVED', label: 'Archivado' },
];

const DOC_CATEGORY_LABELS: Record<string, string> = {
  LEGAL: 'Legal',
  SAFETY: 'Seguridad',
  OPERATIONAL: 'Operacional',
  FINANCIAL: 'Financiero',
  TECHNICAL: 'Técnico',
  ADMINISTRATIVE: 'Administrativo',
};

const PAGE_SIZE = 20;

export default function DocumentosPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [assetId, setAssetId] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [expirationFrom, setExpirationFrom] = useState('');
  const [expirationTo, setExpirationTo] = useState('');
  /* Quick chips: 'expiring30' | 'expired' | 'missing' — drive both the API
     params and the chip's pressed state. 'missing' has no DB representation
     (no record exists), so it surfaces an info banner. */
  const [quickFilter, setQuickFilter] = useState<'' | 'expiring30' | 'expired' | 'missing'>('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<DocumentRow> | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  /* Debounce search input → search to avoid hitting the API on every keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* Reset to page 1 when filters change. */
  useEffect(() => {
    setPage(1);
  }, [search, assetId, documentTypeId, statusFilter, expirationFrom, expirationTo, quickFilter]);

  const loadCatalogs = useCallback(async () => {
    try {
      const [a, dt] = await Promise.all([
        apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100'),
        apiClient.get<DocumentTypeOption[]>('/api/operations/document-types'),
      ]);
      setAssets(a.data.map((x) => ({ id: x.id, code: x.code, name: x.name })));
      setDocumentTypes(dt);
    } catch {
      /* Selectors will be empty — list still renders. */
    } finally {
      setCatalogsLoaded(true);
    }
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (assetId) params.set('assetId', assetId);
    if (documentTypeId) params.set('documentTypeId', documentTypeId);
    /* Derived statuses (VIGENTE/POR_VENCER/VENCIDO) aren't real DB columns —
       they translate to expiringInDays / isExpired / status=APPROVED. */
    if (statusFilter === 'VIGENTE') {
      params.set('status', 'APPROVED');
    } else if (statusFilter === 'POR_VENCER') {
      params.set('expiringInDays', '30');
    } else if (statusFilter === 'VENCIDO') {
      params.set('isExpired', 'true');
    } else if (statusFilter) {
      params.set('status', statusFilter);
    }
    if (expirationFrom) params.set('expirationFrom', expirationFrom);
    if (expirationTo) params.set('expirationTo', expirationTo);
    if (quickFilter === 'expiring30') params.set('expiringInDays', '30');
    if (quickFilter === 'expired') params.set('isExpired', 'true');
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    return params;
  }, [
    search,
    assetId,
    documentTypeId,
    statusFilter,
    expirationFrom,
    expirationTo,
    quickFilter,
    page,
  ]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docs, comp] = await Promise.all([
        apiClient.get<Paginated<DocumentRow>>(
          `/api/operations/documents?${buildParams().toString()}`,
        ),
        apiClient.get<ComplianceResponse>('/api/operations/documents/compliance'),
      ]);
      setData(docs);
      setCompliance(comp);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Error cargando documentos',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    load();
  }, [load]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setAssetId('');
    setDocumentTypeId('');
    setStatusFilter('');
    setExpirationFrom('');
    setExpirationTo('');
    setQuickFilter('');
  };

  const hasFilters = !!(
    search ||
    assetId ||
    documentTypeId ||
    statusFilter ||
    expirationFrom ||
    expirationTo ||
    quickFilter
  );

  /* Setup state — show actionable empty state when nothing is configured yet. */
  const isUnconfigured = catalogsLoaded && (assets.length === 0 || documentTypes.length === 0);

  const compliancePctColor = useMemo(() => {
    const pct = compliance?.compliancePercentage ?? 0;
    if (pct >= 90) return '#15803d';
    if (pct >= 70) return '#a16207';
    return '#b91c1c';
  }, [compliance?.compliancePercentage]);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-6">
        <div className="ops-breadcrumb">Operaciones / Documentos</div>
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
              Control Documental
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
              Visibilidad de todos los documentos de tus activos
            </p>
          </div>
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
            title="Disponible próximamente (OPS-014)"
          >
            <Upload size={16} /> Cargar documento
          </button>
        </div>
      </div>

      {/* Setup empty state — shown when no assets or no doc types exist */}
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
                Configura tu módulo primero
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Para cargar documentos necesitas tener al menos tipos de activo, tipos de documento
                y un activo creado.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/operaciones/configuracion?tab=tipos"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full text-white"
              style={{
                background: '#2563eb',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Layers size={12} /> Crear tipos de activo <ArrowRight size={12} />
            </Link>
            <Link
              href="/operaciones/configuracion?tab=documentos"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full text-white"
              style={{
                background: '#2563eb',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <FileText size={12} /> Crear tipos de documento <ArrowRight size={12} />
            </Link>
            <Link
              href="/operaciones/equipos"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-full text-white"
              style={{
                background: '#2563eb',
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
              }}
            >
              <Wrench size={12} /> Crear primer activo <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {compliance && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KpiCard
              label="Cumplimiento global"
              value={`${compliance.compliancePercentage}%`}
              valueColor={compliancePctColor}
              subtitle={`${compliance.compliancePercentage}% de documentos al día`}
              icon={<ShieldCheck size={16} />}
            />
            <KpiCard
              label="Documentos al día"
              value={String(compliance.valid + compliance.expiringSoon)}
              subtitle={`de ${compliance.totalRequiredDocuments} requeridos`}
              icon={<FileText size={16} />}
            />
            <KpiCard
              label="Por vencer"
              value={String(compliance.expiringSoon)}
              valueColor="#a16207"
              subtitle="Próximos 30 días"
              icon={<AlertCircle size={16} />}
            />
            <KpiCard
              label="Vencidos o faltantes"
              value={String(compliance.expired + compliance.missing)}
              valueColor="#b91c1c"
              subtitle="Requieren acción inmediata"
              icon={<AlertCircle size={16} />}
            />
          </div>

          {/* Severity breakdown */}
          <div className="mb-6 flex flex-wrap gap-3 items-center text-xs text-[var(--text-secondary)]">
            <span
              style={{
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Brechas por severidad:
            </span>
            <SeverityChip count={compliance.bySeverity.critical} label="críticos" tone="critical" />
            <SeverityChip count={compliance.bySeverity.high} label="altos" tone="high" />
            <SeverityChip count={compliance.bySeverity.medium} label="medios" tone="medium" />
            <SeverityChip count={compliance.bySeverity.low} label="bajos" tone="low" />
          </div>
        </>
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
            placeholder="Buscar por nombre, activo, tipo..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="cp-input pl-9"
          />
        </div>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Todos los activos</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
        <select
          value={documentTypeId}
          onChange={(e) => setDocumentTypeId(e.target.value)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Todos los tipos</option>
          {documentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="cp-input"
          style={{ width: 'auto', minWidth: 180 }}
        >
          {STATUS_FILTER_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={expirationFrom}
          onChange={(e) => setExpirationFrom(e.target.value)}
          className="cp-input"
          style={{ width: 160 }}
          title="Vencimiento desde"
        />
        <input
          type="date"
          value={expirationTo}
          onChange={(e) => setExpirationTo(e.target.value)}
          className="cp-input"
          style={{ width: 160 }}
          title="Vencimiento hasta"
        />
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 rounded-lg"
            title="Limpiar filtros"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <QuickChip
          label="Por vencer (30 días)"
          active={quickFilter === 'expiring30'}
          onToggle={() => setQuickFilter(quickFilter === 'expiring30' ? '' : 'expiring30')}
          tone="warning"
          count={compliance?.expiringSoon}
        />
        <QuickChip
          label="Vencidos"
          active={quickFilter === 'expired'}
          onToggle={() => setQuickFilter(quickFilter === 'expired' ? '' : 'expired')}
          tone="danger"
          count={compliance?.expired}
        />
        <QuickChip
          label="Faltantes"
          active={quickFilter === 'missing'}
          onToggle={() => setQuickFilter(quickFilter === 'missing' ? '' : 'missing')}
          tone="danger"
          count={compliance?.missing}
        />
      </div>

      {quickFilter === 'missing' && (
        <div
          className="mb-3 p-3 rounded-lg flex items-start gap-2 text-sm"
          style={{
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.2)',
            color: '#a16207',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Los documentos faltantes no aparecen aquí porque aún no se ha cargado ningún archivo.
            Revisa la ficha de cada activo para ver qué documentos exige su tipo.
          </span>
        </div>
      )}

      {/* List */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-3 animate-pulse flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-48" />
                  <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--input-bg)]">
                    <Th>Activo</Th>
                    <Th>Tipo de documento</Th>
                    <Th>Archivo</Th>
                    <Th>Emisión</Th>
                    <Th>Vencimiento</Th>
                    <Th>Estado</Th>
                    <Th>Versión</Th>
                    <Th align="right" style={{ width: 130 }}>
                      Acciones
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((d) => (
                    <DocumentRowView key={d.id} doc={d} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-secondary)]">
                {data.total} documento{data.total === 1 ? '' : 's'}
                {data.totalPages > 1 && ` · Página ${data.page} de ${data.totalPages}`}
              </p>
              {data.totalPages > 1 && (
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
              )}
            </div>
          </>
        )}
      </div>

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
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }
        .cp-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------------- */

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

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  valueColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  valueColor?: string;
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

function SeverityChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: 'critical' | 'high' | 'medium' | 'low';
}) {
  const meta: Record<typeof tone, { bg: string; fg: string }> = {
    critical: { bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
    high: { bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
    medium: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },
    low: { bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
  };
  const m = meta[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{
        background: m.bg,
        color: m.fg,
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {count}{' '}
      <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}>{label}</span>
    </span>
  );
}

function QuickChip({
  label,
  active,
  onToggle,
  tone,
  count,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  tone: 'warning' | 'danger';
  count?: number;
}) {
  const meta: Record<typeof tone, { bg: string; fg: string; activeBg: string }> = {
    warning: {
      bg: 'rgba(234, 179, 8, 0.08)',
      fg: '#a16207',
      activeBg: 'rgba(234, 179, 8, 0.18)',
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.08)',
      fg: '#b91c1c',
      activeBg: 'rgba(239, 68, 68, 0.18)',
    },
  };
  const m = meta[tone];
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition"
      style={{
        background: active ? m.activeBg : m.bg,
        color: m.fg,
        border: active ? `1px solid ${m.fg}` : '1px solid transparent',
        fontFamily: 'var(--font-outfit), sans-serif',
        fontWeight: 500,
        fontSize: 13,
      }}
    >
      {label}
      {count !== undefined && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(0,0,0,0.06)',
            padding: '0 6px',
            borderRadius: 999,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function DocumentRowView({ doc }: { doc: DocumentRow }) {
  /* Hint for "(en X días)" / "(hace X días)" next to the expiration date.
     Computed once per render — these dates change slowly enough that we don't
     need a memo. */
  let dateHint: { text: string; tone: 'warning' | 'danger' | null } = { text: '', tone: null };
  if (doc.expirationDate) {
    const exp = new Date(doc.expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exp.setHours(0, 0, 0, 0);
    const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
    if (days < 0) {
      dateHint = { text: `(hace ${Math.abs(days)} días)`, tone: 'danger' };
    } else if (days <= doc.documentType.alertDaysBefore) {
      dateHint = { text: `(en ${days} días)`, tone: 'warning' };
    }
  }

  const sizeKb = (doc.fileSize / 1024).toFixed(1);

  return (
    <tr className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--input-bg)] transition">
      <td style={{ padding: '8px 16px' }}>
        <div
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {doc.asset.code}
        </div>
        <div
          className="text-xs text-[var(--text-muted)] mt-0.5"
          style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
        >
          {doc.asset.name}
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <div
          className="text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {doc.documentType.name}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          {DOC_CATEGORY_LABELS[doc.documentType.category] ?? doc.documentType.category}
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <div
          className="text-[var(--text-primary)] truncate max-w-[220px]"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: 13,
          }}
          title={doc.fileName}
        >
          {doc.fileName}
        </div>
        <div
          className="text-[var(--text-muted)] mt-0.5"
          style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11 }}
        >
          {sizeKb} KB
        </div>
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {doc.issueDate ? formatDate(doc.issueDate) : '—'}
        </span>
      </td>
      <td style={{ padding: '8px 16px' }}>
        {doc.expirationDate ? (
          <div>
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono), monospace',
                fontSize: 12,
                color:
                  dateHint.tone === 'danger'
                    ? '#b91c1c'
                    : dateHint.tone === 'warning'
                      ? '#a16207'
                      : 'var(--text-primary)',
                fontWeight: dateHint.tone ? 600 : 500,
              }}
            >
              {formatDate(doc.expirationDate)}
            </span>
            {dateHint.text && (
              <span
                className="ml-1"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontSize: 11,
                  color: dateHint.tone === 'danger' ? '#b91c1c' : '#a16207',
                }}
              >
                {dateHint.text}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Sin vencimiento</span>
        )}
      </td>
      <td style={{ padding: '8px 16px' }}>
        <DocumentStatusBadge status={doc.derivedStatus} />
      </td>
      <td style={{ padding: '8px 16px' }}>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(100, 116, 139, 0.14)',
            color: '#475569',
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          v{doc.version}
        </span>
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'right' }}>
        <DisabledAction icon={<Eye size={14} />} title="Ver (próximamente)" />
        <DisabledAction icon={<Download size={14} />} title="Descargar (próximamente)" />
        <DisabledAction icon={<Trash2 size={14} />} title="Eliminar (próximamente)" tone="danger" />
      </td>
    </tr>
  );
}

function DisabledAction({
  icon,
  title,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: 'danger';
}) {
  return (
    <button
      disabled
      className={`p-2 rounded-md ml-1 first:ml-0 ${
        tone === 'danger' ? 'text-red-300' : 'text-[var(--text-muted)]'
      } cursor-not-allowed`}
      title={title}
    >
      {icon}
    </button>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="p-12 text-center">
      <FileText size={36} className="mx-auto text-gray-300 mb-3" />
      <p
        className="text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
      >
        {hasFilters ? 'No se encontraron documentos' : 'No hay documentos cargados aún'}
      </p>
      <p className="text-[var(--text-muted)] text-sm mt-1">
        {hasFilters
          ? 'Ajusta los filtros para ver más resultados.'
          : 'Sube tu primer documento desde la ficha de un activo.'}
      </p>
      {!hasFilters && (
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Esta funcionalidad estará disponible en próximas semanas.
        </p>
      )}
    </div>
  );
}
