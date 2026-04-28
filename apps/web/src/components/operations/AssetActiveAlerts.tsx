'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, CheckCheck, CheckCircle2, Eye, XCircle } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatDate, formatRelativeDate } from '../../lib/formatters';
import {
  AlertDetailModal,
  formatDays,
  SEVERITY_META,
  STATUS_META,
  TRIGGER_LABELS,
  type AlertInstance,
} from './AlertDetailModal';

interface Paginated<T> {
  data: T[];
}

interface Props {
  assetId: string;
  /* Used to choose the right "Ir al activo" target inside the detail
     modal (vehicles use a different URL convention). */
  assetTypeCategory?: string;
}

/* OPS-021 — compact alerts list rendered on the asset detail page.
   Hides itself when there are no actionable alerts so the page stays
   clean. We pull ACTIVE + ESCALATED + ACKNOWLEDGED so the operator can
   still see something they atendieron earlier today. */
export function AssetActiveAlerts({ assetId, assetTypeCategory }: Props) {
  const [alerts, setAlerts] = useState<AlertInstance[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveReason, setResolveReason] = useState('');
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('assetId', assetId);
      params.set('statuses', 'ACTIVE,ESCALATED,ACKNOWLEDGED');
      params.set('limit', '50');
      const res = await apiClient.get<Paginated<AlertInstance>>(
        `/api/operations/alerts/instances?${params.toString()}`,
      );
      setAlerts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las alertas.');
      setAlerts([]);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const performAck = async (id: string) => {
    try {
      await apiClient.post(`/api/operations/alerts/instances/${id}/acknowledge`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo atender la alerta.');
    }
  };

  const performResolve = async () => {
    if (!resolveId) return;
    try {
      await apiClient.post(`/api/operations/alerts/instances/${resolveId}/resolve`, {
        reason: resolveReason.trim() || undefined,
      });
      setResolveId(null);
      setResolveReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver la alerta.');
    }
  };

  const performDismiss = async () => {
    if (!dismissId) return;
    if (dismissReason.trim().length < 10) {
      setError('El motivo debe tener al menos 10 caracteres.');
      return;
    }
    try {
      await apiClient.post(`/api/operations/alerts/instances/${dismissId}/dismiss`, {
        reason: dismissReason.trim(),
      });
      setDismissId(null);
      setDismissReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descartar la alerta.');
    }
  };

  /* Empty/loading: don't render anything at all so the parent layout
     doesn't get an awkward placeholder. The skeleton appears only on
     first load before we know the list is empty. */
  if (alerts === null) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div
          className="animate-pulse"
          style={{ height: 60, background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}
        />
      </div>
    );
  }
  if (alerts.length === 0) return null;

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-[var(--text-primary)] flex items-center gap-2"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              fontSize: 16,
              margin: 0,
            }}
          >
            <Bell size={14} /> Alertas activas ({alerts.length})
          </h3>
          <Link
            href={`/operaciones/alertas?status=active`}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Ver todas <ArrowRight size={12} />
          </Link>
        </div>
        {error && (
          <div className="mb-2 p-2 rounded text-sm bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}
        <ul className="space-y-2">
          {alerts.map((a) => {
            const sev = SEVERITY_META[a.severity];
            const stat = STATUS_META[a.status];
            const isActionable = a.status === 'ACTIVE' || a.status === 'ESCALATED';
            return (
              <li
                key={a.id}
                className="rounded-lg p-3 flex items-start gap-3"
                style={{
                  border: '1px solid var(--border-color)',
                  borderLeft: `3px solid ${sev.border}`,
                }}
              >
                <span style={{ color: sev.fg, marginTop: 2 }}>{sev.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="cfg-chip" style={{ background: sev.bg, color: sev.fg }}>
                      {sev.label}
                    </span>
                    <span className="cfg-chip" style={{ background: stat.bg, color: stat.fg }}>
                      {stat.label}
                    </span>
                    <span
                      className="cfg-chip"
                      style={{ background: 'rgba(100, 116, 139, 0.12)', color: '#475569' }}
                    >
                      {TRIGGER_LABELS[a.triggerType]}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 11,
                        color:
                          a.daysBeforeExpiration < 0
                            ? '#b91c1c'
                            : a.daysBeforeExpiration === 0
                              ? '#a16207'
                              : 'var(--text-muted)',
                      }}
                    >
                      {formatDays(a.daysBeforeExpiration)}
                    </span>
                  </div>
                  <p
                    className="text-[var(--text-primary)]"
                    style={{
                      fontFamily: 'var(--font-outfit), sans-serif',
                      fontWeight: 500,
                      fontSize: 13,
                      margin: 0,
                    }}
                  >
                    {a.title}
                  </p>
                  <p
                    className="text-[var(--text-muted)] mt-0.5"
                    style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 11 }}
                    title={formatDate(a.triggeredAt)}
                  >
                    {formatRelativeDate(a.triggeredAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setDetailId(a.id)}
                    title="Ver detalle"
                    className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                  >
                    <Eye size={13} />
                  </button>
                  {isActionable && (
                    <button
                      onClick={() => performAck(a.id)}
                      title="Atender"
                      className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                    >
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setResolveReason('');
                      setResolveId(a.id);
                    }}
                    title="Resolver"
                    className="p-1.5 rounded-md hover:bg-green-50 text-green-700"
                  >
                    <CheckCheck size={13} />
                  </button>
                  <button
                    onClick={() => {
                      setDismissReason('');
                      setDismissId(a.id);
                    }}
                    title="Descartar"
                    className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                  >
                    <XCircle size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {detailId && (
        <AlertDetailModal
          alertId={detailId}
          assetTypeCategory={assetTypeCategory}
          onClose={() => setDetailId(null)}
          onAcknowledge={async (id) => {
            await performAck(id);
          }}
          onResolve={(id) => {
            setDetailId(null);
            setResolveReason('');
            setResolveId(id);
          }}
          onDismiss={(id) => {
            setDetailId(null);
            setDismissReason('');
            setDismissId(id);
          }}
        />
      )}

      {resolveId && (
        <SimpleReasonModal
          title="Resolver alerta"
          description="¿Cómo resolviste este problema?"
          hint="Ejemplo: Documento renovado y aprobado el 15/04/2026"
          confirmLabel="Resolver"
          confirmTone="success"
          minLength={0}
          required={false}
          value={resolveReason}
          onChange={setResolveReason}
          onCancel={() => {
            setResolveId(null);
            setResolveReason('');
          }}
          onConfirm={performResolve}
        />
      )}

      {dismissId && (
        <SimpleReasonModal
          title="Descartar alerta"
          description="Las alertas descartadas no volverán a generarse hasta el próximo recálculo."
          hint="Mínimo 10 caracteres"
          confirmLabel="Descartar"
          confirmTone="warning"
          minLength={10}
          required
          value={dismissReason}
          onChange={setDismissReason}
          onCancel={() => {
            setDismissId(null);
            setDismissReason('');
          }}
          onConfirm={performDismiss}
        />
      )}

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
    </>
  );
}

function SimpleReasonModal({
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
  hint: string;
  confirmLabel: string;
  confirmTone: 'success' | 'warning';
  required: boolean;
  minLength: number;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bg = confirmTone === 'success' ? '#15803d' : '#D97706';
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
              background: bg,
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

export default AssetActiveAlerts;
