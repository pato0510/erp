'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Ban,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  SearchX,
  Settings,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { Toast } from '../../../../components/shared/Toast';
import {
  AlertDetailModal,
  formatDays,
  SEVERITY_META,
  STATUS_META,
  TRIGGER_LABELS,
  type AlertInstance,
  type AlertInstanceStatus,
  type AlertSeverity,
  type AlertTriggerType,
} from '../../../../components/operations/AlertDetailModal';
import { formatDate, formatRelativeDate } from '../../../../lib/formatters';

interface AssetTypeRef {
  id?: string;
  category?: string;
}

interface AlertRow extends AlertInstance {
  asset: AlertInstance['asset'] & { assetType?: AssetTypeRef | null };
}

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AlertKpis {
  total: number;
  active: number;
  critical: number;
  unattended: number;
  resolvedToday: number;
}

const SEVERITIES_ORDER: AlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL', 'BLOCKING'];
const STATUSES_ORDER: AlertInstanceStatus[] = [
  'ACTIVE',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED',
  'ESCALATED',
];
const TRIGGERS_ORDER: AlertTriggerType[] = ['MISSING', 'EXPIRING_SOON', 'EXPIRED', 'BLOCKING'];

const VIEW_STORAGE_KEY = 'ops-alerts-view';
type ViewMode = 'list' | 'cards';

const STATUS_PRESETS: Record<string, AlertInstanceStatus[]> = {
  active: ['ACTIVE', 'ESCALATED'],
  acknowledged: ['ACKNOWLEDGED'],
  resolved: ['RESOLVED'],
  dismissed: ['DISMISSED'],
  all: [],
};

type StatusPreset = keyof typeof STATUS_PRESETS;

const STATUS_PRESET_LABELS: Record<StatusPreset, string> = {
  active: 'Activas',
  acknowledged: 'Atendidas',
  resolved: 'Resueltas',
  dismissed: 'Descartadas',
  all: 'Todas',
};

interface AssetOption {
  id: string;
  code: string;
  name: string;
}
interface DocumentTypeOption {
  id: string;
  name: string;
  code: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function AlertasPage() {
  return (
    <Suspense fallback={null}>
      <AlertasContent />
    </Suspense>
  );
}

function AlertasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const activeCompanyId = apiClient.getCompanyId();
  const userRole = user?.companies.find((c) => c.companyId === activeCompanyId)?.role ?? null;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  /* URL-driven status preset so deep-links and KPI clicks survive
     reloads. Defaults to "active". */
  const initialStatus = (searchParams.get('status') as StatusPreset) || 'active';
  const [statusPreset, setStatusPreset] = useState<StatusPreset>(
    Object.prototype.hasOwnProperty.call(STATUS_PRESETS, initialStatus) ? initialStatus : 'active',
  );

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [severities, setSeverities] = useState<AlertSeverity[]>([]);
  const [triggerTypes, setTriggerTypes] = useState<AlertTriggerType[]>([]);
  const [assetId, setAssetId] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [triggeredFrom, setTriggeredFrom] = useState('');
  const [triggeredTo, setTriggeredTo] = useState('');
  const [quickFilter, setQuickFilter] = useState<
    '' | 'critical' | '24h' | 'unattended' | 'blocking'
  >('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [view, setView] = useState<ViewMode>('list');
  const [data, setData] = useState<Paginated<AlertRow> | null>(null);
  const [kpis, setKpis] = useState<AlertKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [detailAlert, setDetailAlert] = useState<AlertRow | null>(null);
  const [resolveTarget, setResolveTarget] = useState<AlertRow | null>(null);
  const [resolveReason, setResolveReason] = useState('');
  const [dismissTarget, setDismissTarget] = useState<AlertRow | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  /* Restore saved view mode once on mount; future toggles persist
     immediately. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'list' || saved === 'cards') setView(saved);
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setView(mode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
    }
  };

  /* Sync the URL whenever the status preset flips so the page is
     bookmarkable and KPI clicks produce a shareable view. */
  const setStatusPresetSynced = useCallback(
    (next: StatusPreset) => {
      setStatusPreset(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'active') params.delete('status');
      else params.set('status', next);
      router.replace(`/operaciones/alertas${params.toString() ? `?${params.toString()}` : ''}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  /* Debounced search input → request param. 300ms keeps typing
     responsive without hammering the API. */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [
    search,
    severities,
    triggerTypes,
    assetId,
    documentTypeId,
    triggeredFrom,
    triggeredTo,
    quickFilter,
    statusPreset,
    pageSize,
  ]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    /* Quick filter wins over the manual selectors when both are set —
       it's a single-shot scope. */
    if (quickFilter === 'critical') {
      params.set('severities', 'CRITICAL,BLOCKING');
    } else if (severities.length > 0) {
      params.set('severities', severities.join(','));
    }
    if (quickFilter === 'blocking') {
      params.set('triggerTypes', 'BLOCKING');
    } else if (triggerTypes.length > 0) {
      params.set('triggerTypes', triggerTypes.join(','));
    }
    /* Status preset → array. The "all" preset omits the param so the
       backend returns every status; everything else collapses to a
       single status or [ACTIVE, ESCALATED] for "active". */
    const statuses = STATUS_PRESETS[statusPreset];
    if (statuses.length > 0) {
      params.set('statuses', statuses.join(','));
    }

    if (assetId) params.set('assetId', assetId);
    if (documentTypeId) params.set('documentTypeId', documentTypeId);
    if (triggeredFrom) params.set('triggeredFrom', triggeredFrom);
    if (triggeredTo) params.set('triggeredTo', triggeredTo);
    if (quickFilter === '24h') {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      params.set('triggeredFrom', dayAgo);
    }
    if (quickFilter === 'unattended') {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      params.set('triggeredTo', dayAgo);
      params.set('statuses', 'ACTIVE');
    }

    params.set('page', String(page));
    params.set('limit', String(pageSize));
    return params;
  }, [
    search,
    severities,
    triggerTypes,
    statusPreset,
    assetId,
    documentTypeId,
    triggeredFrom,
    triggeredTo,
    quickFilter,
    page,
    pageSize,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, k] = await Promise.all([
        apiClient.get<Paginated<AlertRow>>(
          `/api/operations/alerts/instances?${buildParams().toString()}`,
        ),
        apiClient.get<AlertKpis>('/api/operations/alerts/instances/kpis'),
      ]);
      setData(list);
      setKpis(k);
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudieron cargar las alertas.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  /* Catalogs are loaded once for the autocomplete selectors. Failures
     just leave the dropdowns empty — list still renders. */
  const loadCatalogs = useCallback(async () => {
    try {
      const [a, dt] = await Promise.all([
        apiClient.get<{ data: AssetOption[] }>('/api/operations/assets?limit=100'),
        apiClient.get<DocumentTypeOption[]>('/api/operations/document-types'),
      ]);
      setAssets(a.data);
      setDocumentTypes(dt);
    } catch {
      /* Non-critical. */
    }
  }, []);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshKpis = async () => {
    try {
      const k = await apiClient.get<AlertKpis>('/api/operations/alerts/instances/kpis');
      setKpis(k);
    } catch {
      /* Silent — load() will catch up next time. */
    }
  };

  const recalculate = async () => {
    if (recalculating || !isAdmin) return;
    setRecalculating(true);
    try {
      await apiClient.post('/api/operations/alerts/recalculate', {});
      setToast({
        message: 'Recálculo iniciado. Las alertas se generarán en segundos.',
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo iniciar el recálculo.',
        type: 'error',
      });
    } finally {
      setRecalculating(false);
    }
  };

  const optimisticUpdate = (id: string, patch: Partial<AlertRow>) => {
    setData((d) =>
      d
        ? {
            ...d,
            data: d.data.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          }
        : d,
    );
  };

  const performAcknowledge = async (id: string) => {
    try {
      await apiClient.post(`/api/operations/alerts/instances/${id}/acknowledge`);
      optimisticUpdate(id, {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date().toISOString(),
      });
      setToast({ message: 'Alerta atendida', type: 'success' });
      refreshKpis();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo atender la alerta.',
        type: 'error',
      });
    }
  };

  const performResolve = async () => {
    if (!resolveTarget) return;
    try {
      await apiClient.post(`/api/operations/alerts/instances/${resolveTarget.id}/resolve`, {
        reason: resolveReason.trim() || undefined,
      });
      optimisticUpdate(resolveTarget.id, {
        status: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
        resolvedReason: resolveReason.trim() || null,
      });
      setToast({ message: 'Alerta resuelta', type: 'success' });
      setResolveTarget(null);
      setResolveReason('');
      refreshKpis();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo resolver la alerta.',
        type: 'error',
      });
    }
  };

  const performDismiss = async () => {
    if (!dismissTarget) return;
    if (dismissReason.trim().length < 10) {
      setToast({ message: 'El motivo debe tener al menos 10 caracteres.', type: 'error' });
      return;
    }
    try {
      await apiClient.post(`/api/operations/alerts/instances/${dismissTarget.id}/dismiss`, {
        reason: dismissReason.trim(),
      });
      optimisticUpdate(dismissTarget.id, {
        status: 'DISMISSED',
        resolvedAt: new Date().toISOString(),
        resolvedReason: dismissReason.trim(),
      });
      setToast({ message: 'Alerta descartada', type: 'success' });
      setDismissTarget(null);
      setDismissReason('');
      refreshKpis();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudo descartar la alerta.',
        type: 'error',
      });
    }
  };

  const performBulkAcknowledge = async () => {
    if (bulkActing || selected.size === 0) return;
    setBulkActing(true);
    try {
      const ids = Array.from(selected);
      await apiClient.post('/api/operations/alerts/instances/bulk-acknowledge', { ids });
      ids.forEach((id) =>
        optimisticUpdate(id, {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date().toISOString(),
        }),
      );
      setSelected(new Set());
      setToast({ message: `${ids.length} alertas atendidas`, type: 'success' });
      refreshKpis();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudieron atender las alertas.',
        type: 'error',
      });
    } finally {
      setBulkActing(false);
    }
  };

  const performBulkResolve = async () => {
    if (bulkActing || selected.size === 0) return;
    setBulkActing(true);
    try {
      const ids = Array.from(selected);
      await apiClient.post('/api/operations/alerts/instances/bulk-resolve', { ids });
      ids.forEach((id) =>
        optimisticUpdate(id, {
          status: 'RESOLVED',
          resolvedAt: new Date().toISOString(),
        }),
      );
      setSelected(new Set());
      setToast({ message: `${ids.length} alertas resueltas`, type: 'success' });
      refreshKpis();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'No se pudieron resolver las alertas.',
        type: 'error',
      });
    } finally {
      setBulkActing(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSearchInput('');
    setSeverities([]);
    setTriggerTypes([]);
    setAssetId('');
    setDocumentTypeId('');
    setTriggeredFrom('');
    setTriggeredTo('');
    setQuickFilter('');
    setStatusPresetSynced('active');
  };

  const hasFilters =
    search ||
    severities.length > 0 ||
    triggerTypes.length > 0 ||
    assetId ||
    documentTypeId ||
    triggeredFrom ||
    triggeredTo ||
    quickFilter ||
    statusPreset !== 'active';

  const toggleSeverity = (s: AlertSeverity) =>
    setSeverities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const toggleTrigger = (t: AlertTriggerType) =>
    setTriggerTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const allSelectedOnPage =
    !!data && data.data.length > 0 && data.data.every((r) => selected.has(r.id));

  const toggleSelectAllOnPage = () => {
    if (!data) return;
    if (allSelectedOnPage) {
      const next = new Set(selected);
      data.data.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      data.data.forEach((r) => next.add(r.id));
      setSelected(next);
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-5">
        <div className="ops-breadcrumb">Operaciones / Alertas</div>
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
              Centro de alertas
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
              Alertas de vencimientos y cumplimiento documental
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/operaciones/configuracion?tab=alertas"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 500,
                color: 'var(--text-primary)',
                textDecoration: 'none',
              }}
            >
              <Settings size={14} /> Configurar reglas
            </Link>
            {isAdmin && (
              <button
                onClick={recalculate}
                disabled={recalculating}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white disabled:opacity-50"
                style={{
                  background: '#1C1C1E',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <RefreshCw size={14} />
                {recalculating ? 'Encolando...' : 'Recalcular ahora'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards — clicking any of them flips the status preset */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KpiCard
            label="Activas"
            value={kpis.active}
            valueColor="#b91c1c"
            icon={<Bell size={16} />}
            active={statusPreset === 'active'}
            onClick={() => setStatusPresetSynced('active')}
          />
          <KpiCard
            label="Críticas"
            value={kpis.critical}
            valueColor="#c2410c"
            icon={<AlertCircle size={16} />}
            active={quickFilter === 'critical'}
            onClick={() => setQuickFilter(quickFilter === 'critical' ? '' : 'critical')}
          />
          <KpiCard
            label="Sin atender"
            value={kpis.unattended}
            valueColor="#a16207"
            icon={<Sparkles size={16} />}
            active={quickFilter === 'unattended'}
            onClick={() => setQuickFilter(quickFilter === 'unattended' ? '' : 'unattended')}
          />
          <KpiCard
            label="Resueltas hoy"
            value={kpis.resolvedToday}
            valueColor="#15803d"
            icon={<CheckCheck size={16} />}
            active={statusPreset === 'resolved'}
            onClick={() => setStatusPresetSynced('resolved')}
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="text"
              placeholder="Buscar por activo, tipo de documento..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="cp-input pl-9"
            />
          </div>
          <select
            value={statusPreset}
            onChange={(e) => setStatusPresetSynced(e.target.value as StatusPreset)}
            className="cp-input"
            style={{ width: 'auto', minWidth: 160 }}
          >
            {(Object.keys(STATUS_PRESETS) as StatusPreset[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_PRESET_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="cp-input"
            style={{ width: 'auto', minWidth: 200 }}
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
                {t.code} · {t.name}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={triggeredFrom}
            onChange={(e) => setTriggeredFrom(e.target.value)}
            className="cp-input"
            style={{ width: 200 }}
            title="Disparada desde"
          />
          <input
            type="datetime-local"
            value={triggeredTo}
            onChange={(e) => setTriggeredTo(e.target.value)}
            className="cp-input"
            style={{ width: 200 }}
            title="Disparada hasta"
          />
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 rounded-lg"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              <X size={14} /> Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span
            className="text-[var(--text-secondary)]"
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Severidad:
          </span>
          {SEVERITIES_ORDER.map((s) => {
            const meta = SEVERITY_META[s];
            const active = severities.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleSeverity(s)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition"
                style={{
                  background: active ? meta.bg : 'transparent',
                  color: active ? meta.fg : 'var(--text-secondary)',
                  border: `1px solid ${active ? meta.border : 'var(--border-color)'}`,
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: meta.border,
                  }}
                />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span
            className="text-[var(--text-secondary)]"
            style={{
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Disparador:
          </span>
          {TRIGGERS_ORDER.map((t) => {
            const active = triggerTypes.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTrigger(t)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition"
                style={{
                  background: active ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                  color: active ? '#1d4ed8' : 'var(--text-secondary)',
                  border: `1px solid ${active ? '#2563eb' : 'var(--border-color)'}`,
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                {TRIGGER_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick chips + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <QuickChip
            label="Solo críticas"
            active={quickFilter === 'critical'}
            onToggle={() => setQuickFilter(quickFilter === 'critical' ? '' : 'critical')}
            tone="danger"
          />
          <QuickChip
            label="Últimas 24h"
            active={quickFilter === '24h'}
            onToggle={() => setQuickFilter(quickFilter === '24h' ? '' : '24h')}
            tone="info"
          />
          <QuickChip
            label="Sin atender"
            active={quickFilter === 'unattended'}
            onToggle={() => setQuickFilter(quickFilter === 'unattended' ? '' : 'unattended')}
            tone="warning"
          />
          <QuickChip
            label="Bloqueando operación"
            active={quickFilter === 'blocking'}
            onToggle={() => setQuickFilter(quickFilter === 'blocking' ? '' : 'blocking')}
            tone="danger"
          />
        </div>
        <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
          <button
            onClick={() => setViewMode('list')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              background: view === 'list' ? '#2563eb' : 'transparent',
              color: view === 'list' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <List size={12} /> Lista
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              background: view === 'cards' ? '#2563eb' : 'transparent',
              color: view === 'cards' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <LayoutGrid size={12} /> Cards
          </button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-3 animate-pulse flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-64" />
                <div className="h-3 bg-gray-200 rounded w-40" />
              </div>
            </div>
          ))}
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState hasFilters={!!hasFilters} kpis={kpis} onReset={resetFilters} />
      ) : view === 'list' ? (
        <ListView
          rows={data.data}
          selected={selected}
          allSelected={allSelectedOnPage}
          onToggleSelect={(id) => {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelected(next);
          }}
          onToggleAll={toggleSelectAllOnPage}
          onView={(row) => setDetailAlert(row)}
          onAcknowledge={performAcknowledge}
          onResolve={(row) => setResolveTarget(row)}
          onDismiss={(row) => setDismissTarget(row)}
        />
      ) : (
        <CardsView
          rows={data.data}
          onView={(row) => setDetailAlert(row)}
          onAcknowledge={performAcknowledge}
          onResolve={(row) => setResolveTarget(row)}
          onDismiss={(row) => setDismissTarget(row)}
        />
      )}

      {/* Pagination + page size */}
      {data && data.data.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <span
              className="text-[var(--text-secondary)]"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}
            >
              Mostrando {data.data.length} de {data.total} alertas
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="cp-input"
              style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} por página
                </option>
              ))}
            </select>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded border border-gray-300 disabled:opacity-30 hover:bg-[var(--bg-card)] transition"
              >
                <ChevronLeft size={16} />
              </button>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                {data.page} / {data.totalPages}
              </span>
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
      )}

      {/* Bulk action bar — sticky at bottom when items are selected */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full"
          style={{
            background: '#0f172a',
            color: '#fff',
            zIndex: 40,
            boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: 13,
          }}
        >
          <span>{selected.size} alertas seleccionadas</span>
          <button
            onClick={performBulkAcknowledge}
            disabled={bulkActing}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            <CheckCircle2 size={12} /> Atender
          </button>
          <button
            onClick={performBulkResolve}
            disabled={bulkActing}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full"
            style={{ background: '#15803d' }}
          >
            <CheckCheck size={12} /> Resolver
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full text-white/80 hover:text-white"
          >
            <X size={12} /> Cerrar selección
          </button>
        </div>
      )}

      {/* Detail modal */}
      {detailAlert && (
        <AlertDetailModal
          alertId={detailAlert.id}
          assetTypeCategory={detailAlert.asset.assetType?.category}
          onClose={() => setDetailAlert(null)}
          onAcknowledge={async (id) => {
            await performAcknowledge(id);
          }}
          onResolve={(id) => {
            const row = data?.data.find((x) => x.id === id);
            if (row) {
              setDetailAlert(null);
              setResolveTarget(row);
            }
          }}
          onDismiss={(id) => {
            const row = data?.data.find((x) => x.id === id);
            if (row) {
              setDetailAlert(null);
              setDismissTarget(row);
            }
          }}
        />
      )}

      {resolveTarget && (
        <ReasonModal
          title="Resolver alerta"
          description="¿Cómo resolviste este problema?"
          hint="Ejemplo: Documento renovado y aprobado el 15/04/2026"
          confirmLabel="Resolver"
          confirmTone="success"
          required={false}
          minLength={0}
          value={resolveReason}
          onChange={setResolveReason}
          onCancel={() => {
            setResolveTarget(null);
            setResolveReason('');
          }}
          onConfirm={performResolve}
        />
      )}

      {dismissTarget && (
        <ReasonModal
          title="Descartar alerta"
          description="Las alertas descartadas no volverán a generarse hasta el próximo recálculo. Sólo descarta si la alerta es incorrecta o no aplica."
          hint="Mínimo 10 caracteres"
          confirmLabel="Descartar"
          confirmTone="warning"
          required
          minLength={10}
          value={dismissReason}
          onChange={setDismissReason}
          onCancel={() => {
            setDismissTarget(null);
            setDismissReason('');
          }}
          onConfirm={performDismiss}
        />
      )}

      <PageStyles />
    </div>
  );
}

/* ----------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  valueColor,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  valueColor?: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-4 transition"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${active ? '#2563eb' : 'var(--border-color)'}`,
        boxShadow: active ? '0 0 0 3px rgba(37,99,235,0.08)' : 'none',
      }}
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
    </button>
  );
}

function QuickChip({
  label,
  active,
  onToggle,
  tone,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  tone: 'warning' | 'danger' | 'info';
}) {
  const palette: Record<typeof tone, { bg: string; fg: string; activeBg: string }> = {
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
    info: {
      bg: 'rgba(37, 99, 235, 0.08)',
      fg: '#1d4ed8',
      activeBg: 'rgba(37, 99, 235, 0.18)',
    },
  };
  const m = palette[tone];
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
    </button>
  );
}

function EmptyState({
  hasFilters,
  kpis,
  onReset,
}: {
  hasFilters: boolean;
  kpis: AlertKpis | null;
  onReset: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-12 text-center">
        <SearchX size={36} className="mx-auto text-gray-300 mb-3" />
        <p
          className="text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          No hay alertas que coincidan con tus filtros.
        </p>
        <button
          onClick={onReset}
          className="mt-3 inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-full hover:bg-gray-50"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
        >
          <X size={13} /> Limpiar filtros
        </button>
      </div>
    );
  }
  const noRules = (kpis?.total ?? 0) === 0;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-12 text-center">
      <CheckCircle2 size={36} className="mx-auto text-green-500 mb-3" />
      <p
        className="text-[var(--text-primary)]"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          fontSize: 16,
        }}
      >
        No hay alertas activas
      </p>
      <p className="text-sm text-[var(--text-secondary)] mt-1">
        Tu sistema documental está al día.
      </p>
      {noRules && (
        <Link
          href="/operaciones/configuracion?tab=alertas"
          className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 text-sm rounded-full text-white"
          style={{
            background: '#1C1C1E',
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 500,
          }}
        >
          <Settings size={13} /> Ir a configuración →
        </Link>
      )}
    </div>
  );
}

interface ListProps {
  rows: AlertRow[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onView: (row: AlertRow) => void;
  onAcknowledge: (id: string) => Promise<void> | void;
  onResolve: (row: AlertRow) => void;
  onDismiss: (row: AlertRow) => void;
}

function ListView(props: ListProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[var(--input-bg)]">
              <th style={{ padding: '10px 12px', width: 36 }}>
                <input
                  type="checkbox"
                  checked={props.allSelected}
                  onChange={props.onToggleAll}
                  style={{ accentColor: '#2563eb' }}
                  aria-label="Seleccionar todas"
                />
              </th>
              <Th>Severidad</Th>
              <Th>Alerta</Th>
              <Th>Activo</Th>
              <Th>Disparador</Th>
              <Th>Días</Th>
              <Th>Disparada</Th>
              <Th>Estado</Th>
              <Th align="right" style={{ width: 180 }}>
                Acciones
              </Th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <ListRow
                key={r.id}
                row={r}
                selected={props.selected.has(r.id)}
                onToggleSelect={() => props.onToggleSelect(r.id)}
                onView={() => props.onView(r)}
                onAcknowledge={() => props.onAcknowledge(r.id)}
                onResolve={() => props.onResolve(r)}
                onDismiss={() => props.onDismiss(r)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListRow({
  row,
  selected,
  onToggleSelect,
  onView,
  onAcknowledge,
  onResolve,
  onDismiss,
}: {
  row: AlertRow;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onAcknowledge: () => Promise<void> | void;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  const sev = SEVERITY_META[row.severity];
  const stat = STATUS_META[row.status];
  const isVehicle = (row.asset.assetType?.category ?? '').toUpperCase() === 'VEHICLE';
  const assetHref = isVehicle ? '/operaciones/vehiculos' : `/operaciones/equipos/${row.asset.id}`;
  const isActionable = row.status === 'ACTIVE' || row.status === 'ESCALATED';
  return (
    <tr className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--input-bg)] transition">
      <td style={{ padding: '8px 12px' }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          style={{ accentColor: '#2563eb' }}
          aria-label="Seleccionar"
        />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span style={{ color: sev.fg, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {sev.icon}
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {sev.label}
          </span>
        </span>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <button
          onClick={onView}
          className="text-left hover:underline"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          {row.title}
        </button>
      </td>
      <td style={{ padding: '8px 12px' }}>
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
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span
          className="cfg-chip"
          style={{ background: 'rgba(100, 116, 139, 0.12)', color: '#475569' }}
        >
          {TRIGGER_LABELS[row.triggerType]}
        </span>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono), monospace',
            fontSize: 12,
            color:
              row.daysBeforeExpiration < 0
                ? '#b91c1c'
                : row.daysBeforeExpiration === 0
                  ? '#a16207'
                  : 'var(--text-primary)',
          }}
        >
          {formatDays(row.daysBeforeExpiration)}
        </span>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span
          className="text-[var(--text-secondary)]"
          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 12 }}
          title={formatDate(row.triggeredAt)}
        >
          {formatRelativeDate(row.triggeredAt)}
        </span>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span className="cfg-chip" style={{ background: stat.bg, color: stat.fg }}>
          {stat.label}
        </span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <Action onClick={onView} title="Ver detalle">
          <Eye size={13} />
        </Action>
        {isActionable && (
          <Action onClick={onAcknowledge} title="Atender">
            <CheckCircle2 size={13} />
          </Action>
        )}
        {row.status !== 'RESOLVED' && row.status !== 'DISMISSED' && (
          <>
            <Action onClick={onResolve} title="Resolver" tone="success">
              <CheckCheck size={13} />
            </Action>
            <Action onClick={onDismiss} title="Descartar" tone="muted">
              <XCircle size={13} />
            </Action>
          </>
        )}
      </td>
    </tr>
  );
}

function CardsView({
  rows,
  onView,
  onAcknowledge,
  onResolve,
  onDismiss,
}: {
  rows: AlertRow[];
  onView: (r: AlertRow) => void;
  onAcknowledge: (id: string) => Promise<void> | void;
  onResolve: (r: AlertRow) => void;
  onDismiss: (r: AlertRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((r) => {
        const sev = SEVERITY_META[r.severity];
        const stat = STATUS_META[r.status];
        const isActionable = r.status === 'ACTIVE' || r.status === 'ESCALATED';
        const isVehicle = (r.asset.assetType?.category ?? '').toUpperCase() === 'VEHICLE';
        const assetHref = isVehicle
          ? '/operaciones/vehiculos'
          : `/operaciones/equipos/${r.asset.id}`;
        return (
          <div
            key={r.id}
            className="bg-[var(--bg-card)] rounded-xl p-4 relative"
            style={{
              border: '1px solid var(--border-color)',
              borderLeft: `4px solid ${sev.border}`,
            }}
          >
            {r.status !== 'ACTIVE' && (
              <div className="absolute top-3 right-3">
                <span className="cfg-chip" style={{ background: stat.bg, color: stat.fg }}>
                  {stat.label}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: sev.fg }}>{sev.icon}</span>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  color: sev.fg,
                  letterSpacing: '0.04em',
                }}
              >
                {sev.label}
              </span>
            </div>
            <button
              onClick={() => onView(r)}
              className="text-left mb-1 hover:underline"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--text-primary)',
              }}
            >
              {r.title}
            </button>
            <div className="mb-2">
              <Link
                href={assetHref}
                className="hover:underline"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                {r.asset.code} · {r.asset.name}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span
                className="cfg-chip"
                style={{ background: 'rgba(100, 116, 139, 0.12)', color: '#475569' }}
              >
                {TRIGGER_LABELS[r.triggerType]}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 12,
                  color:
                    r.daysBeforeExpiration < 0
                      ? '#b91c1c'
                      : r.daysBeforeExpiration === 0
                        ? '#a16207'
                        : 'var(--text-secondary)',
                }}
              >
                {formatDays(r.daysBeforeExpiration)}
              </span>
              <span
                className="text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 11 }}
                title={formatDate(r.triggeredAt)}
              >
                {formatRelativeDate(r.triggeredAt)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Action onClick={() => onView(r)} title="Ver detalle">
                <Eye size={13} />
              </Action>
              {isActionable && (
                <Action onClick={() => onAcknowledge(r.id)} title="Atender">
                  <CheckCircle2 size={13} />
                </Action>
              )}
              {r.status !== 'RESOLVED' && r.status !== 'DISMISSED' && (
                <>
                  <Action onClick={() => onResolve(r)} title="Resolver" tone="success">
                    <CheckCheck size={13} />
                  </Action>
                  <Action onClick={() => onDismiss(r)} title="Descartar" tone="muted">
                    <XCircle size={13} />
                  </Action>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Action({
  children,
  onClick,
  title,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  tone?: 'success' | 'muted';
}) {
  const colorClass =
    tone === 'success'
      ? 'text-green-700 hover:bg-green-50'
      : tone === 'muted'
        ? 'text-[var(--text-secondary)] hover:bg-gray-100'
        : 'text-[var(--text-secondary)] hover:bg-gray-100';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-md ml-1 first:ml-0 transition ${colorClass}`}
    >
      {children}
    </button>
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
        padding: '10px 12px',
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

function ReasonModal({
  title,
  description,
  hint,
  confirmLabel,
  confirmTone,
  required,
  minLength,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  hint?: string;
  confirmLabel: string;
  confirmTone: 'success' | 'warning' | 'danger';
  required: boolean;
  minLength: number;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tones: Record<typeof confirmTone, string> = {
    success: '#15803d',
    warning: '#D97706',
    danger: '#DC2626',
  };
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
        <div className="px-5 py-4">
          <p className="text-sm text-[var(--text-secondary)] mb-3">{description}</p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={hint}
            className="cp-input"
          />
          {required && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {value.trim().length}/{minLength} caracteres mínimos.
            </p>
          )}
        </div>
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
            disabled={required && value.trim().length < minLength}
            className="px-4 py-2 text-sm text-white rounded-full disabled:opacity-50"
            style={{
              background: tones[confirmTone],
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
        transition:
          border-color 120ms ease,
          box-shadow 120ms ease;
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
