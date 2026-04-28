'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Layers,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { Toast } from '../../../../components/shared/Toast';
import {
  DocumentStatusBadge,
  type DerivedDocumentStatus,
} from '../../../../components/operations/DocumentStatusBadge';
import { DocumentUploadModal } from '../../../../components/operations/DocumentUploadModal';
import { DocumentPreviewModal } from '../../../../components/operations/DocumentPreviewModal';
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
  /* statusReason carries the rejection text on REJECTED docs and the archive
     reason on ARCHIVED ones. We render it inline for REJECTED rows so the
     uploader can fix and resubmit without opening the detail page. */
  statusReason?: string | null;
  uploadedBy: string;
  rejectedAt?: string | null;
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
  /* OPS-019/020 — alert + blocking summary so the page renders the
     "Activos bloqueados" banner without an extra request. */
  activeAlertsCount?: number;
  criticalAlertsCount?: number;
  blockedAssetsCount?: number;
  assetsAtRiskCount?: number;
}

interface BlockedAssetRow {
  id: string;
  code: string;
  name: string;
  status: string;
  statusReason: string | null;
  blockedSince: string | null;
  assetType?: { id: string; name: string; category: string } | null;
  blockingDocumentTypes: Array<{ id: string; name: string; code: string }>;
  lastChangeType: 'AUTO_BLOCK' | 'MANUAL' | string;
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
  const { user } = useAuth();
  const userId = user?.id ?? null;
  /* Active company role drives whether to show inline approve/reject buttons
     in the table. ADMIN/MANAGER can act; everyone else sees only resubmit on
     their own rejected uploads. */
  const activeCompanyId = apiClient.getCompanyId();
  const userRole = user?.companies.find((c) => c.companyId === activeCompanyId)?.role ?? null;
  const canReview = userRole === 'ADMIN' || userRole === 'MANAGER' || userRole === 'SUPER_ADMIN';
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
  /* OPS-016 — default OFF: REPLACED versions stay hidden so users see only
     current ones. Toggle in the filters bar opts them back in. */
  const [includeReplaced, setIncludeReplaced] = useState(false);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<DocumentRow> | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResponse | null>(null);
  const [blockedAssets, setBlockedAssets] = useState<BlockedAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [archiveDoc, setArchiveDoc] = useState<DocumentRow | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<DocumentRow | null>(null);

  /* Pending-review banner state. We poll the count alongside the list and
     persist a per-user dismissal in localStorage so it doesn't reappear after
     a refresh. */
  const [pendingCount, setPendingCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  /* Inline workflow modals shared across status. confirmApprove handles the
     PENDING_REVIEW → APPROVED jump and rejectInline handles the REJECTED
     jump (with reason). */
  const [confirmApprove, setConfirmApprove] = useState<DocumentRow | null>(null);
  const [rejectInline, setRejectInline] = useState<DocumentRow | null>(null);
  const [rejectInlineReason, setRejectInlineReason] = useState('');

  /* Debounce search input → search to avoid hitting the API on every keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* Reset to page 1 when filters change. */
  useEffect(() => {
    setPage(1);
  }, [
    search,
    assetId,
    documentTypeId,
    statusFilter,
    expirationFrom,
    expirationTo,
    quickFilter,
    includeReplaced,
  ]);

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
    /* OPS-016 — only opt in when the user toggles the filter; default
       behavior on the API is to hide REPLACED. */
    if (includeReplaced) params.set('includeReplaced', 'true');
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
    includeReplaced,
    page,
  ]);

  const load = useCallback(async () => {
    setIsLoading(true);
    /* Blocked-assets list is independent of the documents query so we
       fire it in parallel and tolerate a 403 silently for read-only
       roles that can still see the central docs page. */
    apiClient
      .get<BlockedAssetRow[]>('/api/operations/assets/blocked')
      .then((rows) => setBlockedAssets(rows))
      .catch(() => setBlockedAssets([]));
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
    /* Pending-review count is gated to ADMIN/MANAGER — non-reviewers get a
       403 here and we silently drop to 0, matching the spec where the banner
       and badge only surface for users who can act on the queue. */
    apiClient
      .get<{ count: number }>('/api/operations/documents/pending-review/count')
      .then((res) => setPendingCount(res.count))
      .catch(() => setPendingCount(0));
  }, [buildParams]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    load();
  }, [load]);

  /* Read the persistent dismissal flag once on mount. We key it per company
     so dismissing the banner in one tenant doesn't affect another. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const companyId = apiClient.getCompanyId();
    if (!companyId) return;
    const dismissed = localStorage.getItem(`docs-pending-banner-dismissed:${companyId}`);
    if (dismissed === '1') setBannerDismissed(true);
  }, []);

  const dismissPendingBanner = () => {
    setBannerDismissed(true);
    if (typeof window !== 'undefined') {
      const companyId = apiClient.getCompanyId();
      if (companyId) {
        localStorage.setItem(`docs-pending-banner-dismissed:${companyId}`, '1');
      }
    }
  };

  /* Authenticated download — apiClient adds the company header. We can't link
     directly to the API URL because cookie-only auth doesn't carry on a raw
     <a download> click for some browsers. */
  const triggerDownload = async (doc: DocumentRow) => {
    try {
      const blob = await apiClient.fetchBlob(`/api/operations/documents/${doc.id}/file?download=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
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

  const performArchive = async () => {
    if (!archiveDoc) return;
    if (!archiveReason.trim()) {
      setToast({ message: 'Indica el motivo de archivado.', type: 'error' });
      return;
    }
    try {
      await apiClient.post(`/api/operations/documents/${archiveDoc.id}/archive`, {
        reason: archiveReason.trim(),
      });
      setToast({ message: 'Documento archivado.', type: 'success' });
      setArchiveDoc(null);
      setArchiveReason('');
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo archivar el documento.',
        type: 'error',
      });
    }
  };

  const performApproveInline = async () => {
    if (!confirmApprove) return;
    try {
      await apiClient.post(`/api/operations/documents/${confirmApprove.id}/approve`);
      setToast({ message: 'Documento aprobado', type: 'success' });
      setConfirmApprove(null);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo aprobar el documento.',
        type: 'error',
      });
      setConfirmApprove(null);
    }
  };

  const performRejectInline = async () => {
    if (!rejectInline) return;
    if (rejectInlineReason.trim().length < 10) {
      setToast({ message: 'El motivo debe tener al menos 10 caracteres.', type: 'error' });
      return;
    }
    try {
      await apiClient.post(`/api/operations/documents/${rejectInline.id}/reject`, {
        reason: rejectInlineReason.trim(),
      });
      setToast({ message: 'Documento rechazado', type: 'success' });
      setRejectInline(null);
      setRejectInlineReason('');
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo rechazar el documento.',
        type: 'error',
      });
    }
  };

  const performResubmit = async (doc: DocumentRow) => {
    try {
      await apiClient.post(`/api/operations/documents/${doc.id}/resubmit`);
      setToast({ message: 'Documento reenviado a revisión', type: 'success' });
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo reenviar el documento.',
        type: 'error',
      });
    }
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    try {
      await apiClient.delete(`/api/operations/documents/${confirmDelete.id}`);
      setToast({ message: 'Documento eliminado.', type: 'success' });
      setConfirmDelete(null);
      load();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo eliminar el documento.',
        type: 'error',
      });
      setConfirmDelete(null);
    }
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setAssetId('');
    setDocumentTypeId('');
    setStatusFilter('');
    setExpirationFrom('');
    setExpirationTo('');
    setQuickFilter('');
    setIncludeReplaced(false);
  };

  const hasFilters = !!(
    search ||
    assetId ||
    documentTypeId ||
    statusFilter ||
    expirationFrom ||
    expirationTo ||
    quickFilter ||
    includeReplaced
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
            onClick={() => setUploadOpen(true)}
            disabled={isUnconfigured}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
            title={
              isUnconfigured
                ? 'Configura tipos de activo y de documento antes de cargar.'
                : 'Cargar nuevo documento'
            }
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

      {/* Pending-review banner — appears for ADMIN/MANAGER when there are
          documents waiting for approval. Dismissal is sticky per company. */}
      {pendingCount > 0 && !bannerDismissed && (
        <div
          className="mb-4 p-3 rounded-xl flex items-center gap-3"
          style={{
            background: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
          }}
        >
          <FileText size={18} style={{ color: '#1d4ed8', flexShrink: 0 }} />
          <p
            className="flex-1 text-sm text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
          >
            Tienes <strong>{pendingCount}</strong>{' '}
            {pendingCount === 1
              ? 'documento pendiente de revisión'
              : 'documentos pendientes de revisión'}
            .
          </p>
          <Link
            href="/operaciones/documentos/pendientes"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full text-white"
            style={{
              background: '#2563eb',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            Ver pendientes <ArrowRight size={12} />
          </Link>
          <button
            onClick={dismissPendingBanner}
            className="p-1 rounded hover:bg-blue-100 text-[#1d4ed8]"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
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

      {/* OPS-020 — blocked assets card list. Only renders when there's
          at least one row so the page stays clean otherwise. */}
      {blockedAssets.length > 0 && (
        <div
          className="mb-6 p-4 rounded-xl"
          style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-[var(--text-primary)] flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 15,
                color: '#b91c1c',
              }}
            >
              <AlertCircle size={16} /> Activos bloqueados ({blockedAssets.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {blockedAssets.slice(0, 6).map((b) => {
              const isVehicle = b.assetType?.category === 'VEHICLE';
              const href = isVehicle ? `/operaciones/vehiculos` : `/operaciones/equipos/${b.id}`;
              return (
                <Link
                  key={b.id}
                  href={href}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--bg-card)] transition"
                  style={{
                    border: '1px solid rgba(239, 68, 68, 0.18)',
                    textDecoration: 'none',
                    background: 'var(--bg-card)',
                  }}
                >
                  {isVehicle ? (
                    <Settings size={16} style={{ color: '#b91c1c', marginTop: 2 }} />
                  ) : (
                    <Settings size={16} style={{ color: '#b91c1c', marginTop: 2 }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {b.code}
                      </span>
                      <span
                        className="text-[var(--text-secondary)] truncate"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontSize: 13,
                        }}
                      >
                        {b.name}
                      </span>
                    </div>
                    {b.blockingDocumentTypes.length > 0 ? (
                      <p
                        className="text-[var(--text-muted)] mt-1 truncate"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontSize: 12,
                        }}
                      >
                        Documentos: {b.blockingDocumentTypes.map((d) => d.code).join(', ')}
                      </p>
                    ) : b.statusReason ? (
                      <p
                        className="text-[var(--text-muted)] mt-1 truncate"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontSize: 12,
                        }}
                      >
                        {b.statusReason}
                      </p>
                    ) : null}
                    {b.blockedSince && (
                      <p
                        className="text-[var(--text-muted)] mt-0.5"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono), monospace',
                          fontSize: 11,
                        }}
                      >
                        Bloqueado {formatDate(b.blockedSince)}
                      </p>
                    )}
                  </div>
                  <ArrowRight size={14} className="text-[var(--text-muted)] mt-1" />
                </Link>
              );
            })}
          </div>
          {blockedAssets.length > 6 && (
            <p
              className="text-xs text-[var(--text-muted)] mt-2"
              style={{ fontFamily: 'var(--font-outfit), sans-serif' }}
            >
              + {blockedAssets.length - 6} activos bloqueados más.
            </p>
          )}
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
        {/* OPS-016 — show/hide REPLACED rows. Default OFF so the list
            naturally surfaces only current versions. */}
        <label
          className="inline-flex items-center gap-2 select-none cursor-pointer"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: 13,
            color: 'var(--text-secondary)',
            paddingLeft: 4,
          }}
          title="Incluir documentos reemplazados en el listado"
        >
          <input
            type="checkbox"
            checked={includeReplaced}
            onChange={(e) => setIncludeReplaced(e.target.checked)}
            style={{ accentColor: '#2563eb' }}
          />
          Mostrar documentos reemplazados
        </label>
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
                    <DocumentRowView
                      key={d.id}
                      doc={d}
                      currentUserId={userId}
                      canReview={canReview}
                      onPreview={() => setPreviewDoc(d)}
                      onDownload={() => triggerDownload(d)}
                      onArchive={() => {
                        setArchiveReason('');
                        setArchiveDoc(d);
                      }}
                      onDelete={() => setConfirmDelete(d)}
                      onApprove={() => setConfirmApprove(d)}
                      onReject={() => {
                        setRejectInlineReason('');
                        setRejectInline(d);
                      }}
                      onResubmit={() => performResubmit(d)}
                    />
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

      {uploadOpen && (
        <DocumentUploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setToast({ message: 'Documento cargado exitosamente', type: 'success' });
            load();
          }}
        />
      )}

      {previewDoc && (
        <DocumentPreviewModal
          documentId={previewDoc.id}
          fileName={previewDoc.fileName}
          mimeType={previewDoc.mimeType}
          documentTypeName={previewDoc.documentType.name}
          assetCode={previewDoc.asset.code}
          assetName={previewDoc.asset.name}
          derivedStatus={previewDoc.derivedStatus}
          version={previewDoc.version}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {archiveDoc && (
        <ConfirmModal
          title="Archivar documento"
          confirmLabel="Archivar"
          confirmTone="warning"
          onCancel={() => setArchiveDoc(null)}
          onConfirm={performArchive}
        >
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            ¿Confirmas archivar el documento{' '}
            <strong className="text-[var(--text-primary)]">{archiveDoc.documentType.name}</strong>{' '}
            de{' '}
            <strong style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              {archiveDoc.asset.code}
            </strong>
            ? Quedará oculto de las listas pero conservará su historial.
          </p>
          <label
            className="block mb-1.5 text-[var(--text-secondary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
          >
            Motivo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Explica por qué archivas este documento..."
            className="cp-input"
          />
        </ConfirmModal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Eliminar documento"
          confirmLabel="Eliminar"
          confirmTone="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            ¿Confirmas eliminar el borrador{' '}
            <strong className="text-[var(--text-primary)]">{confirmDelete.fileName}</strong>? La
            acción es reversible (soft delete) — pero queda fuera de las listas activas.
          </p>
        </ConfirmModal>
      )}

      {confirmApprove && (
        <ConfirmModal
          title="Aprobar documento"
          confirmLabel="Aprobar"
          confirmTone="warning"
          onCancel={() => setConfirmApprove(null)}
          onConfirm={performApproveInline}
        >
          <p className="text-sm text-[var(--text-secondary)]">
            ¿Confirmas aprobar{' '}
            <strong className="text-[var(--text-primary)]">
              {confirmApprove.documentType.name}
            </strong>{' '}
            de{' '}
            <strong style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              {confirmApprove.asset.code}
            </strong>
            ? Pasará a contar como vigente para el cumplimiento.
          </p>
        </ConfirmModal>
      )}

      {rejectInline && (
        <ConfirmModal
          title="Rechazar documento"
          confirmLabel="Confirmar rechazo"
          confirmTone="danger"
          onCancel={() => setRejectInline(null)}
          onConfirm={performRejectInline}
        >
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Rechazar{' '}
            <strong className="text-[var(--text-primary)]">{rejectInline.documentType.name}</strong>{' '}
            de{' '}
            <strong style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
              {rejectInline.asset.code}
            </strong>
            . El uploader verá el motivo y podrá corregir y reenviar.
          </p>
          <label
            className="block mb-1.5 text-[var(--text-secondary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500, fontSize: 13 }}
          >
            Motivo del rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={rejectInlineReason}
            onChange={(e) => setRejectInlineReason(e.target.value)}
            rows={4}
            minLength={10}
            maxLength={2000}
            placeholder="Mínimo 10 caracteres..."
            className="cp-input"
          />
        </ConfirmModal>
      )}
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

function DocumentRowView({
  doc,
  currentUserId,
  canReview,
  onPreview,
  onDownload,
  onArchive,
  onDelete,
  onApprove,
  onReject,
  onResubmit,
}: {
  doc: DocumentRow;
  currentUserId: string | null;
  canReview: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResubmit: () => void;
}) {
  const isOwnUpload = currentUserId !== null && doc.uploadedBy === currentUserId;
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
        {/* Rejection reason inline. Truncated to one line; the full text
            lives in the preview modal once OPS-016 ships preview metadata. */}
        {doc.status === 'REJECTED' && doc.statusReason && (
          <div
            className="mt-1 text-[#b91c1c] truncate max-w-[260px]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: 11,
              lineHeight: 1.3,
            }}
            title={doc.statusReason}
          >
            🔴 {doc.statusReason}
          </div>
        )}
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
        <ActionButton icon={<Eye size={14} />} title="Vista previa" onClick={onPreview} />
        <ActionButton icon={<Download size={14} />} title="Descargar" onClick={onDownload} />
        {/* Workflow actions: PENDING_REVIEW gets approve/reject (reviewers
            only, blocked on self-uploads). REJECTED gets resubmit for the
            original uploader. APPROVED can be archived; DRAFT can be deleted. */}
        {doc.status === 'PENDING_REVIEW' && canReview && !isOwnUpload && (
          <>
            <ActionButton
              icon={<Check size={14} />}
              title="Aprobar"
              onClick={onApprove}
              tone="success"
            />
            <ActionButton
              icon={<XCircle size={14} />}
              title="Rechazar"
              onClick={onReject}
              tone="danger"
            />
          </>
        )}
        {doc.status === 'REJECTED' && isOwnUpload && (
          <ActionButton
            icon={<Send size={14} />}
            title="Reenviar a revisión"
            onClick={onResubmit}
          />
        )}
        {doc.status === 'APPROVED' && (
          <ActionButton icon={<Archive size={14} />} title="Archivar" onClick={onArchive} />
        )}
        {doc.status === 'DRAFT' && (
          <ActionButton
            icon={<Trash2 size={14} />}
            title="Eliminar borrador"
            onClick={onDelete}
            tone="danger"
          />
        )}
      </td>
    </tr>
  );
}

function ActionButton({
  icon,
  title,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  tone?: 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600 hover:bg-red-50'
      : tone === 'success'
        ? 'text-green-700 hover:bg-green-50'
        : 'text-[var(--text-secondary)] hover:bg-gray-100';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-md ml-1 first:ml-0 transition ${toneClass}`}
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
          Usa el botón "Cargar documento" para empezar a controlar la documentación.
        </p>
      )}
    </div>
  );
}

/* Generic two-button confirmation modal used for archive (with reason
   textarea) and delete (with message). Children render between the title
   and the action buttons. */
function ConfirmModal({
  title,
  confirmLabel,
  confirmTone,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  confirmTone: 'danger' | 'warning';
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const confirmBg = confirmTone === 'danger' ? '#DC2626' : '#D97706';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3
            className="text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            {title}
          </h3>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white rounded-full"
            style={{
              background: confirmBg,
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
