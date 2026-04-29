'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCw, X } from 'lucide-react';
import { apiClient, ApiError } from '../../../lib/api';

/* OPS-031 — single modal that adapts to every report kind. Each
   report contributes its own filter fields below; the preview +
   generate buttons are shared. */

export type ReportKind =
  | 'asset-compliance'
  | 'activity'
  | 'acknowledgment-coverage'
  | 'alerts-history'
  | 'work-permits';

interface ReportMeta {
  title: string;
  description: string;
  endpoint: string;
  filenamePrefix: string;
  /* When true, the report requires a date range — the validate gate
     blocks the buttons until both dates are set. */
  requiresDateRange: boolean;
}

const REPORTS: Record<ReportKind, ReportMeta> = {
  'asset-compliance': {
    title: 'Cumplimiento documental por activo',
    description:
      'Estado de los documentos requeridos por cada activo, con compliance %, vencimientos y bloqueos.',
    endpoint: 'asset-compliance',
    filenamePrefix: 'cumplimiento-documental',
    requiresDateRange: false,
  },
  activity: {
    title: 'Actividad operacional',
    description:
      'Cronológico de eventos del módulo: documentos, permisos, alertas, procedimientos.',
    endpoint: 'activity',
    filenamePrefix: 'actividad',
    requiresDateRange: true,
  },
  'acknowledgment-coverage': {
    title: 'Cobertura de acuses de procedimientos',
    description: 'Estado de lectura de procedimientos por procedimiento y por usuario.',
    endpoint: 'acknowledgment-coverage',
    filenamePrefix: 'cobertura-acuses',
    requiresDateRange: false,
  },
  'alerts-history': {
    title: 'Histórico de alertas',
    description: 'Alertas generadas con sus estados, resoluciones y tiempos de respuesta.',
    endpoint: 'alerts-history',
    filenamePrefix: 'alertas',
    requiresDateRange: true,
  },
  'work-permits': {
    title: 'Permisos de trabajo ejecutados',
    description: 'Permisos con duraciones, incidentes, supervisores y aprobaciones.',
    endpoint: 'work-permits',
    filenamePrefix: 'permisos-trabajo',
    requiresDateRange: true,
  },
};

const ASSET_STATUSES = [
  'OPERATIONAL',
  'WITH_OBSERVATIONS',
  'IN_MAINTENANCE',
  'BLOCKED_DOCUMENTAL',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED',
];

const PROCEDURE_CATEGORIES = [
  'OPERATION',
  'MAINTENANCE',
  'EMERGENCY',
  'SAFETY',
  'QUALITY',
  'ENVIRONMENTAL',
  'OTHER',
];

const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL', 'BLOCKING'];
const ALERT_STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'DISMISSED'];
const WORK_PERMIT_STATUSES = [
  'DRAFT',
  'PENDING_AUTHORIZATION',
  'AUTHORIZED',
  'IN_EXECUTION',
  'SUSPENDED',
  'CLOSED',
  'CANCELLED',
  'EXPIRED',
];

const ACTIVITY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'document', label: 'Documentos' },
  { value: 'alert', label: 'Alertas' },
  { value: 'asset-status', label: 'Cambios de estado' },
  { value: 'work-permit', label: 'Permisos de trabajo' },
  { value: 'procedure', label: 'Procedimientos' },
  { value: 'exception', label: 'Excepciones' },
];

interface FilterState {
  startDate: string;
  endDate: string;
  assetTypeId: string;
  locationId: string;
  status: string;
  blockedOnly: boolean;
  procedureId: string;
  category: string;
  includeExempted: boolean;
  severity: string;
  assetId: string;
  supervisorId: string;
  permitTypeId: string;
  activityTypes: string[];
}

function defaultRangeFor(kind: ReportKind): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  let start: Date;
  if (kind === 'activity') {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  } else {
    /* current month */
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: end };
}

function defaultFilters(kind: ReportKind): FilterState {
  const range = defaultRangeFor(kind);
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    assetTypeId: '',
    locationId: '',
    status: '',
    blockedOnly: false,
    procedureId: '',
    category: '',
    includeExempted: false,
    severity: '',
    assetId: '',
    supervisorId: '',
    permitTypeId: '',
    activityTypes: [],
  };
}

interface ReportFilterModalProps {
  reportKind: ReportKind | null;
  onClose: () => void;
}

interface PreviewResponse {
  summary?: Record<string, unknown>;
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
}

export function ReportFilterModal({ reportKind, onClose }: ReportFilterModalProps) {
  const [filters, setFilters] = useState<FilterState>(() =>
    defaultFilters(reportKind ?? 'asset-compliance'),
  );
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* Reset state when the user opens a different report. */
  useEffect(() => {
    if (!reportKind) return;
    setFilters(defaultFilters(reportKind));
    setPreview(null);
    setError(null);
    setSuccess(null);
  }, [reportKind]);

  /* Esc to close. */
  useEffect(() => {
    if (!reportKind) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reportKind, onClose]);

  const meta = reportKind ? REPORTS[reportKind] : null;

  const update = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (!reportKind) return params;
    if (meta?.requiresDateRange) {
      params.set('startDate', filters.startDate);
      params.set('endDate', filters.endDate);
    }
    switch (reportKind) {
      case 'asset-compliance':
        if (filters.assetTypeId) params.set('assetTypeId', filters.assetTypeId);
        if (filters.locationId) params.set('locationId', filters.locationId);
        if (filters.status) params.set('status', filters.status);
        if (filters.blockedOnly) params.set('blockedOnly', 'true');
        break;
      case 'activity':
        if (filters.activityTypes.length > 0) {
          params.set('activityTypes', filters.activityTypes.join(','));
        }
        break;
      case 'acknowledgment-coverage':
        if (filters.procedureId) params.set('procedureId', filters.procedureId);
        if (filters.category) params.set('category', filters.category);
        if (filters.includeExempted) params.set('includeExempted', 'true');
        break;
      case 'alerts-history':
        if (filters.severity) params.set('severity', filters.severity);
        if (filters.status) params.set('status', filters.status);
        if (filters.assetId) params.set('assetId', filters.assetId);
        break;
      case 'work-permits':
        if (filters.status) params.set('status', filters.status);
        if (filters.supervisorId) params.set('supervisorId', filters.supervisorId);
        if (filters.permitTypeId) params.set('permitTypeId', filters.permitTypeId);
        break;
    }
    return params;
  }, [reportKind, meta, filters]);

  const buildPostBody = useCallback((): Record<string, unknown> | undefined => {
    if (!reportKind) return undefined;
    switch (reportKind) {
      case 'asset-compliance':
        return {
          assetTypeId: filters.assetTypeId || undefined,
          locationId: filters.locationId || undefined,
          status: filters.status || undefined,
          blockedOnly: filters.blockedOnly,
        };
      case 'activity':
        return {
          startDate: filters.startDate,
          endDate: filters.endDate,
          activityTypes: filters.activityTypes.length > 0 ? filters.activityTypes : undefined,
        };
      case 'acknowledgment-coverage':
        return {
          procedureId: filters.procedureId || undefined,
          category: filters.category || undefined,
          includeExempted: filters.includeExempted,
        };
      case 'alerts-history':
        return {
          startDate: filters.startDate,
          endDate: filters.endDate,
          severity: filters.severity || undefined,
          status: filters.status || undefined,
          assetId: filters.assetId || undefined,
        };
      case 'work-permits':
        return {
          startDate: filters.startDate,
          endDate: filters.endDate,
          status: filters.status || undefined,
          supervisorId: filters.supervisorId || undefined,
          permitTypeId: filters.permitTypeId || undefined,
        };
    }
  }, [reportKind, filters]);

  const validate = useCallback((): string | null => {
    if (!meta) return null;
    if (meta.requiresDateRange) {
      if (!filters.startDate || !filters.endDate) return 'Selecciona el rango de fechas.';
      if (new Date(filters.startDate) > new Date(filters.endDate))
        return 'La fecha de inicio debe ser anterior a la de fin.';
    }
    return null;
  }, [meta, filters]);

  const loadPreview = useCallback(async () => {
    if (!reportKind || !meta) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoadingPreview(true);
    setError(null);
    setSuccess(null);
    try {
      const params = buildQueryParams();
      const data = await apiClient.get<PreviewResponse>(
        `/api/operations/reports/preview/${meta.endpoint}?${params.toString()}`,
      );
      setPreview(data);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'No se pudo cargar la vista previa.';
      setError(msg);
    } finally {
      setLoadingPreview(false);
    }
  }, [reportKind, meta, validate, buildQueryParams]);

  const generate = useCallback(async () => {
    if (!reportKind || !meta) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await apiClient.postBlob(
        `/api/operations/reports/${meta.endpoint}`,
        buildPostBody(),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const dateSuffix = meta.requiresDateRange
        ? `${filters.startDate}-a-${filters.endDate}`
        : new Date().toISOString().slice(0, 10);
      anchor.download = `reporte-${meta.filenamePrefix}-${dateSuffix}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setSuccess('Reporte descargado correctamente.');
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'No se pudo generar el reporte.';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }, [reportKind, meta, validate, filters, buildPostBody]);

  const previewRowCount = useMemo(() => {
    const summary = preview?.summary as { rowCount?: number } | undefined;
    return summary?.rowCount ?? 0;
  }, [preview]);

  if (!reportKind || !meta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg-card)] w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-[var(--border-color)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{meta.title}</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{meta.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-[var(--hover-bg,rgba(0,0,0,0.04))]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-4">
          {meta.requiresDateRange && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Desde">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => update('startDate', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
              <Field label="Hasta">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => update('endDate', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
            </div>
          )}

          {reportKind === 'asset-compliance' && (
            <>
              <Field label="Estado">
                <select
                  value={filters.status}
                  onChange={(e) => update('status', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Todos</option>
                  {ASSET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de activo (UUID)">
                <input
                  type="text"
                  placeholder="Opcional — UUID del tipo"
                  value={filters.assetTypeId}
                  onChange={(e) => update('assetTypeId', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
              <Field label="Ubicación (UUID)">
                <input
                  type="text"
                  placeholder="Opcional — UUID de la ubicación"
                  value={filters.locationId}
                  onChange={(e) => update('locationId', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
              <CheckboxField
                label="Solo bloqueados"
                checked={filters.blockedOnly}
                onChange={(v) => update('blockedOnly', v)}
              />
            </>
          )}

          {reportKind === 'activity' && (
            <Field label="Tipos de actividad">
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITY_TYPE_OPTIONS.map((opt) => {
                  const active = filters.activityTypes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const set = new Set(filters.activityTypes);
                        if (set.has(opt.value)) set.delete(opt.value);
                        else set.add(opt.value);
                        update('activityTypes', Array.from(set));
                      }}
                      className="rounded-full border px-2 py-0.5 text-xs font-medium transition"
                      style={{
                        backgroundColor: active ? 'rgba(37,99,235,0.12)' : 'transparent',
                        color: active ? '#1d4ed8' : 'var(--text-secondary)',
                        borderColor: active ? '#2563eb' : 'var(--border-color)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Sin selección incluye todos los tipos.
              </p>
            </Field>
          )}

          {reportKind === 'acknowledgment-coverage' && (
            <>
              <Field label="Procedimiento (UUID)">
                <input
                  type="text"
                  placeholder="Opcional — UUID del procedimiento"
                  value={filters.procedureId}
                  onChange={(e) => update('procedureId', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
              <Field label="Categoría">
                <select
                  value={filters.category}
                  onChange={(e) => update('category', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Todas</option>
                  {PROCEDURE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <CheckboxField
                label="Incluir eximidos"
                checked={filters.includeExempted}
                onChange={(v) => update('includeExempted', v)}
              />
            </>
          )}

          {reportKind === 'alerts-history' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Severidad">
                  <select
                    value={filters.severity}
                    onChange={(e) => update('severity', e.target.value)}
                    className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">Todas</option>
                    {ALERT_SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado">
                  <select
                    value={filters.status}
                    onChange={(e) => update('status', e.target.value)}
                    className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                  >
                    <option value="">Todos</option>
                    {ALERT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Activo (UUID)">
                <input
                  type="text"
                  placeholder="Opcional — UUID del activo"
                  value={filters.assetId}
                  onChange={(e) => update('assetId', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
            </>
          )}

          {reportKind === 'work-permits' && (
            <>
              <Field label="Estado">
                <select
                  value={filters.status}
                  onChange={(e) => update('status', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                >
                  <option value="">Todos</option>
                  {WORK_PERMIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Supervisor (UUID)">
                <input
                  type="text"
                  placeholder="Opcional — UUID del supervisor"
                  value={filters.supervisorId}
                  onChange={(e) => update('supervisorId', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
              <Field label="Tipo de permiso (UUID)">
                <input
                  type="text"
                  placeholder="Opcional — UUID del tipo"
                  value={filters.permitTypeId}
                  onChange={(e) => update('permitTypeId', e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                />
              </Field>
            </>
          )}

          {/* Preview section */}
          {preview && (
            <div className="rounded-lg border border-[var(--border-color)] bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Vista previa
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {previewRowCount} registro{previewRowCount === 1 ? '' : 's'} se incluirán en el
                  reporte
                </span>
              </div>
              {preview.rows && preview.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[var(--text-secondary)]">
                        {(preview.columns ?? Object.keys(preview.rows[0])).map((col) => (
                          <th key={col} className="px-2 py-1 font-semibold uppercase tracking-wide">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-[var(--border-color)]">
                          {Object.values(row).map((value, j) => (
                            <td key={j} className="px-2 py-1 text-[var(--text-primary)] truncate">
                              {String(value ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)] italic">
                  No hay registros que coincidan con los filtros.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300">
              {success}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={loadPreview}
            disabled={loadingPreview || generating}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover-bg,rgba(0,0,0,0.03))] disabled:opacity-50"
          >
            {loadingPreview ? <RefreshCw size={12} className="animate-spin" /> : <Eye size={12} />}
            Vista previa
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={generating || loadingPreview}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
            Generar Excel
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[var(--border-color)]"
      />
      {label}
    </label>
  );
}

export default ReportFilterModal;
