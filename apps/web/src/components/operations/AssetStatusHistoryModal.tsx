'use client';

import { useEffect, useState } from 'react';
import { Bot, History, ShieldOff, User as UserIcon, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatDate, formatRelativeDate } from '../../lib/formatters';
import { ASSET_STATUS_LABELS, type AssetStatus } from './AssetStatusBadge';

type StatusChangeType =
  | 'MANUAL'
  | 'AUTO_BLOCK'
  | 'AUTO_UNBLOCK'
  | 'EXCEPTION_GRANTED'
  | 'EXCEPTION_EXPIRED';

interface UserSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface DocTypeRef {
  id: string;
  name: string;
  code: string;
}

interface StatusChangeRow {
  id: string;
  previousStatus: AssetStatus;
  newStatus: AssetStatus;
  changeType: StatusChangeType;
  reason: string | null;
  createdAt: string;
  changedByUser: UserSummary | null;
  triggeringDocumentTypes: DocTypeRef[];
}

interface Props {
  assetId: string;
  assetCode: string;
  assetName: string;
  onClose: () => void;
}

const TYPE_META: Record<StatusChangeType, { label: string; icon: React.ReactNode; color: string }> =
  {
    MANUAL: { label: 'Manual', icon: <UserIcon size={13} />, color: '#1d4ed8' },
    AUTO_BLOCK: { label: 'Bloqueo automático', icon: <Bot size={13} />, color: '#b91c1c' },
    AUTO_UNBLOCK: { label: 'Desbloqueo automático', icon: <Bot size={13} />, color: '#15803d' },
    EXCEPTION_GRANTED: {
      label: 'Excepción otorgada',
      icon: <ShieldOff size={13} />,
      color: '#a16207',
    },
    EXCEPTION_EXPIRED: {
      label: 'Excepción expirada',
      icon: <ShieldOff size={13} />,
      color: '#475569',
    },
  };

/* OPS-020 — chronological audit timeline for one asset's status
   transitions. The backend pre-resolves user info and triggering doc
   type names so the modal renders in a single render with no further
   network calls. */
export function AssetStatusHistoryModal({ assetId, assetCode, assetName, onClose }: Props) {
  const [rows, setRows] = useState<StatusChangeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .get<StatusChangeRow[]>(`/api/operations/assets/${assetId}/status-history`)
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
      });
    return () => {
      alive = false;
    };
  }, [assetId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-card)] z-10">
          <h3
            className="text-[var(--text-primary)] flex items-center gap-2"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600, fontSize: 16 }}
          >
            <History size={16} /> Historial de cambios de estado
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div
            className="mb-4 p-3 rounded-lg flex items-center gap-3"
            style={{
              background: 'rgba(37, 99, 235, 0.06)',
              border: '1px solid rgba(37, 99, 235, 0.18)',
            }}
          >
            <div>
              <div
                className="text-[var(--text-secondary)]"
                style={{
                  fontFamily: 'var(--font-ibm-plex-mono), monospace',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                Activo
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {assetCode}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                {assetName}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}

          {!rows && !error && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg"
                  style={{ height: 80, background: 'rgba(0,0,0,0.04)' }}
                />
              ))}
            </div>
          )}

          {rows && rows.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
              Aún no hay cambios de estado registrados para este activo.
            </p>
          )}

          {rows && rows.length > 0 && (
            <ol className="ash-timeline">
              {rows.map((r, idx) => {
                const meta = TYPE_META[r.changeType];
                return (
                  <li key={r.id} className="ash-item">
                    <div className="ash-marker">
                      <span
                        className="ash-dot"
                        style={{ background: meta.color, color: '#fff' }}
                        title={meta.label}
                      >
                        {meta.icon}
                      </span>
                      {idx !== rows.length - 1 && <span className="ash-line" />}
                    </div>
                    <div className="ash-card">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <span
                          className="cfg-chip"
                          style={{
                            background: `${meta.color}1a`,
                            color: meta.color,
                          }}
                        >
                          {meta.label}
                        </span>
                        <span
                          className="text-[var(--text-muted)]"
                          style={{
                            fontFamily: 'var(--font-jetbrains-mono), monospace',
                            fontSize: 11,
                          }}
                        >
                          {formatRelativeDate(r.createdAt)} · {formatDate(r.createdAt)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontFamily: 'var(--font-outfit), sans-serif',
                          fontSize: 14,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          margin: 0,
                        }}
                      >
                        {ASSET_STATUS_LABELS[r.previousStatus]} →{' '}
                        <strong>{ASSET_STATUS_LABELS[r.newStatus]}</strong>
                      </p>
                      {r.reason && (
                        <p
                          className="text-[var(--text-secondary)] mt-1"
                          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 13 }}
                        >
                          {r.reason}
                        </p>
                      )}
                      {r.changedByUser && (
                        <p
                          className="text-[var(--text-muted)] mt-1 inline-flex items-center gap-1"
                          style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 12 }}
                        >
                          <UserIcon size={11} />
                          {formatUser(r.changedByUser)}
                        </p>
                      )}
                      {r.triggeringDocumentTypes.length > 0 && (
                        <div
                          className="mt-2 p-2 rounded"
                          style={{
                            background: 'rgba(239, 68, 68, 0.06)',
                            border: '1px solid rgba(239, 68, 68, 0.18)',
                          }}
                        >
                          <p
                            className="text-[var(--text-secondary)] mb-1"
                            style={{
                              fontFamily: 'var(--font-ibm-plex-mono), monospace',
                              fontSize: 10,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Documentos disparadores
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {r.triggeringDocumentTypes.map((d) => (
                              <span
                                key={d.id}
                                className="cfg-chip"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  color: '#b91c1c',
                                }}
                              >
                                {d.code}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-[var(--border-color)] sticky bottom-0 bg-[var(--bg-card)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
          >
            Cerrar
          </button>
        </div>

        <style jsx global>{`
          .ash-timeline {
            list-style: none;
            margin: 0;
            padding: 0;
          }
          .ash-item {
            display: flex;
            gap: 14px;
            position: relative;
          }
          .ash-item + .ash-item {
            margin-top: 10px;
          }
          .ash-marker {
            position: relative;
            flex-shrink: 0;
            width: 32px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .ash-dot {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
          }
          .ash-line {
            position: absolute;
            top: 28px;
            bottom: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 2px;
            background: var(--border-color);
          }
          .ash-card {
            flex: 1;
            border: 1px solid var(--border-color);
            background: var(--bg-card);
            border-radius: 10px;
            padding: 10px 12px;
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
      </div>
    </div>
  );
}

function formatUser(u: UserSummary): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return fullName || u.email;
}

export default AssetStatusHistoryModal;
