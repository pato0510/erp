'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '../../../../../lib/api';
import { useAuth } from '../../../../../hooks/useAuth';
import { useComercialPermissions } from '../../../../../hooks/useCanWrite';

/* COM-016 — the internal note thread on a deal ("Notas"): free-text notes the team
 * writes ABOUT the opportunity, distinct from the Actividad timeline (dated interactions
 * WITH the client). Self-loading, mutate → refetch (the POST/PATCH body is never used as
 * state). Ability-driven: writes gate on the `opportunityNote` flags from
 * /comercial/permissions (useComercialPermissions — the same hook the page uses for the
 * activity flags). Author-only Editar (update + own); Eliminar on own notes (delete), or on
 * any note when `manageAny` (CASL `manage`, ADMIN/SUPER_ADMIN) — never a role string; the
 * backend enforces both rules regardless of what the UI shows. useAuth supplies ONLY the
 * current user id (own-note detection). Classnames
 * mirror ActivityTimeline verbatim so the UI-001 token sweep treats both sections alike. */

interface OpportunityNote {
  id: string;
  opportunityId: string;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
interface UserOpt {
  id: string;
  firstName: string;
  lastName: string;
}

const MAX_BODY_LENGTH = 5000;
const INPUT =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OpportunityNotes({ opportunityId }: { opportunityId: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [notes, setNotes] = useState<OpportunityNote[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const perms = useComercialPermissions();
  const canCreate = perms?.opportunityNote.create ?? false;
  const canUpdate = perms?.opportunityNote.update ?? false;
  const canDelete = perms?.opportunityNote.delete ?? false;
  const manageAny = perms?.opportunityNote.manageAny ?? false;

  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const rows = await apiClient.get<OpportunityNote[]>(
        `/api/comercial/opportunity-notes?opportunityId=${opportunityId}`,
      );
      setNotes(rows);
      setState('ok');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error');
    }
  }, [opportunityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve who wrote each note (degrades to a short UUID for non-admins) — same
  // helper path as ActivityTimeline.
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

  const trimmedDraft = draft.trim();
  const canSubmit = canCreate && trimmedDraft.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiClient.post('/api/comercial/opportunity-notes', {
        opportunityId,
        body: trimmedDraft,
      });
      setDraft('');
      await load();
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : 'No se pudo agregar la nota.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (n: OpportunityNote) => {
    setEditingId(n.id);
    setEditDraft(n.body);
    setEditError(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
    setEditError(null);
  };
  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    if (body.length === 0 || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      await apiClient.patch(`/api/comercial/opportunity-notes/${id}`, { body });
      cancelEdit();
      await load();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'No se pudo guardar la nota.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: OpportunityNote) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try {
      await apiClient.delete(`/api/comercial/opportunity-notes/${n.id}`);
      if (editingId === n.id) cancelEdit();
      await load();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : 'No se pudo eliminar la nota.');
    }
  };

  const Composer = canCreate ? (
    <div className="space-y-2">
      <label htmlFor={`opportunity-note-draft-${opportunityId}`} className="sr-only">
        Nueva nota
      </label>
      <textarea
        id={`opportunity-note-draft-${opportunityId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={MAX_BODY_LENGTH}
        disabled={submitting}
        className={INPUT}
        placeholder="Escribe una nota interna sobre esta oportunidad…"
      />
      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-accent)' }}
        >
          <Plus size={15} /> {submitting ? 'Agregando…' : 'Agregar nota'}
        </button>
      </div>
    </div>
  ) : null;

  if (state === 'loading') return <Card>Cargando notas…</Card>;
  if (state === 'forbidden')
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">
          No tienes permiso para ver las notas.
        </p>
      </Card>
    );
  if (state === 'error')
    return (
      <Card>
        <p className="text-sm text-red-600">No se pudieron cargar las notas.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {Composer}

      {notes.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            Aún no hay notas en esta oportunidad.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const isOwn = currentUserId !== null && n.createdBy === currentUserId;
            const showEdit = canUpdate && isOwn;
            const showDelete = canDelete && (isOwn || manageAny);
            const isEditing = editingId === n.id;
            const who = usersById.get(n.createdBy) ?? n.createdBy.slice(0, 8);
            const edited = n.updatedAt !== n.createdAt;
            return (
              <div
                key={n.id}
                className="flex gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <label htmlFor={`opportunity-note-edit-${n.id}`} className="sr-only">
                            Editar nota
                          </label>
                          <textarea
                            id={`opportunity-note-edit-${n.id}`}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={3}
                            maxLength={MAX_BODY_LENGTH}
                            disabled={saving}
                            className={INPUT}
                            autoFocus
                          />
                          {editError && (
                            <p role="alert" className="text-sm text-red-600">
                              {editError}
                            </p>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={saving}
                              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEdit(n.id)}
                              disabled={saving || editDraft.trim().length === 0}
                              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                              style={{ background: 'var(--color-accent)' }}
                            >
                              {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {/* Actions: Editar on own notes; Eliminar on own notes or any with manageAny. */}
                    {!isEditing && (showEdit || showDelete) && (
                      <div className="flex shrink-0 items-center gap-1">
                        {showEdit && (
                          <button
                            type="button"
                            onClick={() => startEdit(n)}
                            className="rounded-md border border-[var(--border-color)] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            title="Editar"
                            aria-label="Editar nota"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {showDelete && (
                          <button
                            type="button"
                            onClick={() => remove(n)}
                            className="rounded-md border border-[var(--border-color)] p-1 text-red-600 hover:bg-red-50"
                            title="Eliminar"
                            aria-label="Eliminar nota"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
                    <span>{formatDateTime(n.createdAt)}</span>
                    <span>·</span>
                    <span>por {who}</span>
                    {edited && (
                      <>
                        <span>·</span>
                        <span>editada</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
