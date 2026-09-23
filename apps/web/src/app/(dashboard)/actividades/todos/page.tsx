'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiClient } from '../../../../lib/api';
import { useAuth } from '../../../../hooks/useAuth';
import { useActividadesPermissions } from '../../../../hooks/useActividadesPermissions';
import { useMembers } from '../../../../hooks/useMembers';

import {
  Todo,
  Priority,
  Person,
  PRIORITIES,
  nameOf,
  TODOS_CHANGED_EVENT,
} from '../../../../components/actividades/TodoRowCells';
import { TodoBoardTable } from '../../../../components/actividades/TodoBoardTable';
import { TodoKanban } from '../../../../components/actividades/TodoKanban';
import {
  addDays,
  santiagoToday,
  type TodoStatus,
} from '../../../../components/actividades/todoStatus';

/* GO-004 — the to-dos board (Monday-style): a grouped table (default) and a kanban by
 * status. ONE request per load — every status, DONE bounded to the last 30 Santiago days
 * by completedAfter — and mutate → refetch; a status change (select, drop or «Mover a…»)
 * is optimistic with revert + toast. Gating: Actividades flags + the rows' own flags. */

type Assignee = Person & { email: string };
type View = 'table' | 'cards';
const INPUT =
  'w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg focus-visible:outline-accent';
const BUTTON =
  'rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-subtle-hover disabled:opacity-50 focus-visible:outline-accent';
const PRIMARY =
  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-accent';
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'No se pudo completar la acción.';
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL');

export default function TodosPage() {
  const { user } = useAuth();
  const permissions = useActividadesPermissions();
  const flags = permissions?.todo;
  const companyId = apiClient.getCompanyId();
  const userId = user?.id;
  const { members: activeMembers } = useMembers('active');
  const [view, setView] = useState<View>('table');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [assigneeId, setAssigneeId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState<{ editing: Todo | null } | null>(null);
  const canRead = flags?.read ?? false;
  const canUpdate = flags?.update ?? false;
  const effectiveScope = canUpdate ? scope : 'mine';
  const effectiveAssignee = canUpdate ? assigneeId : '';
  const today = santiagoToday();
  const completedAfter = addDays(today, -30);

  useEffect(() => {
    if (!canRead || !companyId || !userId) return;
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      scope: effectiveScope,
      status: 'ALL',
      completedAfter,
    });
    if (effectiveAssignee) params.set('assigneeId', effectiveAssignee);
    apiClient
      .get<Todo[]>(`/api/todos?${params.toString()}`)
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
  }, [canRead, companyId, userId, effectiveScope, effectiveAssignee, completedAfter, refresh]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  const visibleRows = useMemo(() => {
    const q = normalize(search.trim());
    return q ? rows.filter((row) => normalize(row.title).includes(q)) : rows;
  }, [rows, search]);

  /* The one status-change path: table select, kanban drop and «Mover a…». Optimistic,
     then PATCH /status; success → badge event + refetch; failure → revert + toast. */
  async function moveTo(row: Todo, target: TodoStatus) {
    if (row.status === target || !row.canChangeStatus) return;
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, status: target } : r)));
    setToast(null);
    try {
      await apiClient.patch(`/api/todos/${row.id}/status`, { status: target });
      window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
      setRefresh((value) => value + 1);
    } catch (err) {
      setRows((current) => current.map((r) => (r.id === row.id ? row : r)));
      setToast(messageOf(err));
    }
  }

  async function remove(row: Todo) {
    if (!window.confirm(`¿Eliminar el to-do «${row.title}»?`)) return;
    setBusy(row.id);
    setError(null);
    setNotice(null);
    try {
      await apiClient.delete(`/api/todos/${row.id}`);
      window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
      setNotice('To-do eliminado.');
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

  const toggleClass = (on: boolean) => `${BUTTON} ${on ? 'bg-subtle font-medium' : ''}`;

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
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1" role="group" aria-label="Vista">
          <button
            className={toggleClass(view === 'table')}
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            Tabla
          </button>
          <button
            className={toggleClass(view === 'cards')}
            aria-pressed={view === 'cards'}
            onClick={() => setView('cards')}
          >
            Tarjetas
          </button>
        </div>
        <div className="flex gap-1" role="group" aria-label="Alcance de los to-dos">
          <button
            className={toggleClass(effectiveScope === 'mine')}
            aria-pressed={effectiveScope === 'mine'}
            onClick={() => setScope('mine')}
          >
            Mis to-dos
          </button>
          {canUpdate && (
            <button
              className={toggleClass(effectiveScope === 'all')}
              aria-pressed={effectiveScope === 'all'}
              onClick={() => setScope('all')}
            >
              Todos
            </button>
          )}
        </div>
        {canUpdate && (
          <label className="flex items-center gap-2 text-sm text-fg-secondary">
            Responsable
            <select
              className={`${INPUT} w-auto min-w-[180px]`}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Todos los responsables</option>
              {activeMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-[200px] flex-1 items-center gap-2 text-sm text-fg-secondary sm:max-w-xs">
          <span className="sr-only">Buscar por título</span>
          <input
            type="search"
            className={INPUT}
            placeholder="Buscar por título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
      {loading && rows.length === 0 ? (
        <p role="status" className="text-fg-secondary">
          Cargando to-dos…
        </p>
      ) : !error && visibleRows.length === 0 ? (
        <p className="rounded-xl border border-line bg-card p-6 text-fg-secondary">
          {search.trim()
            ? 'Ningún to-do coincide con la búsqueda.'
            : effectiveScope === 'mine'
              ? 'No tienes to-dos.'
              : 'No hay to-dos.'}
        </p>
      ) : view === 'table' ? (
        <TodoBoardTable
          rows={visibleRows}
          today={today}
          canUpdate={canUpdate}
          canDelete={flags?.delete ?? false}
          busy={busy !== null}
          onMove={moveTo}
          onEdit={(row) => setModal({ editing: row })}
          onDelete={remove}
        />
      ) : (
        <TodoKanban rows={visibleRows} onMove={moveTo} />
      )}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <span>{toast}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setToast(null)}
            className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={14} />
          </button>
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
