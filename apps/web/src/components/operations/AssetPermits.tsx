'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Plus, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { PermitUploadModal } from './PermitUploadModal';
import { DocumentStatusBadge, type DerivedDocumentStatus } from './DocumentStatusBadge';
import { formatDate } from '../../lib/formatters';

type PermitStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'ARCHIVED';

interface PermitRow {
  id: string;
  permitNumber: string;
  issuingAuthority?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  status: PermitStatus;
  derivedStatus: DerivedDocumentStatus;
  fileName?: string | null;
  version: number;
  permitType: {
    id: string;
    name: string;
    code: string;
    color?: string | null;
    hasExpiration: boolean;
  };
}

interface Props {
  assetId: string;
}

/* OPS-024 — compact permit list embedded in the asset detail page.
   Lists active (non-replaced) permits whose target is this asset and
   exposes a "Cargar permiso" CTA that opens PermitUploadModal pre-pinned
   to the current asset. */
export function AssetPermits({ assetId }: Props) {
  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ assetId, limit: '50' });
      const result = await apiClient.get<{ data: PermitRow[] }>(
        `/api/operations/permits?${params.toString()}`,
      );
      const items = result.data ?? [];
      /* Filter REPLACED versions from the active view — versions are reachable
         through the history modal in the central permits page. */
      setPermits(items.filter((p) => p.status !== 'REPLACED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los permisos.');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const triggerDownload = async (p: PermitRow) => {
    try {
      const blob = await apiClient.fetchBlob(`/api/operations/permits/${p.id}/file?download=1`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = p.fileName ?? `${p.permitType.code}-${p.permitNumber}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el archivo.');
    }
  };

  return (
    <>
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--text-primary)',
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={14} /> Permisos asociados
          </h3>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white rounded-full"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <Plus size={12} /> Cargar permiso
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
            Cargando permisos...
          </p>
        ) : error ? (
          <p className="text-sm text-red-600" style={{ padding: '8px 0' }}>
            {error}
          </p>
        ) : permits.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]" style={{ padding: '8px 0' }}>
            Aún no hay permisos asociados a este activo. Usa "Cargar permiso" para registrar el
            primero.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="req-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>N° permiso</th>
                  <th>Autoridad</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span
                        className="req-chip"
                        style={{
                          background: p.permitType.color
                            ? `${p.permitType.color}22`
                            : 'rgba(100, 116, 139, 0.14)',
                          color: p.permitType.color ?? '#475569',
                        }}
                        title={p.permitType.name}
                      >
                        {p.permitType.code}
                      </span>
                    </td>
                    <td
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                        fontSize: 12,
                      }}
                    >
                      {p.permitNumber}
                      {p.version > 1 && (
                        <span
                          className="req-chip ml-2"
                          style={{
                            background: 'rgba(100, 116, 139, 0.14)',
                            color: '#475569',
                            fontSize: 9,
                          }}
                        >
                          v{p.version}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.issuingAuthority ? (
                        <span style={{ fontSize: 13 }}>{p.issuingAuthority}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td>
                      {p.expirationDate ? (
                        <span style={{ fontSize: 13 }}>{formatDate(p.expirationDate)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td>
                      <DocumentStatusBadge status={p.derivedStatus} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {p.fileName && (
                        <button
                          onClick={() => triggerDownload(p)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                          title="Descargar"
                        >
                          <Download size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploadOpen && (
        <PermitUploadModal
          defaultAssetId={assetId}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

export default AssetPermits;
