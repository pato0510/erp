'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { useActividadesPermissions } from '../../../../hooks/useActividadesPermissions';

import {
  TodoRowCells,
  Todo,
  Priority,
  Person,
  PRIORITIES,
  nameOf,
  TODOS_CHANGED_EVENT,
} from '../../../../components/actividades/TodoRowCells';

type Assignee = Person & { email: string };
const INPUT =
  'w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg focus-visible:outline-accent';
const BUTTON =
  'rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-subtle-hover disabled:opacity-50 focus-visible:outline-accent';
const PRIMARY =
  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-accent';
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la acción.';
export default function TodosPage() {
  const { user } = useAuth();
  const permissions = useActividadesPermissions();
  const flags = permissions?.todo;
  const companyId = apiClient.getCompanyId();
  const userId = user?.id;
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [status, setStatus] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');
  const [rows, setRows] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState<{ editing: Todo | null } | null>(null);
  const canRead = flags?.read ?? false;
  const canUpdate = flags?.update ?? false;
  const effectiveScope = canUpdate ? scope : 'mine';

  useEffect(() => {
    if (!canRead || !companyId || !userId) return;
    let active = true;
    setLoading(true);
    setRows([]);
    setError(null);
    apiClient
      .get<Todo[]>(`/api/todos?scope=${effectiveScope}&status=${status}`)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((err) => {
        if (active) setError(messageOf(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, companyId, userId, effectiveScope, status, refresh]);

  async function mutate(row: Todo, action: 'complete' | 'reopen' | 'delete') {
    if (action === 'delete' && !window.confirm(`¿Eliminar el to-do «${row.title}»?`)) return;
    setBusy(row.id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'delete') await apiClient.delete(`/api/todos/${row.id}`);
      else await apiClient.patch(`/api/todos/${row.id}/${action}`);
      window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
      setNotice(
        action === 'delete'
          ? 'To-do eliminado.'
          : action === 'complete'
            ? 'To-do completado.'
            : 'To-do reabierto.',
      );
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  if (!permissions || !user)
    return (
      <p className="p-6 text-fg-secondary" role="status">
        Cargando…
      </p>
    );
  if (!canRead)
    return (
      <p className="p-6 text-fg-secondary" role="alert">
        No tienes acceso a los to-dos.
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: 'var(--font-display)' }}>
          To-dos
        </h1>
        {flags?.create && (
          <button className={PRIMARY} onClick={() => setModal({ editing: null })}>
            <Plus size={16} className="mr-2 inline" aria-hidden="true" />
            Nuevo to-do
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Alcance de los to-dos">
          <button
            className={`${BUTTON} ${effectiveScope === 'mine' ? 'bg-subtle' : ''}`}
            aria-pressed={effectiveScope === 'mine'}
            onClick={() => setScope('mine')}
          >
            Mis to-dos
          </button>
          {canUpdate && (
            <button
              className={`${BUTTON} ${effectiveScope === 'all' ? 'bg-subtle' : ''}`}
              aria-pressed={effectiveScope === 'all'}
              onClick={() => setScope('all')}
            >
              Todos
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-secondary">
          Estado
          <select
            className={INPUT}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="PENDING">Pendientes</option>
            <option value="DONE">Hechos</option>
            <option value="ALL">Todos</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-fg-secondary">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-fg-secondary">
          Cargando to-dos…
        </p>
      ) : !error && rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-card p-6 text-fg-secondary">
          {effectiveScope === 'mine' && status === 'PENDING'
            ? 'No tienes to-dos pendientes.'
            : 'No hay to-dos.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">To-dos de la organización</caption>
            <thead className="bg-subtle text-fg-secondary">
              <tr>
                {['Hecho', 'Título', 'Responsable', 'Fecha límite', 'Prioridad', 'Acciones'].map(
                  (heading) => (
                    <th key={heading} scope="col" className="px-4 py-3 font-medium">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className={row.status === 'DONE' ? 'text-fg-muted' : 'text-fg'}>
                  <TodoRowCells
                    row={row}
                    busy={busy}
                    canReopen={canUpdate}
                    onToggle={() => mutate(row, row.status === 'DONE' ? 'reopen' : 'complete')}
                  />
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canUpdate && row.status === 'PENDING' && (
                        <button
                          className={BUTTON}
                          disabled={busy !== null}
                          onClick={() => setModal({ editing: row })}
                          aria-label={`Editar: ${row.title}`}
                        >
                          Editar
                        </button>
                      )}
                      {flags?.delete && row.canDelete && (
                        <button
                          className={BUTTON}
                          disabled={busy !== null}
                          onClick={() => mutate(row, 'delete')}
                          aria-label={`Eliminar: ${row.title}`}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <TodoModal
          editing={modal.editing}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setNotice('To-do guardado.');
            window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
            setRefresh((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

function TodoModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Todo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(editing?.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(editing?.dueDate?.slice(0, 10) ?? '');
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'MEDIUM');
  const [members, setMembers] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    dialog.current?.querySelector('input')?.focus();
    let active = true;
    apiClient
      .get<Assignee[]>('/api/todos/assignees')
      .then((data) => {
        if (active) setMembers(data);
      })
      .catch((err) => {
        if (active) setError(messageOf(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const inactiveAssignee =
    editing?.assignee && !members.some((member) => member.id === editing.assigneeId);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      assigneeId,
      dueDate: dueDate || null,
      priority,
    };
    try {
      if (editing) await apiClient.patch(`/api/todos/${editing.id}`, body);
      else await apiClient.post('/api/todos', body);
      onSaved();
    } catch (err) {
      setError(messageOf(err));
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="todo-dialog-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) event.preventDefault();
        else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
      className="m-auto max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-xl bg-card-solid p-0 text-fg shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2
          id="todo-dialog-title"
          className="text-lg font-semibold"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {editing ? 'Editar to-do' : 'Nuevo to-do'}
        </h2>
        <button
          type="button"
          aria-label="Cerrar"
          className="text-fg-secondary focus-visible:outline-accent"
          disabled={saving}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={save} autoComplete="off" className="space-y-4 px-5 py-4">
        <label className="block text-sm">
          Título
          <input
            className={`${INPUT} mt-1`}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            disabled={saving}
          />
        </label>
        <label className="block text-sm">
          Descripción
          <textarea
            className={`${INPUT} mt-1`}
            rows={3}
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            disabled={saving}
          />
        </label>
        <label className="block text-sm">
          Responsable
          <select
            className={`${INPUT} mt-1`}
            name="assigneeId"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            required
            disabled={loading || saving}
          >
            <option value="">{loading ? 'Cargando miembros…' : 'Selecciona un responsable'}</option>
            {inactiveAssignee && (
              <option value={editing.assigneeId}>
                {nameOf(editing.assignee)} (membresía inactiva)
              </option>
            )}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {nameOf(member)} — {member.email}
              </option>
            ))}
          </select>
        </label>
        {!loading && members.length === 0 && (
          <p className="text-sm text-fg-secondary">No hay miembros activos disponibles.</p>
        )}
        <label className="block text-sm">
          Fecha límite
          <input
            className={`${INPUT} mt-1`}
            type="date"
            name="dueDate"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block text-sm">
          Prioridad
          <select
            className={`${INPUT} mt-1`}
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            disabled={saving}
          >
            {Object.entries(PRIORITIES).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON} disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={PRIMARY}
            disabled={saving || loading || !assigneeId || !title.trim()}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
