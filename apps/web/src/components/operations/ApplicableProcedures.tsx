'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Eye,
  FileText,
  HardHat,
  Leaf,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../lib/api';

type ProcedureCategory =
  | 'OPERATION'
  | 'MAINTENANCE'
  | 'EMERGENCY'
  | 'SAFETY'
  | 'QUALITY'
  | 'ENVIRONMENTAL'
  | 'OTHER';

interface ProcedureRow {
  id: string;
  code: string;
  title: string;
  category: ProcedureCategory;
  version: string;
  estimatedReadingMinutes: number | null;
  requiresAcknowledgment: boolean;
}

const CATEGORY_META: Record<
  ProcedureCategory,
  { label: string; color: string; icon: typeof BookOpen }
> = {
  OPERATION: { label: 'Operación', color: '#2563EB', icon: HardHat },
  MAINTENANCE: { label: 'Mantenimiento', color: '#64748B', icon: BookOpen },
  EMERGENCY: { label: 'Emergencia', color: '#EF4444', icon: AlertTriangle },
  SAFETY: { label: 'Seguridad', color: '#EAB308', icon: ShieldCheck },
  QUALITY: { label: 'Calidad', color: '#A855F7', icon: Sparkles },
  ENVIRONMENTAL: { label: 'Ambiental', color: '#22C55E', icon: Leaf },
  OTHER: { label: 'Otro', color: '#475569', icon: FileText },
};

/* OPS-027 — compact card for asset detail pages. Lists PUBLISHED
   procedures whose applicability matches this asset. The "Marcar
   como leído" button is a placeholder for OPS-028. */
export function ApplicableProcedures({ assetId }: { assetId: string }) {
  const [rows, setRows] = useState<ProcedureRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<ProcedureRow[]>(
        `/api/operations/procedures/applicable?assetId=${encodeURIComponent(assetId)}`,
      );
      setRows(data ?? []);
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
        <BookOpen size={14} /> Procedimientos aplicables
      </h3>
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Cargando...</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((p) => {
            const meta = CATEGORY_META[p.category];
            const Icon = meta.icon;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border-color)] last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={14} style={{ color: meta.color, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <Link
                      href={`/operaciones/procedimientos/${p.id}`}
                      className="text-sm text-blue-600 hover:underline truncate block"
                      style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 500 }}
                    >
                      {p.title}
                    </Link>
                    <div
                      className="text-xs text-[var(--text-muted)]"
                      style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                    >
                      {p.code} · v{p.version}
                      {p.estimatedReadingMinutes ? ` · ${p.estimatedReadingMinutes} min` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {p.requiresAcknowledgment && (
                    <button
                      disabled
                      title="Disponible en OPS-028"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs opacity-60"
                      style={{
                        background: 'rgba(249, 115, 22, 0.14)',
                        color: '#c2410c',
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 500,
                      }}
                    >
                      <Eye size={11} /> Marcar como leído
                    </button>
                  )}
                  <Link
                    href={`/operaciones/procedimientos/${p.id}`}
                    className="p-1 rounded-md hover:bg-gray-100 text-[var(--text-secondary)]"
                    title="Ver procedimiento"
                  >
                    <ChevronRight size={14} />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ApplicableProcedures;
