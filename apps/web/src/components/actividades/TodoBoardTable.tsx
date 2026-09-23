'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MemberAvatar } from '../shared/MemberAvatar';
import { nameOf, type Todo } from './TodoRowCells';
import {
  TODO_GROUPS,
  TODO_PRIORITY,
  TODO_STATUS,
  TODO_STATUS_ORDER,
  civilDate,
  formatDmy,
  groupOf,
  timelineOf,
  type TodoGroupKey,
  type TodoStatus,
} from './todoStatus';

/* GO-004 — the to-do board's table view: groups by deadline in Santiago dates (weeks
 * Monday–Sunday), each a collapsible section with its own table. Estado and Prioridad
 * are full-cell fills; Estado is a native <select> for rows whose canChangeStatus flag
 * is true (same move handler as the kanban), a static pill otherwise. Gating uses the
 * rows' flags and the Actividades permission flags only — never roles. */

const CELL = 'px-3 py-2 align-middle';
const HEAD = 'px-3 py-2 text-left text-xs font-medium text-fg-secondary';
const BUTTON =
  'rounded-lg border border-line px-2.5 py-1 text-xs text-fg hover:bg-subtle-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export function TodoBoardTable({
  rows,
  today,
  canUpdate,
  canDelete,
  busy,
  onMove,
  onEdit,
  onDelete,
}: {
  rows: Todo[];
  today: string;
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
  onMove: (row: Todo, target: TodoStatus) => void;
  onEdit: (row: Todo) => void;
  onDelete: (row: Todo) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<TodoGroupKey, boolean>>({
    overdue: false,
    thisWeek: false,
    nextWeek: false,
    later: false,
    noDue: false,
    done: true,
  });
  const byGroup = new Map<TodoGroupKey, Todo[]>(TODO_GROUPS.map((g) => [g.key, []]));
  rows.forEach((row) => byGroup.get(groupOf(row, today))?.push(row));

  return (
    <div className="space-y-5">
      {TODO_GROUPS.map((group) => {
        const items = byGroup.get(group.key) ?? [];
        const isCollapsed = collapsed[group.key] || items.length === 0;
        const regionId = `todo-group-${group.key}`;
        return (
          <section key={group.key} aria-labelledby={`${regionId}-label`}>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-6 w-1.5 rounded-full ${group.accent}`} />
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={regionId}
                disabled={items.length === 0}
                onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
                className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-semibold text-fg hover:bg-subtle-hover disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {isCollapsed ? (
                  <ChevronRight size={16} aria-hidden="true" />
                ) : (
                  <ChevronDown size={16} aria-hidden="true" />
                )}
                <span id={`${regionId}-label`}>{group.label}</span>
              </button>
              <span className="text-xs text-fg-secondary">
                {items.length} {items.length === 1 ? 'to-do' : 'to-dos'}
              </span>
            </div>
            <div id={regionId} hidden={isCollapsed} className="mt-2">
              {/* relative: the sr-only (absolute) header text must stay inside the scroll box. */}
              <div className="relative overflow-x-auto rounded-xl border border-line bg-card">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <caption className="sr-only">{group.label}</caption>
                  <thead className="bg-subtle">
                    <tr>
                      <th
                        scope="col"
                        className={`${HEAD} sticky left-0 z-10 min-w-[220px] bg-subtle`}
                      >
                        Tarea
                      </th>
                      <th scope="col" className={HEAD}>
                        Responsable
                      </th>
                      <th scope="col" className={`${HEAD} w-[132px] text-center`}>
                        Estado
                      </th>
                      <th scope="col" className={`${HEAD} w-[96px] text-center`}>
                        Prioridad
                      </th>
                      <th scope="col" className={`${HEAD} w-[128px]`}>
                        Plazo
                      </th>
                      <th scope="col" className={`${HEAD} w-[140px]`}>
                        Cronograma
                      </th>
                      <th scope="col" className={HEAD}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((row) => (
                      <Row
                        key={row.id}
                        row={row}
                        today={today}
                        canEdit={canUpdate && row.status !== 'DONE'}
                        canDelete={canDelete && row.canDelete}
                        busy={busy}
                        onMove={onMove}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  row,
  today,
  canEdit,
  canDelete,
  busy,
  onMove,
  onEdit,
  onDelete,
}: {
  row: Todo;
  today: string;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onMove: (row: Todo, target: TodoStatus) => void;
  onEdit: (row: Todo) => void;
  onDelete: (row: Todo) => void;
}) {
  const status = TODO_STATUS[row.status];
  const priority = TODO_PRIORITY[row.priority];
  const assignee = row.assignee ? nameOf(row.assignee) : null;
  const timeline = timelineOf(row, today);
  const barTone =
    timeline.tone === 'done'
      ? TODO_STATUS.DONE.bar
      : timeline.tone === 'overdue'
        ? TODO_STATUS.BLOCKED.bar
        : 'bg-accent';

  return (
    <tr className="text-fg">
      <td className={`${CELL} sticky left-0 z-10 min-w-[220px] max-w-[320px] bg-card-solid`}>
        <p className={`break-words font-semibold ${row.status === 'DONE' ? 'line-through' : ''}`}>
          {row.title}
        </p>
        {row.description && (
          <p className="truncate text-xs text-fg-secondary" title={row.description}>
            {row.description}
          </p>
        )}
      </td>
      <td className={CELL}>
        <span className="flex items-center gap-2">
          <MemberAvatar size="sm" displayName={assignee} />
          <span className="hidden truncate md:inline" aria-hidden="true">
            {assignee ?? 'Usuario desconocido'}
          </span>
        </span>
      </td>
      <td className="h-11 w-[132px] p-0">
        {row.canChangeStatus ? (
          <select
            value={row.status}
            disabled={busy}
            onChange={(e) => onMove(row, e.target.value as TodoStatus)}
            aria-label={`Estado de «${row.title}»`}
            className={`h-11 w-full cursor-pointer appearance-none border-0 px-2 text-center text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg ${status.fill}`}
          >
            {TODO_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {TODO_STATUS[s].label}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`flex h-11 w-full items-center justify-center text-xs font-semibold ${status.fill}`}
          >
            {status.label}
          </span>
        )}
      </td>
      <td className="h-11 w-[96px] p-0">
        <span
          className={`flex h-11 w-full items-center justify-center text-xs font-semibold ${priority.fill}`}
        >
          {priority.label}
        </span>
      </td>
      <td className={`${CELL} whitespace-nowrap`}>
        {row.dueDate ? formatDmy(civilDate(row.dueDate)) : '—'}
        {row.overdue && (
          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
            Atrasado
          </span>
        )}
      </td>
      <td className={CELL}>
        {timeline.fraction === null ? (
          <span aria-label="Sin plazo" title="Sin plazo" className="text-fg-secondary">
            —
          </span>
        ) : (
          <div
            role="img"
            aria-label={timeline.label}
            title={timeline.label}
            className="h-2 w-[112px] overflow-hidden rounded-full bg-subtle"
          >
            <div
              className={`h-full rounded-full ${barTone}`}
              style={{ width: `${Math.round(timeline.fraction * 100)}%` }}
            />
          </div>
        )}
      </td>
      <td className={`${CELL} whitespace-nowrap`}>
        <div className="flex justify-end gap-2">
          {canEdit && (
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => onEdit(row)}
              aria-label={`Editar: ${row.title}`}
            >
              Editar
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => onDelete(row)}
              aria-label={`Eliminar: ${row.title}`}
            >
              Eliminar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default TodoBoardTable;
