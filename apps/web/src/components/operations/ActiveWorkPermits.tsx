'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface WorkPermitRow {
  id: string;
  permitNumber: string;
  title: string;
  status:
    | 'DRAFT'
    | 'PENDING_AUTHORIZATION'
    | 'AUTHORIZED'
    | 'IN_EXECUTION'
    | 'SUSPENDED'
    | 'CLOSED'
    | 'CANCELLED'
    | 'EXPIRED';
  plannedEnd: string;
  permitType: { code: string; color?: string | null };
  asset?: { id: string } | null;
}

/* OPS-025 — compact card for asset detail pages. Shows IN_EXECUTION
   work permits for this asset so site supervisors can spot active
   high-risk tasks at a glance. */
export function ActiveWorkPermits({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<WorkPermitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        assetId,
        limit: '20',
      });
      params.append('status', 'IN_EXECUTION');
      params.append('status', 'AUTHORIZED');
      params.append('status', 'SUSPENDED');
      const res = await apiClient.get<{ data: WorkPermitRow[] }>(
        `/api/operations/work-permits?${params.toString()}`,
      );
      setRows(res.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && rows.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <h3
        className="flex items-center gap-1.5 text-sm mb-3"
        style={{
          fontFamily: 'var(--font-outfit), sans-serif',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        <Wrench size={14} /> Permisos de trabajo activos
      </h3>
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Cargando...</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border-color)] last:border-b-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs flex-shrink-0"
                  style={{
                    background: p.permitType.color
                      ? `${p.permitType.color}22`
                      : 'rgba(100, 116, 139, 0.14)',
                    color: p.permitType.color ?? '#475569',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    fontWeight: 600,
                  }}
                >
                  {p.permitType.code}
                </span>
                <span
                  className="font-mono text-xs"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                >
                  {p.permitNumber}
                </span>
                <span className="text-sm text-[var(--text-primary)] truncate">{p.title}</span>
              </div>
              <Link
                href={`/operaciones/permisos/trabajo/${p.id}`}
                className="p-1 rounded-md hover:bg-gray-100 text-[var(--text-secondary)] flex-shrink-0"
                title="Ver detalle"
              >
                <ChevronRight size={14} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ActiveWorkPermits;
