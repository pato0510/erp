'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { canPreviewInline, getFileIcon } from '../../lib/file-icons';
import { DocumentStatusBadge, type DerivedDocumentStatus } from './DocumentStatusBadge';

interface Props {
  documentId: string;
  /* Used for the header — passed from the caller so we don't re-fetch the
     full record just for display metadata. */
  fileName: string;
  mimeType: string;
  documentTypeName: string;
  assetCode: string;
  assetName: string;
  derivedStatus: DerivedDocumentStatus;
  version: number;
  onClose: () => void;
}

export function DocumentPreviewModal({
  documentId,
  fileName,
  mimeType,
  documentTypeName,
  assetCode,
  assetName,
  derivedStatus,
  version,
  onClose,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const previewKind = canPreviewInline(mimeType);

  useEffect(() => {
    let alive = true;
    let createdUrl: string | null = null;
    /* Fetch via apiClient.fetchBlob so the auth headers are sent. The browser
       can't put cookies on an <iframe src> request that crosses origins, so we
       proxy through fetch and create a blob URL. */
    apiClient
      .fetchBlob(`/api/operations/documents/${documentId}/file`)
      .then((blob) => {
        if (!alive) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el archivo.');
        setLoading(false);
      });
    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [documentId]);

  const triggerDownload = async () => {
    try {
      const blob = await apiClient.fetchBlob(
        `/api/operations/documents/${documentId}/file?download=1`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el archivo.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full flex flex-col"
        style={{ maxWidth: 960, height: 'min(92vh, 800px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-color)]">
          {getFileIcon(mimeType, { size: 22 })}
          <div className="flex-1 min-w-0">
            <h3
              className="text-[var(--text-primary)] truncate"
              style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 600,
                fontSize: 15,
              }}
              title={fileName}
            >
              {documentTypeName} ·{' '}
              <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                {assetCode}
              </span>{' '}
              · {assetName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-[var(--text-muted)] truncate"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 11,
                }}
              >
                {fileName}
              </span>
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full"
                style={{
                  background: 'rgba(100, 116, 139, 0.14)',
                  color: '#475569',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                v{version}
              </span>
              <DocumentStatusBadge status={derivedStatus} />
            </div>
          </div>
          <button
            onClick={triggerDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            <Download size={12} /> Descargar
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden" style={{ background: 'var(--input-bg)' }}>
          {loading && (
            <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
              Cargando vista previa...
            </div>
          )}
          {!loading && error && (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
              <FileText size={32} className="text-gray-300" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {!loading && !error && blobUrl && previewKind === 'pdf' && (
            <iframe
              src={blobUrl}
              title={fileName}
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          )}
          {!loading && !error && blobUrl && previewKind === 'image' && (
            <div className="h-full flex items-center justify-center p-4">
              <img
                src={blobUrl}
                alt={fileName}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          )}
          {!loading && !error && previewKind === 'none' && (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              {getFileIcon(mimeType, { size: 36 })}
              <p
                className="text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                Vista previa no disponible.
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Descarga el archivo para verlo en su aplicación correspondiente.
              </p>
              <button
                onClick={triggerDownload}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-full text-white"
                style={{
                  background: '#1C1C1E',
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 500,
                }}
              >
                <Download size={14} /> Descargar archivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentPreviewModal;
