'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowRight, CheckCircle2, Edit, Eye, Plus, Undo2 } from 'lucide-react';
import { apiClient } from '../../lib/api';

type RevisionType =
  | 'CREATED'
  | 'UPDATED'
  | 'REVIEWED'
  | 'PUBLISHED'
  | 'SUPERSEDED'
  | 'DEPRECATED'
  | 'RESTORED';

interface Revision {
  id: string;
  revisionType: RevisionType;
  changedBy: string;
  changeNotes: string | null;
  previousData: unknown;
  newData: unknown;
  createdAt: string;
}

interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const META: Record<RevisionType, { label: string; color: string; bg: string; icon: typeof Plus }> =
  {
    CREATED: {
      label: 'Creado',
      color: '#1d4ed8',
      bg: 'rgba(37, 99, 235, 0.14)',
      icon: Plus,
    },
    UPDATED: {
      label: 'Editado',
      color: '#475569',
      bg: 'rgba(100, 116, 139, 0.16)',
      icon: Edit,
    },
    REVIEWED: {
      label: 'Revisado',
      color: '#a16207',
      bg: 'rgba(234, 179, 8, 0.16)',
      icon: Eye,
    },
    PUBLISHED: {
      label: 'Publicado',
      color: '#15803d',
      bg: 'rgba(34, 197, 94, 0.16)',
      icon: CheckCircle2,
    },
    SUPERSEDED: {
      label: 'Reemplazado',
      color: '#475569',
      bg: 'rgba(100, 116, 139, 0.16)',
      icon: ArrowRight,
    },
    DEPRECATED: {
      label: 'Deprecado',
      color: '#b91c1c',
      bg: 'rgba(239, 68, 68, 0.14)',
      icon: Archive,
    },
    RESTORED: {
      label: 'Restaurado',
      color: '#1d4ed8',
      bg: 'rgba(37, 99, 235, 0.14)',
      icon: Undo2,
    },
  };

interface Props {
  procedureId: string;
  /* Bumped by the parent after a successful workflow action so the
     timeline refetches without a full remount. */
  refreshKey?: number;
  users?: UserSummary[];
}

/* OPS-027 — vertical timeline of every ProcedureRevision row for a
   given procedure. Designed for the bottom of the detail page. */
export function ProcedureRevisionsTimeline({ procedureId, refreshKey, users }: Props) {
  const [rows, setRows] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<UserSummary[]>(users ?? []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Revision[]>(
        `/api/operations/procedures/${procedureId}/revisions`,
      );
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, [procedureId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (users && users.length > 0) {
      setResolved(users);
      return;
    }
    apiClient
      .get<UserSummary[]>('/api/users')
      .then((u) => setResolved(u))
      .catch(() => undefined);
  }, [users]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Cargando historial...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Sin revisiones registradas.</p>;
  }

  return (
    <ol className="space-y-3">
      {rows.map((row, idx) => {
        const meta = META[row.revisionType];
        const Icon = meta.icon;
        const author = resolved.find((u) => u.id === row.changedBy);
        const isExpanded = expanded.has(row.id);
        const hasDetails = Boolean(row.previousData) || Boolean(row.newData);
        return (
          <li key={row.id} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center" style={{ width: 22 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: meta.bg,
                  color: meta.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={12} />
              </div>
              {idx < rows.length - 1 && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    background: 'var(--border-color)',
                    marginTop: 2,
                  }}
                />
              )}
            </div>
            <div
              className="flex-1 rounded-lg p-3"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div
                  className="text-sm text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 600 }}
                >
                  {meta.label}
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatDateTime(row.createdAt)}
                </span>
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                {author ? `${author.firstName} ${author.lastName}` : row.changedBy}
              </div>
              {row.changeNotes && (
                <p className="mt-2 text-sm italic text-[var(--text-primary)]">
                  "{row.changeNotes}"
                </p>
              )}
              {hasDetails && (
                <button
                  onClick={() => toggle(row.id)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              )}
              {isExpanded && hasDetails && (
                <pre
                  className="mt-2 text-[10px] p-2 rounded"
                  style={{
                    background: 'var(--input-bg)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    overflowX: 'auto',
                    maxHeight: 200,
                  }}
                >
                  {JSON.stringify({ previous: row.previousData, current: row.newData }, null, 2)}
                </pre>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export default ProcedureRevisionsTimeline;
