'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Clock, Minus, ShieldAlert, XCircle } from 'lucide-react';
import { apiClient } from '../../lib/api';

type ApprovalActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

interface ApprovalRow {
  id: string;
  stepOrder: number;
  stepName: string;
  status: ApprovalActionStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  notes: string | null;
  signatureHash: string | null;
  approvalStep: {
    id: string;
    name: string;
    description: string | null;
    requiredRoles: string[];
    requiresSpecificUserId: string | null;
    isOptional: boolean;
    mustBeDifferentFromRequester: boolean;
    mustBeDifferentFromPreviousApprovers: boolean;
  };
}

export type PermitTargetKind = 'work-permit' | 'external-permit';

interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Props {
  permitId: string;
  kind: PermitTargetKind;
  /* Bumped by the parent after a successful approve/reject so the
     timeline refetches without remounting. */
  refreshKey?: number;
  /* Optional pre-fetched user list — avoids duplicate `/api/users`
     calls when the parent already has the data. */
  users?: UserSummary[];
}

const STATUS_META: Record<
  ApprovalActionStatus,
  { color: string; bg: string; label: string; icon: typeof CheckCircle2 }
> = {
  PENDING: {
    color: '#a16207',
    bg: 'rgba(234, 179, 8, 0.16)',
    label: 'Pendiente',
    icon: Clock,
  },
  APPROVED: {
    color: '#15803d',
    bg: 'rgba(34, 197, 94, 0.16)',
    label: 'Aprobado',
    icon: CheckCircle2,
  },
  REJECTED: {
    color: '#b91c1c',
    bg: 'rgba(239, 68, 68, 0.16)',
    label: 'Rechazado',
    icon: XCircle,
  },
  SKIPPED: {
    color: '#475569',
    bg: 'rgba(100, 116, 139, 0.18)',
    label: 'Omitido',
    icon: Minus,
  },
};

/* OPS-026 — vertical chain of approval steps for one permit. Used in
   both work-permit and external-permit detail pages. Pulls from
   /api/operations/permit-approvals/permit/:id, which also returns
   the step definition so we can render gaps when a chain hasn't been
   initialised yet (e.g., DRAFT permits). */
export function PermitApprovalTimeline({ permitId, kind, refreshKey, users }: Props) {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUsers, setResolvedUsers] = useState<UserSummary[]>(users ?? []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ApprovalRow[]>(
        `/api/operations/permit-approvals/permit/${permitId}?kind=${kind}`,
      );
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cadena de aprobación.');
    } finally {
      setLoading(false);
    }
  }, [permitId, kind]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  /* Lazy load users only when the parent didn't supply them. */
  useEffect(() => {
    if (users && users.length > 0) {
      setResolvedUsers(users);
      return;
    }
    apiClient
      .get<UserSummary[]>('/api/users')
      .then((u) => setResolvedUsers(u))
      .catch(() => undefined);
  }, [users]);

  const userById = useCallback(
    (id: string | null) => (id ? (resolvedUsers.find((u) => u.id === id) ?? null) : null),
    [resolvedUsers],
  );

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Cargando cadena de aprobación...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Aún no se ha iniciado la cadena de aprobación para este permiso. Se generará automáticamente
        al enviarlo a autorización.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {rows.map((row, idx) => {
        const meta = STATUS_META[row.status];
        const Icon = meta.icon;
        const approver = userById(row.approvedBy ?? row.rejectedBy);
        return (
          <li key={row.id} className="flex items-stretch gap-3">
            {/* Connector + dot */}
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

            {/* Card */}
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
                  style={{
                    fontFamily: 'var(--font-outfit), sans-serif',
                    fontWeight: 600,
                  }}
                >
                  Paso {row.stepOrder}: {row.stepName}
                </div>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{
                    background: meta.bg,
                    color: meta.color,
                    fontFamily: 'var(--font-outfit), sans-serif',
                    fontWeight: 600,
                  }}
                >
                  {meta.label}
                </span>
              </div>

              <div className="text-xs text-[var(--text-secondary)] mt-1">
                Roles: {row.approvalStep.requiredRoles.join(', ') || '—'}
                {row.approvalStep.requiresSpecificUserId && (
                  <span className="ml-2 text-[var(--text-muted)]">
                    · Usuario específico requerido
                  </span>
                )}
              </div>

              {row.status === 'APPROVED' && approver && row.approvedAt && (
                <div className="mt-2 text-xs">
                  <span className="text-[var(--text-secondary)]">
                    {approver.firstName} {approver.lastName}
                  </span>
                  <span className="text-[var(--text-muted)] ml-1">
                    · {formatDateTime(row.approvedAt)}
                  </span>
                  {row.notes && (
                    <p className="mt-1 text-[var(--text-primary)] italic">"{row.notes}"</p>
                  )}
                </div>
              )}

              {row.status === 'REJECTED' && approver && row.rejectedAt && (
                <div className="mt-2 text-xs">
                  <span className="text-[var(--text-secondary)]">
                    {approver.firstName} {approver.lastName}
                  </span>
                  <span className="text-[var(--text-muted)] ml-1">
                    · {formatDateTime(row.rejectedAt)}
                  </span>
                  {row.notes && <p className="mt-1 text-red-700 italic">"{row.notes}"</p>}
                </div>
              )}

              {row.status === 'SKIPPED' && row.notes && (
                <p className="mt-2 text-xs text-[var(--text-muted)] italic">{row.notes}</p>
              )}

              {row.status === 'PENDING' && (
                <div className="mt-2 text-xs flex items-center gap-1 text-yellow-700">
                  <ShieldAlert size={12} /> Esperando aprobación de:{' '}
                  {row.approvalStep.requiredRoles.join(', ') || 'usuario asignado'}
                </div>
              )}

              {row.signatureHash && (
                <div
                  className="mt-2 text-[10px] text-[var(--text-muted)]"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    wordBreak: 'break-all',
                  }}
                  title="SHA-256 firma digital"
                >
                  <ClipboardCheck size={10} className="inline mr-1" />
                  sig: {row.signatureHash}
                </div>
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

export default PermitApprovalTimeline;
