'use client';

import { useEffect, useRef, useState } from 'react';
import { MemberAvatar } from '../shared/MemberAvatar';
import { nameOf, type Todo } from './TodoRowCells';
import { TodoMoveMenu } from './TodoMoveMenu';
import {
  TODO_PRIORITY,
  TODO_STATUS,
  TODO_STATUS_ORDER,
  civilDate,
  formatDm,
  type TodoStatus,
} from './todoStatus';

/* GO-004 — the kanban: one column per status in the api's enum order. Native HTML5 drag
 * and drop (no library), the pipeline's pattern: only our own card drags are accepted,
 * the board edge auto-scrolls on a rAF loop cancelled on drop/dragend/unmount, and a drop
 * calls the page's optimistic move (revert + toast on error). A card is draggable only
 * when its canChangeStatus flag is true (for DONE cards that already means editors
 * only). «Mover a…» is the keyboard/click alternative with the same handler. */
export function TodoKanban({
  rows,
  onMove,
}: {
  rows: Todo[];
  onMove: (row: Todo, target: TodoStatus) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TodoStatus | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  // After a keyboard move the card re-renders in another column: put focus back on its
  // «Mover a…» trigger so the keyboard user does not lose their place.
  const refocusRef = useRef<string | null>(null);

  const stopAutoScroll = () => {
    velocityRef.current = 0;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  const stepAutoScroll = () => {
    const el = boardRef.current;
    if (!el || velocityRef.current === 0) {
      rafRef.current = null;
      return;
    }
    el.scrollLeft += velocityRef.current;
    rafRef.current = requestAnimationFrame(stepAutoScroll);
  };
  useEffect(() => stopAutoScroll, []);

  useEffect(() => {
    const id = refocusRef.current;
    if (!id) return;
    refocusRef.current = null;
    document.querySelector<HTMLElement>(`[data-move-trigger="${id}"]`)?.focus();
  }, [rows]);

  const onBoardDragOver = (e: React.DragEvent) => {
    if (!draggingId) return;
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 76;
    const MIN = 4;
    const MAX = 24;
    const x = e.clientX - rect.left;
    let v = 0;
    if (x < EDGE) v = -(MIN + (MAX - MIN) * Math.min(1, (EDGE - x) / EDGE));
    else if (x > rect.width - EDGE)
      v = MIN + (MAX - MIN) * Math.min(1, (x - (rect.width - EDGE)) / EDGE);
    velocityRef.current = v;
    if (v !== 0 && rafRef.current === null) rafRef.current = requestAnimationFrame(stepAutoScroll);
  };

  const drop = (status: TodoStatus) => {
    const row = rows.find((r) => r.id === draggingId);
    setDraggingId(null);
    setOverStatus(null);
    stopAutoScroll();
    if (row && row.status !== status) onMove(row, status);
  };

  return (
    <div
      ref={boardRef}
      onDragOver={onBoardDragOver}
      className="flex gap-3 overflow-x-auto pb-4"
      aria-label="Tablero de to-dos por estado"
    >
      {TODO_STATUS_ORDER.map((status) => {
        const meta = TODO_STATUS[status];
        const cards = rows.filter((r) => r.status === status);
        const over = overStatus === status;
        return (
          <section
            key={status}
            aria-labelledby={`todo-col-${status}`}
            onDragOver={(e) => {
              if (!draggingId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overStatus !== status) setOverStatus(status);
            }}
            onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              drop(status);
            }}
            className={`flex min-w-[208px] max-w-[320px] flex-1 shrink-0 flex-col overflow-hidden rounded-xl border bg-card motion-safe:transition-colors ${
              over ? 'border-accent' : 'border-line'
            }`}
          >
            <header
              className={`flex items-center justify-between px-3 py-2 text-sm font-semibold ${meta.fill}`}
            >
              <h2 id={`todo-col-${status}`}>
                {meta.label}
                {status === 'DONE' && (
                  <span className="ml-1 text-xs font-normal">(últimos 30 días)</span>
                )}
              </h2>
              <span className="text-xs" aria-label={`${cards.length} to-dos`}>
                {cards.length}
              </span>
            </header>
            <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
              {cards.length === 0 ? (
                <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-6 text-xs text-fg-secondary">
                  Sin to-dos
                </p>
              ) : (
                cards.map((row) => (
                  <Card
                    key={row.id}
                    row={row}
                    dragging={draggingId === row.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      // Firefox only starts a drag when data is set.
                      e.dataTransfer.setData('text/plain', row.id);
                      setDraggingId(row.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStatus(null);
                      stopAutoScroll();
                    }}
                    onMove={(target) => {
                      refocusRef.current = row.id;
                      onMove(row, target);
                    }}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  row,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  row: Todo;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (target: TodoStatus) => void;
}) {
  const assignee = row.assignee ? nameOf(row.assignee) : null;
  const priority = TODO_PRIORITY[row.priority];
  const draggable = row.canChangeStatus;
  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      aria-label={row.title}
      className={`rounded-lg border border-line bg-card-solid p-3 ${draggable ? 'cursor-grab' : ''} ${
        dragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`min-w-0 break-words text-sm font-medium text-fg ${
            row.status === 'DONE' ? 'line-through' : ''
          }`}
        >
          {row.title}
        </p>
        {draggable && (
          <TodoMoveMenu todoId={row.id} title={row.title} status={row.status} onMove={onMove} />
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-fg-secondary">
        <MemberAvatar size="sm" displayName={assignee} />
        <span className="truncate" aria-hidden="true">
          {assignee ?? 'Usuario desconocido'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-fg-secondary">
          {row.dueDate ? `Plazo ${formatDm(civilDate(row.dueDate))}` : 'Sin plazo'}
        </span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${priority.fill}`}>
          {priority.label}
        </span>
        {row.overdue && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
            Atrasado
          </span>
        )}
      </div>
    </article>
  );
}

export default TodoKanban;
