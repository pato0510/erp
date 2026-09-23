'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { TODO_STATUS, TODO_STATUS_ORDER, type TodoStatus } from './todoStatus';

/* GO-004 — «Mover a…», the keyboard/click alternative to dragging a to-do card. Same
 * pattern as the pipeline's CardMoveMenu (position:fixed so the board's overflow cannot
 * clip it; closes on outside click, scroll or resize), plus what that one lacks: Escape,
 * arrow keys, and focus back on its trigger whenever it closes. Picking a status calls
 * the SAME handler as a drop. */
export function TodoMoveMenu({
  todoId,
  title,
  status,
  onMove,
}: {
  todoId: string;
  title: string;
  status: TodoStatus;
  onMove: (target: TodoStatus) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const targets = TODO_STATUS_ORDER.filter((s) => s !== status);
  const open = pos !== null;

  const close = (returnFocus = true) => {
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onScrollOrResize = () => close();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('pointerdown', onPointerDown);
    };
    // close only touches refs and a setter; the listeners re-bind when the menu opens.
  }, [open]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const height = targets.length * 32 + 34;
    let top = r.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, r.top - height - 4);
    const left = Math.max(8, Math.min(r.right - 200, window.innerWidth - 208));
    setPos({ top, left });
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-move-trigger={todoId}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mover «${title}» a…`}
        title="Mover a…"
        className="rounded-md p-1 text-fg-secondary hover:bg-subtle-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <MoreVertical size={15} aria-hidden="true" />
      </button>
      {pos && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Mover «${title}» a`}
          onKeyDown={onMenuKeyDown}
          className="fixed z-[56] w-[200px] overflow-hidden rounded-lg border border-line bg-card-solid py-1 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-fg-secondary">
            Mover a…
          </p>
          {targets.map((target) => (
            <button
              key={target}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                onMove(target);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-subtle-hover focus-visible:bg-subtle-hover focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-sm ${TODO_STATUS[target].bar}`}
              />
              {TODO_STATUS[target].label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default TodoMoveMenu;
