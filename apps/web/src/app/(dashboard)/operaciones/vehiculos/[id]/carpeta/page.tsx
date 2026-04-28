'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { apiClient } from '../../../../../../lib/api';
import { AssetFolderView } from '../../../../../../components/operations/AssetFolderView';

interface PageProps {
  params: Promise<{ id: string }>;
}

/* The /operaciones/vehiculos/[id] route uses Vehicle.id in the URL, but the
   folder API works on the underlying OperationalAsset.id. We resolve that
   here so the parent URL convention stays consistent and AssetFolderView
   stays asset-id-only. */
export default function VehiculoCarpetaPage({ params }: PageProps) {
  const { id } = use(params);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .get<{ assetId: string }>(`/api/operations/fleet/vehicles/${id}`)
      .then((v) => {
        if (alive) setAssetId(v.assetId);
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el vehículo.');
        }
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <div
          style={{
            fontFamily: 'var(--font-ibm-plex-mono), monospace',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(0,0,0,0.5)',
            marginBottom: 14,
          }}
        >
          Operaciones / Vehículos / Carpeta documental
        </div>
        <div
          style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border-color)',
            borderRadius: 8,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <FileText size={36} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
          <p
            className="text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
          >
            Vehículo no encontrado
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">{error}</p>
          <Link
            href="/operaciones/vehiculos"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm rounded-full text-white"
            style={{
              background: '#1C1C1E',
              fontFamily: 'var(--font-outfit), sans-serif',
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Volver a vehículos
          </Link>
        </div>
      </div>
    );
  }

  if (!assetId) {
    return (
      <div className="animate-pulse" style={{ padding: 16 }}>
        <div style={{ height: 24, width: 240, background: 'rgba(0,0,0,0.06)', borderRadius: 4 }} />
        <div
          style={{
            height: 220,
            background: 'rgba(0,0,0,0.04)',
            borderRadius: 8,
            marginTop: 16,
          }}
        />
      </div>
    );
  }

  return (
    <AssetFolderView
      assetId={assetId}
      assetKind="vehiculo"
      backHref={`/operaciones/vehiculos/${id}`}
    />
  );
}
