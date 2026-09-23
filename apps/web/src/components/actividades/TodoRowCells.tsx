'use client';

import { TODO_STATUS, type TodoStatus } from './todoStatus';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type Person = { id: string; firstName: string; lastName: string };
export interface Todo {
  id: string;
  title: string;
  description: string | null;
  // GO-003 — five statuses; open = everything but DONE.
  status: TodoStatus;
  priority: Priority;
  dueDate: string | null;
  assigneeId: string;
  assignee: Person | null;
  createdBy: string;
  createdByName: string | null;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  canDelete: boolean;
  canComplete: boolean;
  canChangeStatus: boolean;
}

/** GO-004 — static status pill (the board's vocabulary). */
export function TodoStatusPill({ status }: { status: TodoStatus }) {
  const meta = TODO_STATUS[status];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${meta.fill}`}>
      {meta.label}
    </span>
  );
}
export const PRIORITIES: Record<Priority, { label: string; classes: string }> = {
  LOW: { label: 'Baja', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  MEDIUM: {
    label: 'Media',
    classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  },
  HIGH: { label: 'Alta', classes: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
};

export const nameOf = (person: Person | null) =>
  person ? `${person.firstName} ${person.lastName}`.trim() : '—';
function dateLabel(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString('es-CL', {
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Sin fecha';
}

// Both lists announce and refresh their live sidebar count after a successful mutation.
export const TODOS_CHANGED_EVENT = 'todos:changed';

export function TodoRowCells({
  row,
  busy,
  canReopen,
  onToggle,
}: {
  row: Todo;
  busy: string | null;
  canReopen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent focus-visible:outline-accent"
          aria-label={`${row.status === 'DONE' ? 'Reabrir' : 'Completar'}: ${row.title}`}
          checked={row.status === 'DONE'}
          disabled={busy !== null || (row.status === 'DONE' ? !canReopen : !row.canComplete)}
          onChange={onToggle}
        />
      </td>
      <td className="px-4 py-3">
        <span className={`break-words ${row.status === 'DONE' ? 'line-through' : ''}`}>
          {row.title}
        </span>{' '}
        <TodoStatusPill status={row.status} />
        {row.description && (
          <p className="mt-1 max-w-md whitespace-pre-wrap break-words text-xs text-fg-secondary">
            {row.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3">{nameOf(row.assignee)}</td>
      <td className="px-4 py-3">
        {dateLabel(row.dueDate)}
        {row.overdue && (
          <span className="ml-2 rounded bg-red-100 px-2 py-1 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            Atrasado
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded px-2 py-1 text-xs ${PRIORITIES[row.priority].classes}`}>
          {PRIORITIES[row.priority].label}
        </span>
      </td>
    </>
  );
}
