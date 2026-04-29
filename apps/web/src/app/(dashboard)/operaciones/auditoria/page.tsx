'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Leaf,
  Package,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { Toast } from '../../../../components/shared/Toast';

/* OPS-036 — audit & compliance landing page. Mirrors the layout
   conventions of /operaciones/reportes (header + explanation +
   stacked card sections) but with audit-specific affordances:
   package generator, history table, integrity validator, and
   the Chilean legal framework cards. */

interface DataSnapshot {
  totalAssets: number;
  assetsWithCriticalIssues: number;
  totalDocuments: number;
  totalProcedures: number;
  totalPermits: number;
  totalActiveAlerts: number;
  complianceGlobalAtMoment: number;
}

interface LegalFrameworkEntry {
  code: string;
  name: string;
  fullName: string;
  color: 'red' | 'orange' | 'blue' | 'green' | 'teal';
  icon: string;
  requirements: string[];
  coverage: string[];
  relatedReports: string[];
  officialSource: string;
}

interface ReportDef {
  code: string;
  name: string;
  label: string;
}

interface LegalFrameworkResponse {
  framework: LegalFrameworkEntry[];
  reports: ReportDef[];
}

interface AuditPackageRow {
  id: string;
  generatedAt: string;
  generatedBy: { id: string; name: string };
  period: { from: string; to: string } | null;
  fileSize: number;
  reason: string;
  expiresAt: string | null;
  packageSignature: string;
}

interface AuditPackageList {
  data: AuditPackageRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ValidationResult {
  valid: boolean;
  expectedFiles: number;
  actualFiles: number;
  hashMismatches: string[];
  missingFiles: string[];
  extraFiles: string[];
  packageSignatureMatches: boolean;
}

const ICON_FOR_LAW: Record<string, typeof ShieldAlert> = {
  ShieldAlert,
  Activity,
  Briefcase,
  Truck,
  Leaf,
};

const COLOR_TINT: Record<LegalFrameworkEntry['color'], { bg: string; fg: string; ring: string }> = {
  red: { bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c', ring: 'rgba(239, 68, 68, 0.25)' },
  orange: { bg: 'rgba(234, 88, 12, 0.1)', fg: '#9a3412', ring: 'rgba(234, 88, 12, 0.25)' },
  blue: { bg: 'rgba(37, 99, 235, 0.1)', fg: '#1d4ed8', ring: 'rgba(37, 99, 235, 0.25)' },
  green: { bg: 'rgba(34, 197, 94, 0.1)', fg: '#15803d', ring: 'rgba(34, 197, 94, 0.25)' },
  teal: { bg: 'rgba(20, 184, 166, 0.1)', fg: '#0f766e', ring: 'rgba(20, 184, 166, 0.25)' },
};

function thresholdColor(pct: number): string {
  if (pct >= 90) return '#15803d';
  if (pct >= 70) return '#a16207';
  return '#b91c1c';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatDateTimeEs(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateEs(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/* Today / month / quarter / year presets — values are ISO strings
   in UTC midnight to match what the backend stores for date-only
   filters. */
function presetRange(preset: 'month' | 'quarter' | 'year' | 'custom'): {
  from: string;
  to: string;
} {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = today.toISOString().slice(0, 10);
  if (preset === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: from.toISOString().slice(0, 10), to };
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getUTCMonth() / 3) * 3;
    const from = new Date(Date.UTC(now.getUTCFullYear(), q, 1));
    return { from: from.toISOString().slice(0, 10), to };
  }
  if (preset === 'year') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { from: from.toISOString().slice(0, 10), to };
  }
  return { from: to, to };
}

export default function AuditoriaPage() {
  const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null);
  const [framework, setFramework] = useState<LegalFrameworkEntry[]>([]);
  const [reportDefs, setReportDefs] = useState<ReportDef[]>([]);
  const [history, setHistory] = useState<AuditPackageList | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [packagesGeneratedLifetime, setPackagesGeneratedLifetime] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info') => setToast({ message, type }),
    [],
  );

  const loadEverything = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [snap, fw, list] = await Promise.all([
        apiClient.get<DataSnapshot>('/api/operations/audit/compliance-snapshot'),
        apiClient.get<LegalFrameworkResponse>('/api/operations/audit/legal-framework'),
        apiClient.get<AuditPackageList>('/api/operations/audit/packages?limit=20'),
      ]);
      setSnapshot(snap);
      setFramework(fw.framework);
      setReportDefs(fw.reports);
      setHistory(list);
      setPackagesGeneratedLifetime(list.total);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Error cargando la página de auditoría',
        'error',
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1280px] mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="ops-breadcrumb">Operaciones / Auditoría</div>
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
        Auditoría y Compliance
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 24,
        }}
      >
        Evidencia para auditores externos y certificadores
      </p>

      {/* Explanation */}
      <section className="audit-card audit-card--intro">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div className="audit-icon-bubble">
            <FileCheck2 size={20} />
          </div>
          <div>
            <h2 className="audit-card-title">¿Qué genera esta sección?</h2>
            <p className="audit-card-text">
              Genera un paquete completo con todos los reportes y evidencia de cumplimiento del
              módulo Operaciones. Incluye reportes Excel detallados, una portada explicativa, el
              marco normativo aplicable y un manifiesto criptográfico que prueba la integridad de
              los datos. Útil para auditorías ISO, inspecciones laborales, fiscalización ambiental y
              certificaciones.
            </p>
          </div>
        </div>
      </section>

      {/* KPI Bar */}
      <KpiBar snapshot={snapshot} packagesLifetime={packagesGeneratedLifetime} />

      {/* Section 1 — Generator */}
      <GeneratorCard reports={reportDefs} onGenerated={loadEverything} toaster={showToast} />

      {/* Section 2 — History */}
      <HistoryCard
        history={history}
        loading={historyLoading}
        onRefresh={loadEverything}
        toaster={showToast}
      />

      {/* Section 3 — Validator */}
      <ValidatorCard toaster={showToast} />

      {/* Section 4 — Legal framework */}
      <LegalFrameworkSection framework={framework} reports={reportDefs} />

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
        .audit-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 18px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        }
        html.dark .audit-card {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .audit-card--intro {
          border-left: 3px solid #2563eb;
        }
        .audit-icon-bubble {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(37, 99, 235, 0.12);
          color: #1d4ed8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .audit-card-title {
          font-family: var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 16px;
          color: var(--text-primary);
          margin: 0 0 6px;
        }
        .audit-card-text {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.55;
          margin: 0;
        }
        .audit-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .audit-input,
        .audit-textarea,
        .audit-select {
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
        .audit-input:focus,
        .audit-textarea:focus,
        .audit-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .audit-textarea {
          min-height: 80px;
          resize: vertical;
        }
        .audit-label {
          display: block;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .audit-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 999px;
          font-family: var(--font-jetbrains-mono), monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .audit-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 999px;
          background: #1c1c1e;
          color: #ffffff;
          font-family: var(--font-outfit), sans-serif;
          font-weight: 500;
          font-size: 14px;
          border: none;
          cursor: pointer;
          transition: opacity 120ms ease;
        }
        .audit-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .audit-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          background: transparent;
          color: var(--text-primary);
          font-family: var(--font-outfit), sans-serif;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid var(--border-color);
          cursor: pointer;
        }
        .audit-btn-ghost:hover {
          background: var(--input-bg);
        }
        .audit-table {
          width: 100%;
          border-collapse: collapse;
        }
        .audit-table th {
          text-align: left;
          padding: 10px 16px;
          font-family: var(--font-ibm-plex-mono), monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-secondary);
          font-weight: 500;
          background: var(--input-bg);
          border-bottom: 1px solid var(--border-color);
        }
        .audit-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          font-size: 13px;
          color: var(--text-primary);
          vertical-align: top;
        }
        .audit-table tr:last-child td {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
}

/* ============================================================ */
/*  KPI BAR                                                     */
/* ============================================================ */

function KpiBar({
  snapshot,
  packagesLifetime,
}: {
  snapshot: DataSnapshot | null;
  packagesLifetime: number;
}) {
  const pct = snapshot?.complianceGlobalAtMoment ?? 0;
  const items = [
    {
      label: 'Cumplimiento global',
      value: snapshot ? `${pct.toFixed(1)}%` : '—',
      color: snapshot ? thresholdColor(pct) : undefined,
      icon: ShieldCheck,
    },
    {
      label: 'Activos al día',
      value: snapshot
        ? `${snapshot.totalAssets - snapshot.assetsWithCriticalIssues}/${snapshot.totalAssets}`
        : '—',
      icon: CheckCircle2,
    },
    {
      label: 'Documentos vigentes',
      value: snapshot ? snapshot.totalDocuments.toLocaleString('es-CL') : '—',
      icon: FileText,
    },
    {
      label: 'Procedimientos publicados',
      value: snapshot ? snapshot.totalProcedures.toLocaleString('es-CL') : '—',
      icon: Briefcase,
    },
    {
      label: 'Auditorías generadas',
      value: packagesLifetime.toLocaleString('es-CL'),
      icon: Package,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 18,
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="audit-card"
            style={{ marginBottom: 0, padding: '16px 18px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ibm-plex-mono), monospace',
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <Icon size={13} />
              {item.label}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 700,
                fontSize: 24,
                color: item.color ?? 'var(--text-primary)',
                lineHeight: 1.1,
              }}
            >
              {item.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================ */
/*  SECTION 1 — GENERATOR                                       */
/* ============================================================ */

function GeneratorCard({
  reports,
  onGenerated,
  toaster,
}: {
  reports: ReportDef[];
  onGenerated: () => void;
  toaster: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [preset, setPreset] = useState<'month' | 'quarter' | 'year' | 'custom'>('quarter');
  const [from, setFrom] = useState(() => presetRange('quarter').from);
  const [to, setTo] = useState(() => presetRange('quarter').to);
  const [reason, setReason] = useState('');
  const [includedReports, setIncludedReports] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  /* Default to all reports selected as soon as we know the catalog. */
  useEffect(() => {
    if (reports.length > 0 && includedReports.size === 0) {
      setIncludedReports(new Set(reports.map((r) => r.code)));
    }
  }, [reports, includedReports.size]);

  const applyPreset = (p: 'month' | 'quarter' | 'year' | 'custom') => {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const toggleReport = (code: string) => {
    const next = new Set(includedReports);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setIncludedReports(next);
  };

  const valid =
    !!from && !!to && from <= to && reason.trim().length >= 20 && includedReports.size > 0;

  const handleGenerate = async () => {
    if (!valid || generating) return;
    setGenerating(true);
    setStep('Generando reportes y portada (esto puede demorar 30–60s)...');
    try {
      const result = await apiClient.post<{ id: string; generatedAt: string }>(
        '/api/operations/audit/generate-package',
        {
          periodFrom: new Date(from).toISOString(),
          periodTo: new Date(to + 'T23:59:59.999Z').toISOString(),
          reason: reason.trim(),
          includedReports:
            includedReports.size === reports.length ? undefined : Array.from(includedReports),
        },
      );
      setStep('Descargando paquete...');
      /* Fetch the freshly-stored ZIP for download. The backend
         always persists then serves; we don't return the bytes
         from the generate endpoint to keep the response small. */
      const blob = await apiClient.fetchBlob(
        `/api/operations/audit/packages/${result.id}/download`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `paquete-auditoria-${new Date(result.generatedAt).toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toaster('Paquete generado y descargado', 'success');
      setReason('');
      onGenerated();
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error generando el paquete', 'error');
    } finally {
      setGenerating(false);
      setStep(null);
    }
  };

  return (
    <section className="audit-card">
      <div className="audit-section-head">
        <div>
          <h2 className="audit-card-title">Generar nuevo paquete de auditoría</h2>
          <p className="audit-card-text">
            Selecciona el período y los reportes a incluir. El paquete se compone con un manifiesto
            criptográfico que permite a un tercero verificar después que los datos no fueron
            alterados.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Period preset + custom range */}
        <div>
          <label className="audit-label">Período</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {(['month', 'quarter', 'year', 'custom'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="audit-btn-ghost"
                style={{
                  background: preset === p ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                  borderColor: preset === p ? '#2563eb' : 'var(--border-color)',
                  color: preset === p ? '#1d4ed8' : 'var(--text-secondary)',
                }}
              >
                {p === 'month'
                  ? 'Este mes'
                  : p === 'quarter'
                    ? 'Este trimestre'
                    : p === 'year'
                      ? 'Este año'
                      : 'Personalizado'}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              className="audit-input"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset('custom');
              }}
            />
            <input
              type="date"
              className="audit-input"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset('custom');
              }}
            />
          </div>
        </div>

        {/* Included reports */}
        <div>
          <label className="audit-label">
            Reportes incluidos ({includedReports.size}/{reports.length})
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reports.map((r) => {
              const checked = includedReports.has(r.code);
              return (
                <label
                  key={r.code}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: checked ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleReport(r.code)}
                    style={{ accentColor: '#2563eb' }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      minWidth: 24,
                    }}
                  >
                    {r.code}
                  </span>
                  {r.label}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label className="audit-label" htmlFor="audit-reason">
          Razón de la auditoría <span style={{ color: '#b91c1c' }}>*</span>
        </label>
        <textarea
          id="audit-reason"
          className="audit-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: 'Auditoría anual ISO 45001', 'Inspección DT solicitud 12345'"
        />
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: reason.trim().length < 20 ? '#a16207' : 'var(--text-secondary)',
          }}
        >
          {reason.trim().length} / 20 caracteres mínimo
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!valid || generating}
          className="audit-btn-primary"
        >
          <Sparkles size={14} className={generating ? 'animate-pulse' : ''} />
          {generating ? 'Generando...' : 'Generar paquete completo'}
        </button>
        {step && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step}</span>}
      </div>
    </section>
  );
}

/* ============================================================ */
/*  SECTION 2 — HISTORY                                         */
/* ============================================================ */

function HistoryCard({
  history,
  loading,
  onRefresh,
  toaster,
}: {
  history: AuditPackageList | null;
  loading: boolean;
  onRefresh: () => void;
  toaster: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const handleDownload = async (id: string, generatedAt: string) => {
    try {
      const blob = await apiClient.fetchBlob(`/api/operations/audit/packages/${id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `paquete-auditoria-${generatedAt.slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error descargando paquete', 'error');
    }
  };

  return (
    <section className="audit-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="audit-section-head" style={{ padding: '20px 20px 0' }}>
        <div>
          <h2 className="audit-card-title">Auditorías generadas anteriormente</h2>
          <p className="audit-card-text">
            Cada paquete queda almacenado por 1 año desde su generación, con su firma criptográfica
            intacta para auditorías posteriores.
          </p>
        </div>
        <button type="button" onClick={onRefresh} className="audit-btn-ghost">
          <RefreshCw size={12} />
          Actualizar
        </button>
      </div>
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          Cargando...
        </div>
      ) : !history || history.data.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Package size={32} style={{ margin: '0 auto 10px', color: '#cbd5e1' }} />
          <div style={{ fontSize: 14 }}>Aún no se han generado paquetes de auditoría</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="audit-table">
            <thead>
              <tr>
                <th>Generado</th>
                <th>Por</th>
                <th>Período</th>
                <th>Razón</th>
                <th>Tamaño</th>
                <th>Firma</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 12,
                      }}
                    >
                      {formatDateTimeEs(row.generatedAt)}
                    </span>
                  </td>
                  <td>{row.generatedBy.name}</td>
                  <td
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {row.period
                      ? `${formatDateEs(row.period.from)} → ${formatDateEs(row.period.to)}`
                      : '—'}
                  </td>
                  <td
                    style={{
                      maxWidth: 240,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.reason}
                  >
                    {row.reason}
                  </td>
                  <td>{formatBytes(row.fileSize)}</td>
                  <td
                    style={{
                      fontFamily: 'var(--font-jetbrains-mono), monospace',
                      fontSize: 10,
                      color: 'var(--text-muted)',
                    }}
                    title={row.packageSignature}
                  >
                    {row.packageSignature.slice(0, 12)}…
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleDownload(row.id, row.generatedAt)}
                      className="audit-btn-ghost"
                      title="Descargar el ZIP"
                    >
                      <Download size={12} /> ZIP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ============================================================ */
/*  SECTION 3 — VALIDATOR                                       */
/* ============================================================ */

function ValidatorCard({
  toaster,
}: {
  toaster: (message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.zip')) {
      toaster('Solo se aceptan archivos .zip', 'error');
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleValidate = async () => {
    if (!file || validating) return;
    setValidating(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await apiClient.uploadFile<ValidationResult>(
        '/api/operations/audit/validate-package',
        form,
      );
      setResult(r);
    } catch (err) {
      toaster(err instanceof Error ? err.message : 'Error validando el paquete', 'error');
    } finally {
      setValidating(false);
    }
  };

  return (
    <section className="audit-card">
      <div className="audit-section-head">
        <div>
          <h2 className="audit-card-title">Validar integridad de un paquete</h2>
          <p className="audit-card-text">
            Sube un paquete previamente generado para verificar que sus archivos coinciden con los
            hashes del manifiesto. Si alguno fue modificado (incluso por error), aparecerá en la
            lista de no coincidentes.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed',
          borderColor: dragOver ? '#2563eb' : 'var(--border-color)',
          borderRadius: 12,
          padding: 28,
          textAlign: 'center',
          background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',
          cursor: 'pointer',
          transition: 'all 150ms ease',
        }}
      >
        <Upload size={26} style={{ color: '#94a3b8', margin: '0 auto 8px' }} />
        {file ? (
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>
              {file.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {formatBytes(file.size)}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Arrastra un .zip aquí o haz click para seleccionar
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          onChange={(e) => {
            handleFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleValidate}
          disabled={!file || validating}
          className="audit-btn-primary"
        >
          {validating ? 'Validando...' : 'Validar integridad'}
        </button>
        {file && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setResult(null);
            }}
            className="audit-btn-ghost"
          >
            Limpiar
          </button>
        )}
      </div>

      {result && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 10,
              background: result.valid ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1.5px solid ${
                result.valid ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'
              }`,
              color: result.valid ? '#15803d' : '#b91c1c',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {result.valid ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {result.valid
              ? `Paquete íntegro — ${result.expectedFiles}/${result.expectedFiles} archivos coinciden`
              : 'Paquete modificado — se detectaron diferencias'}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}
          >
            <div>Archivos esperados: {result.expectedFiles}</div>
            <div>Archivos encontrados: {result.actualFiles}</div>
            <div>
              Firma maestra: {result.packageSignatureMatches ? '✓ coincide' : '✗ no coincide'}
            </div>
            {result.hashMismatches.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong style={{ color: '#b91c1c' }}>Hashes que no coinciden:</strong>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  {result.hashMismatches.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.missingFiles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong style={{ color: '#b91c1c' }}>Archivos faltantes:</strong>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  {result.missingFiles.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.extraFiles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong style={{ color: '#a16207' }}>Archivos extra (no en manifiesto):</strong>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  {result.extraFiles.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================ */
/*  SECTION 4 — LEGAL FRAMEWORK CARDS                           */
/* ============================================================ */

function LegalFrameworkSection({
  framework,
  reports,
}: {
  framework: LegalFrameworkEntry[];
  reports: ReportDef[];
}) {
  const reportLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reports) m.set(r.code, r.label);
    return m;
  }, [reports]);

  if (framework.length === 0) {
    return null;
  }

  return (
    <section className="audit-card">
      <div className="audit-section-head">
        <div>
          <h2 className="audit-card-title">Marco normativo chileno aplicable</h2>
          <p className="audit-card-text">
            Las normas que cubre el paquete y cómo Excelsia las cumple. Cada tarjeta enlaza al texto
            oficial publicado por la Biblioteca del Congreso Nacional.
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        {framework.map((law) => {
          const Icon = ICON_FOR_LAW[law.icon] ?? AlertCircle;
          const tint = COLOR_TINT[law.color];
          return (
            <article
              key={law.code}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid var(--border-color)`,
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: tint.bg,
                    color: tint.fg,
                    border: `1px solid ${tint.ring}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {law.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                  >
                    {law.fullName}
                  </div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Qué exige
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.55,
                  }}
                >
                  {law.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Cómo Excelsia lo cubre
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.55,
                  }}
                >
                  {law.coverage.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  Reportes que lo demuestran
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {law.relatedReports.map((code) => (
                    <span
                      key={code}
                      className="audit-pill"
                      style={{ background: tint.bg, color: tint.fg }}
                      title={reportLabelByCode.get(code) ?? `Reporte ${code}`}
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>

              <a
                href={law.officialSource}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: tint.fg,
                  fontWeight: 500,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 'auto',
                }}
              >
                Ver fuente oficial
                <ExternalLink size={11} />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
