'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { ACTIVITY_TYPE_LABELS, ActivityTypeIcon } from './activityLabels';
import {
  ActivityFormModal,
  type ActivityForForm,
  type OpportunityOption,
} from './ActivityFormModal';

/* COM-008 — the CRM interaction timeline, self-loading and reused on both surfaces:
 *  - scope='account'   → the account's whole history (incl. its opportunities'), with
 *    an optional opportunity link per entry (select in the modal) and the linked
 *    opportunity's name shown + linked on each entry.
 *  - scope='opportunity' → only that opportunity's activities; new entries derive the
 *    account (no pickers).
 * Ability-driven: `canWrite` gates Registrar / Editar / Eliminar. System-generated
 * entries (none exist yet — COM-009) render WITHOUT actions. 4-state machine mirrors
 * AccountContactsTab. */

interface Activity {
  id: string;
  accountId: string;
  opportunityId: string | null;
  type: string;
  subject: string;
  detail: string | null;
  activityDate: string;
  isSystemGenerated: boolean;
  createdBy: string;
  createdAt: string;
}
interface UserOpt {
  id: string;
  firstName: string;
  lastName: string;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActivityTimeline({
  scope,
  scopeId,
  canWrite,
}: {
  scope: 'account' | 'opportunity';
  scopeId: string;
  canWrite: boolean;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityForForm | null>(null);

  const query = scope === 'account' ? `accountId=${scopeId}` : `opportunityId=${scopeId}`;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<Activity[]>(`/api/comercial/activities?${query}`);
      setActivities(rows);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // Account scope: load the account's opportunities (modal select + entry link names).
  useEffect(() => {
    if (scope !== 'account') return;
    apiClient
      .get<OpportunityOption[]>(`/api/comercial/opportunities?accountId=${scopeId}`)
      .then(setOpportunities)
      .catch(() => setOpportunities([]));
  }, [scope, scopeId]);

  // Resolve who logged each entry (degrades to a short UUID for non-admins).
  useEffect(() => {
    apiClient
      .get<UserOpt[]>('/api/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  const usersById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, `${u.firstName} ${u.lastName}`.trim()));
    return m;
  }, [users]);
  const oppsById = useMemo(() => {
    const m = new Map<string, string>();
    opportunities.forEach((o) => m.set(o.id, o.name));
    return m;
  }, [opportunities]);

  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async (a: Activity) => {
    if (!window.confirm(`¿Eliminar la actividad "${a.subject}"?`)) return;
    try {
      await apiClient.delete(`/api/comercial/activities/${a.id}`);
      await load();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : 'No se pudo eliminar la actividad.');
    }
  };

  const RegisterButton = canWrite ? (
    <div className="flex justify-end">
      <button
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
        style={{ background: '#2563eb' }}
      >
        <Plus size={15} /> Registrar actividad
      </button>
    </div>
  ) : null;

  if (state === 'loading') return <Card>Cargando actividad…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver la actividad.
        </p>
      </Card>
    );
  if (state === 'error')
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudo cargar la actividad.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {RegisterButton}

      {activities.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            No hay actividad registrada todavía.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => {
            const long = (a.detail?.length ?? 0) > 140;
            const isOpen = expanded.has(a.id);
            const who = usersById.get(a.createdBy) ?? a.createdBy.slice(0, 8);
            const linkedName = a.opportunityId ? oppsById.get(a.opportunityId) : null;
            return (
              <div
                key={a.id}
                className="flex gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
              >
                <ActivityTypeIcon type={a.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                          {ACTIVITY_TYPE_LABELS[a.type] ?? a.type}
                        </span>
                        {a.isSystemGenerated && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: 'rgba(100,116,139,0.14)', color: '#475569' }}
                          >
                            Sistema
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                        {a.subject}
                      </p>
                    </div>
                    {/* Actions: writers, manual entries only. */}
                    {canWrite && !a.isSystemGenerated && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing({
                              id: a.id,
                              type: a.type,
                              subject: a.subject,
                              detail: a.detail,
                              activityDate: a.activityDate,
                              opportunityId: a.opportunityId,
                            });
                            setModalOpen(true);
                          }}
                          className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => remove(a)}
                          className="rounded-md border border-[var(--border-color)] p-1 text-red-600 hover:bg-red-50"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {a.detail && (
                    <div className="mt-1">
                      <p
                        className={`whitespace-pre-wrap text-sm text-[var(--text-secondary)]${
                          long && !isOpen ? ' line-clamp-2' : ''
                        }`}
                      >
                        {a.detail}
                      </p>
                      {long && (
                        <button
                          onClick={() => toggle(a.id)}
                          className="mt-0.5 text-xs font-medium"
                          style={{ color: '#2563eb' }}
                        >
                          {isOpen ? 'Ver menos' : 'Ver más'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
                    <span>{formatDateTime(a.activityDate)}</span>
                    <span>·</span>
                    <span>por {who}</span>
                    {/* In account scope, show the linked opportunity (link to its detail). */}
                    {scope === 'account' && a.opportunityId && (
                      <>
                        <span>·</span>
                        <Link
                          href={`/comercial/pipeline/${a.opportunityId}`}
                          className="hover:underline"
                          style={{ color: '#2563eb' }}
                        >
                          {linkedName ?? 'Oportunidad'}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <ActivityFormModal
          scope={scope}
          accountId={scope === 'account' ? scopeId : undefined}
          opportunityId={scope === 'opportunity' ? scopeId : undefined}
          opportunities={opportunities}
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

export default ActivityTimeline;
