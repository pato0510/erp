'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileImage, FileText, QrCode, RefreshCw, Sparkles } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatRelativeDate } from '../../lib/formatters';

/* OPS-035 — drop-in section for the asset detail pages (equipos
   and vehiculos). Generates / displays / downloads a per-asset QR
   that resolves to a public verification URL. Token rotation is
   admin-only and prompts a confirmation modal because it
   invalidates every printed sticker for this asset. */

interface AssetQrSectionAsset {
  id: string;
  code: string;
  qrToken?: string | null;
  qrGeneratedAt?: string | null;
  qrLastScannedAt?: string | null;
  qrScanCount?: number | null;
}

interface Props {
  asset: AssetQrSectionAsset;
  isAdmin: boolean;
  onChange?: () => void;
  /* Pluggable toast — both detail pages already render a Toast at
     the page level. We accept their notifier so feedback shows up
     where the user expects. */
  toaster?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface EnsureResponse {
  qrToken: string;
  publicUrl: string;
}

export function AssetQrSection({ asset, isAdmin, onChange, toaster }: Props) {
  const [token, setToken] = useState<string | null>(asset.qrToken ?? null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(asset.qrGeneratedAt ?? null);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(asset.qrLastScannedAt ?? null);
  const [scanCount, setScanCount] = useState<number>(asset.qrScanCount ?? 0);
  const [generating, setGenerating] = useState(false);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  /* Re-sync when the parent reloads the asset (e.g. after status
     change). Without this, the QR section would keep showing the
     pre-load snapshot. */
  useEffect(() => {
    setToken(asset.qrToken ?? null);
    setGeneratedAt(asset.qrGeneratedAt ?? null);
    setLastScannedAt(asset.qrLastScannedAt ?? null);
    setScanCount(asset.qrScanCount ?? 0);
  }, [asset.qrToken, asset.qrGeneratedAt, asset.qrLastScannedAt, asset.qrScanCount]);

  const notify = useCallback(
    (message: string, type: 'success' | 'error' | 'info') => {
      if (toaster) toaster(message, type);
    },
    [toaster],
  );

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await apiClient.post<EnsureResponse>(`/api/operations/assets/${asset.id}/qr`);
      setToken(res.qrToken);
      setGeneratedAt(new Date().toISOString());
      setScanCount(0);
      setLastScannedAt(null);
      notify('Código QR generado', 'success');
      onChange?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error generando QR', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await apiClient.post<EnsureResponse>(
        `/api/operations/assets/${asset.id}/qr/regenerate`,
      );
      setToken(res.qrToken);
      setGeneratedAt(new Date().toISOString());
      setScanCount(0);
      setLastScannedAt(null);
      notify('QR regenerado — el anterior quedó invalidado', 'success');
      setConfirmRegenOpen(false);
      onChange?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error regenerando QR', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownload = async (kind: 'png' | 'svg' | 'pdf') => {
    try {
      const path =
        kind === 'pdf'
          ? `/api/operations/assets/${asset.id}/qr.pdf?size=10cm`
          : `/api/operations/assets/${asset.id}/qr.${kind}`;
      const blob = await apiClient.fetchBlob(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = kind === 'pdf' ? `etiqueta-${asset.code}.pdf` : `qr-${asset.code}.${kind}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error descargando archivo', 'error');
    }
  };

  return (
    <div className="card-qr-wrap">
      <div className="card-qr-head">
        <h3 className="card-qr-title">
          <QrCode size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
          Código QR
        </h3>
        <p className="card-qr-sub">
          Para verificación en terreno. Cualquiera con el código accede a una ficha pública con el
          estado actual del activo.
        </p>
      </div>

      {!token ? (
        <div className="card-qr-empty">
          <p className="text-sm text-[var(--text-secondary)]">
            Este activo aún no tiene un código QR.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="card-qr-btn-primary"
          >
            <Sparkles size={14} />
            {generating ? 'Generando...' : 'Generar código QR'}
          </button>
        </div>
      ) : (
        <>
          <QrPreview assetId={asset.id} cacheKey={token} />

          <div className="card-qr-meta">
            {generatedAt && (
              <div>
                Generado{' '}
                <span style={{ color: 'var(--text-primary)' }}>
                  {formatRelativeDate(generatedAt)}
                </span>
              </div>
            )}
            {lastScannedAt ? (
              <div>
                Último escaneo{' '}
                <span style={{ color: 'var(--text-primary)' }}>
                  {formatRelativeDate(lastScannedAt)}
                </span>
              </div>
            ) : (
              <div>Sin escaneos aún.</div>
            )}
            <div>
              Escaneado <span style={{ color: 'var(--text-primary)' }}>{scanCount}</span> vez
              {scanCount === 1 ? '' : 'ces'}
            </div>
          </div>

          <div className="card-qr-actions">
            <button
              type="button"
              onClick={() => handleDownload('png')}
              className="card-qr-btn-ghost"
              title="Descargar como imagen PNG"
            >
              <FileImage size={14} /> PNG
            </button>
            <button
              type="button"
              onClick={() => handleDownload('svg')}
              className="card-qr-btn-ghost"
              title="Descargar como SVG escalable"
            >
              <Download size={14} /> SVG
            </button>
            <button
              type="button"
              onClick={() => handleDownload('pdf')}
              className="card-qr-btn-ghost"
              title="Descargar etiqueta PDF imprimible (10×10 cm)"
            >
              <FileText size={14} /> Etiqueta PDF
            </button>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setConfirmRegenOpen(true)}
              className="card-qr-btn-danger"
            >
              <RefreshCw size={13} /> Regenerar QR
            </button>
          )}
        </>
      )}

      {confirmRegenOpen && (
        <RegenerateModal
          assetCode={asset.code}
          regenerating={regenerating}
          onConfirm={handleRegenerate}
          onCancel={() => setConfirmRegenOpen(false)}
        />
      )}

      <style jsx>{`
        .card-qr-wrap {
          background: var(--bg-card);
          border: 0.5px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
        }
        :global(html.dark) .card-qr-wrap {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .card-qr-head {
          margin-bottom: 14px;
        }
        .card-qr-title {
          font-family: var(--font-outfit), sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
          margin: 0 0 4px;
        }
        .card-qr-sub {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }
        .card-qr-empty {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }
        .card-qr-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 999px;
          background: #1c1c1e;
          color: #fff;
          font-family: var(--font-outfit), sans-serif;
          font-size: 13px;
          font-weight: 500;
          border: none;
          cursor: pointer;
          transition: opacity 120ms ease;
        }
        .card-qr-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .card-qr-meta {
          margin-top: 12px;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.7;
        }
        .card-qr-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 14px;
        }
        .card-qr-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.08);
          color: #1d4ed8;
          font-family: var(--font-outfit), sans-serif;
          font-size: 12px;
          font-weight: 500;
          border: none;
          cursor: pointer;
          transition: background 120ms ease;
        }
        .card-qr-btn-ghost:hover {
          background: rgba(37, 99, 235, 0.16);
        }
        .card-qr-btn-danger {
          margin-top: 12px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          background: transparent;
          color: #b91c1c;
          font-family: var(--font-outfit), sans-serif;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid rgba(239, 68, 68, 0.35);
          cursor: pointer;
        }
        .card-qr-btn-danger:hover {
          background: rgba(239, 68, 68, 0.08);
        }
      `}</style>
    </div>
  );
}

/* QR preview — pulls the SVG via fetchBlob (forwards cookies) and
   renders it from a blob URL. Re-fetches whenever cacheKey
   changes (i.e. token rotation), without inadvertently caching the
   prior token's image. */
function QrPreview({ assetId, cacheKey }: { assetId: string; cacheKey: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const blob = await apiClient.fetchBlob(`/api/operations/assets/${assetId}/qr.svg`);
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = url;
        setSrc(url);
      } catch {
        setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId, cacheKey]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '1 / 1',
        maxWidth: 220,
      }}
      aria-label="Vista previa del código QR"
    >
      {src ? (
        <img
          src={src}
          alt="Código QR del activo"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 4,
            animation: 'pulse 1.4s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

function RegenerateModal({
  assetCode,
  regenerating,
  onConfirm,
  onCancel,
}: {
  assetCode: string;
  regenerating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-qr-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          maxWidth: 460,
          width: '100%',
          padding: 22,
        }}
      >
        <h2
          id="regen-qr-title"
          style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontWeight: 600,
            fontSize: 16,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
          }}
        >
          Regenerar código QR
        </h2>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: '0 0 14px',
          }}
        >
          Vas a invalidar el código actual del activo{' '}
          <strong style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
            {assetCode}
          </strong>
          . Cualquier etiqueta física con el QR anterior dejará de funcionar y deberá ser
          reemplazada. El contador de escaneos se reinicia.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={regenerating}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={regenerating}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: '#b91c1c',
              border: 'none',
              color: '#ffffff',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: regenerating ? 0.5 : 1,
            }}
          >
            {regenerating ? 'Regenerando...' : 'Confirmar regeneración'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssetQrSection;
