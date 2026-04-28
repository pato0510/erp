'use client';

import { useEffect, useState } from 'react';
import { Download, Eye, History, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { getFileIcon } from '../../lib/file-icons';
import { formatDate, formatRelativeDate } from '../../lib/formatters';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DocumentStatusBadge, type DerivedDocumentStatus } from './DocumentStatusBadge';

interface UserSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface VersionEntry {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  issueDate?: string | null;
  expirationDate?: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';
  statusReason?: string | null;
  statusChangedAt?: string | null;
  version: number;
  createdAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  replacedByDocumentId?: string | null;
  derivedStatus: DerivedDocumentStatus;
  uploader?: UserSummary | null;
  approver?: UserSummary | null;
  rejecter?: UserSummary | null;
  documentType: { id: string; name: string; code: string };
}

interface Props {
  assetId: string;
  documentTypeId: string;
  documentTypeName: string;
  assetCode: string;
  assetName: string;
  onClose: () => void;
}

/* OPS-016 — version history modal. Renders the full chain of records for a
   given (asset, documentType) pair as a timeline, newest at the top. Each
   entry shows file metadata, who uploaded/approved/rejected, and (if
   REPLACED) the version that replaced it. Items can be previewed and
   downloaded inline so auditors don't need to leave the modal. */
export function DocumentHistoryModal({
  assetId,
  documentTypeId,
  documentTypeName,
  assetCode,
  assetName,
  onClose,
}: Props) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<VersionEntry | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setVersions(null);
    apiClient
      .get<VersionEntry[]>(
        `/api/operations/documents/history?assetId=${encodeURIComponent(
          assetId,
        )}&documentTypeId=${encodeURIComponent(documentTypeId)}`,
      )
      .then((data) => {
        if (alive) setVersions(data);
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
        }
      });
    return () => {
      alive = false;
    };
  }, [assetId, documentTypeId]);

  const triggerDownload = async (v: VersionEntry) => {
    try {
      const blob = await apiClient.fetchBlob(`/api/operations/documents/${v.id}/file?download=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = v.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el archivo.');
    }
  };

  /* Index by id so we can resolve "Reemplazado por v…" on REPLACED rows
     without an extra network hop. */
  const versionById = new Map<string, VersionEntry>();
  for (const v of versions ?? []) versionById.set(v.id, v);

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
              <History size={16} /> Historial de versiones — {documentTypeName}
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>

          <div className="p-5">
            {/* Asset reference */}
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

            {!versions && !error && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-lg"
                    style={{ height: 96, background: 'rgba(0,0,0,0.04)' }}
                  />
                ))}
              </div>
            )}

            {versions && versions.length === 0 && (
              <div
                style={{
                  padding: '24px 12px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <History size={28} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                <p className="text-sm">No hay versiones registradas para este documento.</p>
              </div>
            )}

            {versions && versions.length > 0 && (
              <ol className="dh-timeline">
                {versions.map((v, idx) => {
                  const replacedBy =
                    v.status === 'REPLACED' && v.replacedByDocumentId
                      ? versionById.get(v.replacedByDocumentId)
                      : null;
                  return (
                    <li key={v.id} className="dh-item">
                      <div className="dh-marker">
                        <span className="dh-version">v{v.version}</span>
                        {idx !== versions.length - 1 && <span className="dh-line" />}
                      </div>
                      <div className="dh-card">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                          <div className="flex items-center gap-2">
                            <DocumentStatusBadge status={v.derivedStatus} />
                            <span
                              className="text-[var(--text-muted)]"
                              style={{
                                fontFamily: 'var(--font-jetbrains-mono), monospace',
                                fontSize: 11,
                              }}
                            >
                              {formatRelativeDate(v.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPreviewing(v)}
                              className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                              title="Vista previa"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={() => triggerDownload(v)}
                              className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                              title="Descargar"
                            >
                              <Download size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-2">
                          {getFileIcon(v.mimeType, { size: 18 })}
                          <span
                            className="truncate"
                            title={v.fileName}
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {v.fileName}
                          </span>
                          <span
                            className="text-[var(--text-muted)]"
                            style={{
                              fontFamily: 'var(--font-jetbrains-mono), monospace',
                              fontSize: 11,
                            }}
                          >
                            {(v.fileSize / 1024).toFixed(1)} KB
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                          <DhKv
                            label="Emisión"
                            value={v.issueDate ? formatDate(v.issueDate) : '—'}
                          />
                          <DhKv
                            label="Vencimiento"
                            value={
                              v.expirationDate ? formatDate(v.expirationDate) : 'Sin vencimiento'
                            }
                          />
                          <DhKv
                            label="Cargado por"
                            value={v.uploader ? formatUserName(v.uploader) : 'Usuario desconocido'}
                            sub={formatDate(v.createdAt)}
                          />
                          {v.approver && v.approvedAt && (
                            <DhKv
                              label="Aprobado por"
                              value={formatUserName(v.approver)}
                              sub={formatDate(v.approvedAt)}
                            />
                          )}
                          {v.rejecter && v.rejectedAt && (
                            <DhKv
                              label="Rechazado por"
                              value={formatUserName(v.rejecter)}
                              sub={formatDate(v.rejectedAt)}
                            />
                          )}
                        </div>

                        {/* Status-specific footer info */}
                        {v.status === 'REJECTED' && v.statusReason && (
                          <div
                            className="mt-2 p-2 rounded text-[#b91c1c]"
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontSize: 12,
                              background: 'rgba(239, 68, 68, 0.06)',
                              border: '1px solid rgba(239, 68, 68, 0.18)',
                            }}
                          >
                            🔴 Motivo de rechazo: {v.statusReason}
                          </div>
                        )}
                        {v.status === 'REPLACED' && (
                          <div
                            className="mt-2 p-2 rounded"
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontSize: 12,
                              color: '#475569',
                              background: 'rgba(100, 116, 139, 0.08)',
                              border: '1px solid rgba(100, 116, 139, 0.2)',
                            }}
                          >
                            Reemplazado por <strong>v{replacedBy?.version ?? '?'}</strong>
                            {v.statusChangedAt && <> el {formatDate(v.statusChangedAt)}</>}. Esta
                            versión es inmutable.
                          </div>
                        )}
                        {v.status === 'ARCHIVED' && v.statusReason && (
                          <div
                            className="mt-2 p-2 rounded"
                            style={{
                              fontFamily: 'var(--font-outfit), sans-serif',
                              fontSize: 12,
                              color: '#475569',
                              background: 'rgba(100, 116, 139, 0.08)',
                              border: '1px solid rgba(100, 116, 139, 0.2)',
                            }}
                          >
                            Archivado: {v.statusReason}
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
        </div>

        <style jsx global>{`
          .dh-timeline {
            list-style: none;
            margin: 0;
            padding: 0;
          }
          .dh-item {
            display: flex;
            gap: 16px;
            position: relative;
          }
          .dh-item + .dh-item {
            margin-top: 12px;
          }
          .dh-marker {
            position: relative;
            flex-shrink: 0;
            width: 56px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .dh-version {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            border-radius: 999px;
            background: rgba(37, 99, 235, 0.1);
            color: #1d4ed8;
            border: 1px solid rgba(37, 99, 235, 0.3);
            font-family: var(--font-jetbrains-mono), monospace;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.04em;
            z-index: 1;
          }
          .dh-line {
            position: absolute;
            top: 44px;
            bottom: -12px;
            left: 50%;
            transform: translateX(-50%);
            width: 2px;
            background: var(--border-color);
          }
          .dh-card {
            flex: 1;
            border: 1px solid var(--border-color);
            background: var(--bg-card);
            border-radius: 10px;
            padding: 12px 14px;
          }
        `}</style>
      </div>

      {previewing && (
        <DocumentPreviewModal
          documentId={previewing.id}
          fileName={previewing.fileName}
          mimeType={previewing.mimeType}
          documentTypeName={previewing.documentType.name}
          assetCode={assetCode}
          assetName={assetName}
          derivedStatus={previewing.derivedStatus}
          version={previewing.version}
          onClose={() => setPreviewing(null)}
        />
      )}
    </>
  );
}

function DhKv({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
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
        {label}:
      </span>
      <span
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontSize: 12,
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="ml-1 text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: 11 }}
        >
          ({sub})
        </span>
      )}
    </div>
  );
}

function formatUserName(u: UserSummary): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return fullName || u.email;
}

export default DocumentHistoryModal;
