'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Play } from 'lucide-react';
import {
  isClosedStage,
  STAGE_LABELS,
  stageAccent,
  stageMoveTargets,
  type OpportunityStage,
} from './stageLabels';

/* COM-007 UX — the "Mover a…" quick action (⋮) on a draggable pipeline card. A
   keyboard/click alternative to dragging across the wide board. It lists ONLY the
   stages the card may move to, honoring the exact machine semantics the board's drag
   already implements:
     - Active card  → the other four active stages, En Pausa, Ganada, Perdida.
     - En Pausa card → Reanudar (POST /resume) + the five active stages.
     - Ganada/Perdida → no menu (semi-terminal; Reabrir lives elsewhere).
   Selecting a target calls the SAME shared handlers the drop uses (onMove / onResume),
   so there is zero duplicated transition logic. Rendered by the board ONLY for writers
   on non-closed cards; ACCOUNTANT never sees it.

   The dropdown is position:fixed (anchored to the button rect) so the board's
   overflow-x scroll container cannot clip it. It closes on outside click, scroll or
   resize (any of which would leave the anchored position stale).

   COM-025 — keyboard model of GO-004's TodoMoveMenu: aria-haspopup/aria-expanded on the
   trigger, role="menu"/"menuitem", focus on the first item when it opens, ArrowUp /
   ArrowDown cycle, Escape closes and returns focus to the trigger, Tab closes. The
   click-away backdrop stays: it keeps the click from reaching the card (which navigates). */
export function CardMoveMenu({
  stage,
  onMove,
  onResume,
  triggerId,
}: {
  stage: string;
  /** COM-027 — lets the stage-entry dialog return focus here after the card re-renders. */
  triggerId?: string;
  onMove: (target: OpportunityStage) => void;
  onResume: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const open = pos !== null;

  const close = (returnFocus = true) => {
    setPos(null);
    if (returnFocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    // Any scroll (capture: also inner containers) or resize invalidates the anchor.
    const onScrollOrResize = () => close();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // close only touches refs and a setter; the listeners re-bind when the menu opens.
  }, [open]);

  if (isClosedStage(stage)) return null;

  const isPaused = stage === 'EN_PAUSA';
  const targets = stageMoveTargets(stage);

  const toggle = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (open) {
      close();
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const itemCount = targets.length + (isPaused ? 1 : 0);
    const estH = itemCount * 32 + 34;
    let top = r.bottom + 4;
    if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 4);
    const left = Math.max(8, Math.min(r.right - 200, window.innerWidth - 208));
    setPos({ top, left });
  };

  const pick = (ev: React.MouseEvent, fn: () => void) => {
    ev.stopPropagation();
    close(false);
    fn();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
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
        ref={btnRef}
        id={triggerId}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mover a…"
        aria-label="Mover a…"
        className="rounded-md p-1 text-fg-secondary hover:bg-subtle-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <MoreVertical size={15} aria-hidden="true" />
      </button>

      {pos && (
        <>
          {/* click-away backdrop (stops the click from reaching the card underneath) */}
          <div
            className="fixed inset-0 z-[55]"
            onClick={(e) => {
              e.stopPropagation();
              close(false);
            }}
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Mover a"
            onKeyDown={onMenuKeyDown}
            className="fixed z-[56] w-[200px] overflow-hidden rounded-lg border border-line bg-card-solid py-1 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-fg-secondary">
              Mover a…
            </p>
            {isPaused && (
              <MenuItem onClick={(e) => pick(e, onResume)}>
                <Play size={12} aria-hidden="true" /> Reanudar
              </MenuItem>
            )}
            {targets.map((t) => (
              <MenuItem key={t} onClick={(e) => pick(e, () => onMove(t))}>
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: stageAccent(t) }}
                />
                {STAGE_LABELS[t]}
              </MenuItem>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-subtle-hover focus-visible:bg-subtle-hover focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

export default CardMoveMenu;
