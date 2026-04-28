'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Bell,
  CheckCheck,
  CheckCircle2,
  Eye,
  ExternalLink,
  FileText,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatDate, formatRelativeDate } from '../../lib/formatters';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { type DerivedDocumentStatus } from './DocumentStatusBadge';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKING';
export type AlertTriggerType = 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING' | 'BLOCKING';
export type AlertInstanceStatus =
  | 'ACTIVE'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'DISMISSED';

export interface AlertInstance {
  id: string;
  alertRuleId: string | null;
  documentTypeId: string;
  assetId: string;
  documentRecordId: string | null;
  triggerType: AlertTriggerType;
  severity: AlertSeverity;
  daysBeforeExpiration: number;
  triggeredAt: string;
  expirationDate: string | null;
  status: AlertInstanceStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolvedReason: string | null;
  escalatedAt: string | null;
  notifiedRoles: string[];
  notifiedUsers: string[];
  title: string;
  message: string | null;
  metadata: Record<string, unknown>;
  asset: { id: string; code: string; name: string; status: string };
  documentType: {
    id: string;
    name: string;
    code: string;
    category: string;
    criticality?: string;
    blocksOperation?: boolean;
  };
  documentRecord: {
    id: string;
    fileName: string;
    version: number;
    status: string;
    expirationDate: string | null;
  } | null;
  alertRule?: { id: string; name: string; severity: AlertSeverity } | null;
}

interface AssetTypeRef {
  category?: string;
}

export const SEVERITY_META: Record<
  AlertSeverity,
  { label: string; icon: React.ReactNode; bg: string; fg: string; border: string }
> = {
  INFO: {
    label: 'Info',
    icon: <Info size={14} />,
    bg: 'rgba(37, 99, 235, 0.12)',
    fg: '#1d4ed8',
    border: '#2563eb',
  },
  WARNING: {
    label: 'Warning',
    icon: <AlertTriangle size={14} />,
    bg: 'rgba(234, 179, 8, 0.14)',
    fg: '#a16207',
    border: '#ca8a04',
  },
  CRITICAL: {
    label: 'Crítica',
    icon: <AlertCircle size={14} />,
    bg: 'rgba(249, 115, 22, 0.14)',
    fg: '#c2410c',
    border: '#ea580c',
  },
  BLOCKING: {
    label: 'Bloqueante',
    icon: <Ban size={14} />,
    bg: 'rgba(239, 68, 68, 0.14)',
    fg: '#b91c1c',
    border: '#dc2626',
  },
};

export const TRIGGER_LABELS: Record<AlertTriggerType, string> = {
  EXPIRING_SOON: 'Por vencer',
  EXPIRED: 'Vencido',
  MISSING: 'Faltante',
  BLOCKING: 'Bloqueante',
};

export const STATUS_META: Record<AlertInstanceStatus, { label: string; bg: string; fg: string }> = {
  ACTIVE: { label: 'Activa', bg: 'rgba(239, 68, 68, 0.12)', fg: '#b91c1c' },
  ACKNOWLEDGED: { label: 'Atendida', bg: 'rgba(234, 179, 8, 0.14)', fg: '#a16207' },
  RESOLVED: { label: 'Resuelta', bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d' },
  ESCALATED: { label: 'Escalada', bg: 'rgba(249, 115, 22, 0.14)', fg: '#c2410c' },
  DISMISSED: { label: 'Descartada', bg: 'rgba(100, 116, 139, 0.14)', fg: '#475569' },
};

export function formatDays(days: number): string {
  if (days === 0) return 'hoy';
  if (days > 0) return `en ${days} ${days === 1 ? 'día' : 'días'}`;
  const abs = Math.abs(days);
  return `hace ${abs} ${abs === 1 ? 'día' : 'días'}`;
}

interface Props {
  alertId: string;
  /* Resolved asset type category — when 'VEHICLE' the "Ir al activo"
     link points to /vehiculos rather than /equipos. */
  assetTypeCategory?: string;
  onClose: () => void;
  /* Action callbacks expose only the per-row triggers; the parent owns
     the optimistic-update state so the modal stays a pure view. */
  onAcknowledge?: (id: string) => Promise<void> | void;
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function AlertDetailModal({
  alertId,
  assetTypeCategory,
  onClose,
  onAcknowledge,
  onResolve,
  onDismiss,
}: Props) {
  const [alert, setAlert] = useState<AlertInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .get<AlertInstance>(`/api/operations/alerts/instances/${alertId}`)
      .then((data) => {
        if (alive) setAlert(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar la alerta.');
      });
    return () => {
      alive = false;
    };
  }, [alertId]);

  const sev = alert ? SEVERITY_META[alert.severity] : null;
  const stat = alert ? STATUS_META[alert.status] : null;
  const isVehicle = (assetTypeCategory ?? '').toUpperCase() === 'VEHICLE';
  const assetHref = alert
    ? isVehicle
      ? `/operaciones/vehiculos`
      : `/operaciones/equipos/${alert.asset.id}`
    : '#';

  const handleAck = async () => {
    if (!alert || !onAcknowledge) return;
    setActing(true);
    try {
      await onAcknowledge(alert.id);
      setAlert({ ...alert, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() });
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
            <h3
              className="text-[var(--text-primary)] flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              <Bell size={16} /> Detalle de alerta
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                {error}
              </div>
            )}

            {!alert && !error && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-lg"
                    style={{ height: 64, background: 'rgba(0,0,0,0.04)' }}
                  />
                ))}
              </div>
            )}

            {alert && sev && stat && (
              <>
                {/* Title row */}
                <div
                  className="p-4 rounded-xl flex items-start gap-3"
                  style={{ background: sev.bg, borderLeft: `4px solid ${sev.border}` }}
                >
                  <span style={{ color: sev.fg, marginTop: 2 }}>{sev.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="cfg-chip"
                        style={{
                          background: '#fff',
                          color: sev.fg,
                          border: `1px solid ${sev.border}`,
                        }}
                      >
                        {sev.label}
                      </span>
                      <span className="cfg-chip" style={{ background: stat.bg, color: stat.fg }}>
                        {stat.label}
                      </span>
                      <span
                        className="cfg-chip"
                        style={{ background: 'rgba(100, 116, 139, 0.14)', color: '#475569' }}
                      >
                        {TRIGGER_LABELS[alert.triggerType]}
                      </span>
                    </div>
                    <p
                      className="text-[var(--text-primary)]"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 600,
                        fontSize: 15,
                        margin: 0,
                      }}
                    >
                      {alert.title}
                    </p>
                    {alert.message && (
                      <p
                        className="text-[var(--text-secondary)] mt-1"
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontSize: 13,
                        }}
                      >
                        {alert.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Asset card */}
                <Section title="Activo">
                  <KvRow label="Código" value={alert.asset.code} mono />
                  <KvRow label="Nombre" value={alert.asset.name} />
                  <KvRow label="Estado actual" value={alert.asset.status} mono />
                  <Link
                    href={assetHref}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontSize: 13,
                      fontWeight: 500,
                      marginTop: 6,
                    }}
                  >
                    <ExternalLink size={12} /> Ir al activo →
                  </Link>
                </Section>

                {/* Document type */}
                <Section title="Tipo de documento">
                  <KvRow label="Nombre" value={alert.documentType.name} />
                  <KvRow label="Código" value={alert.documentType.code} mono />
                  <KvRow label="Categoría" value={alert.documentType.category} />
                  {alert.documentType.criticality && (
                    <KvRow label="Criticidad" value={alert.documentType.criticality} />
                  )}
                  <KvRow
                    label="Bloquea operación"
                    value={alert.documentType.blocksOperation ? 'Sí' : 'No'}
                  />
                </Section>

                {/* Document record (when present) */}
                {alert.documentRecord && (
                  <Section title="Documento asociado">
                    <KvRow label="Archivo" value={alert.documentRecord.fileName} />
                    <KvRow label="Versión" value={`v${alert.documentRecord.version}`} mono />
                    <KvRow label="Estado" value={alert.documentRecord.status} mono />
                    {alert.documentRecord.expirationDate && (
                      <KvRow
                        label="Vencimiento"
                        value={formatDate(alert.documentRecord.expirationDate)}
                        mono
                      />
                    )}
                    <button
                      onClick={() => setPreviewing(true)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontSize: 13,
                        fontWeight: 500,
                        marginTop: 6,
                      }}
                    >
                      <Eye size={12} /> Ver documento
                    </button>
                  </Section>
                )}

                {/* Audit trail */}
                <Section title="Historial de la alerta">
                  <KvRow
                    label="Disparada"
                    value={`${formatRelativeDate(alert.triggeredAt)} · ${formatDate(
                      alert.triggeredAt,
                    )}`}
                  />
                  {alert.expirationDate && (
                    <KvRow label="Vencimiento" value={formatDate(alert.expirationDate)} mono />
                  )}
                  <KvRow label="Días" value={formatDays(alert.daysBeforeExpiration)} mono />
                  {alert.alertRule && <KvRow label="Regla" value={alert.alertRule.name} />}
                  {alert.acknowledgedAt && (
                    <KvRow
                      label="Atendida"
                      value={`${formatRelativeDate(alert.acknowledgedAt)} · ${formatDate(
                        alert.acknowledgedAt,
                      )}`}
                    />
                  )}
                  {alert.resolvedAt && (
                    <KvRow
                      label="Resuelta"
                      value={`${formatRelativeDate(alert.resolvedAt)} · ${formatDate(
                        alert.resolvedAt,
                      )}`}
                    />
                  )}
                  {alert.resolvedReason && <KvRow label="Motivo" value={alert.resolvedReason} />}
                </Section>

                {/* Notification */}
                {(alert.notifiedRoles.length > 0 || alert.notifiedUsers.length > 0) && (
                  <Section title="Notificaciones">
                    {alert.notifiedRoles.length > 0 && (
                      <div className="mb-1">
                        <span
                          className="text-[var(--text-secondary)]"
                          style={{
                            fontFamily: 'var(--font-ibm-plex-mono), monospace',
                            fontSize: 10,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            marginRight: 6,
                          }}
                        >
                          Roles:
                        </span>
                        <span
                          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}
                        >
                          {alert.notifiedRoles.join(', ')}
                        </span>
                      </div>
                    )}
                    {alert.notifiedUsers.length > 0 && (
                      <div>
                        <span
                          className="text-[var(--text-secondary)]"
                          style={{
                            fontFamily: 'var(--font-ibm-plex-mono), monospace',
                            fontSize: 10,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            marginRight: 6,
                          }}
                        >
                          Usuarios:
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: 12,
                          }}
                        >
                          {alert.notifiedUsers.length}
                        </span>
                      </div>
                    )}
                  </Section>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
            >
              Cerrar
            </button>
            {alert &&
              (alert.status === 'ACTIVE' || alert.status === 'ESCALATED') &&
              onAcknowledge && (
                <button
                  onClick={handleAck}
                  disabled={acting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-full hover:bg-gray-50 disabled:opacity-50"
                  style={{
                    fontFamily: 'var(--font-outfit), sans-serif',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                  }}
                >
                  <CheckCircle2 size={13} /> Atender
                </button>
              )}
            {alert && alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' && onResolve && (
              <button
                onClick={() => onResolve(alert.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white"
                style={{
                  background: '#15803d',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <CheckCheck size={13} /> Resolver
              </button>
            )}
            {alert && alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' && onDismiss && (
              <button
                onClick={() => onDismiss(alert.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-white"
                style={{
                  background: '#64748b',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <XCircle size={13} /> Descartar
              </button>
            )}
          </div>
        </div>

        <style jsx global>{`
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
      </div>

      {alert && previewing && alert.documentRecord && (
        <DocumentPreviewModal
          documentId={alert.documentRecord.id}
          fileName={alert.documentRecord.fileName}
          mimeType="application/octet-stream"
          documentTypeName={alert.documentType.name}
          assetCode={alert.asset.code}
          assetName={alert.asset.name}
          derivedStatus={alert.documentRecord.status as DerivedDocumentStatus}
          version={alert.documentRecord.version}
          onClose={() => setPreviewing(false)}
        />
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4
        className="text-[var(--text-secondary)] mb-2"
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function KvRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        padding: '4px 0',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-ibm-plex-mono), monospace',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: mono
            ? 'var(--font-jetbrains-mono), monospace'
            : 'var(--font-outfit), sans-serif',
          fontSize: mono ? 12 : 13,
          color: 'var(--text-primary)',
          textAlign: 'right',
          wordBreak: 'break-word',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

export default AlertDetailModal;
