'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Play } from 'lucide-react';
import {
  ACTIVE_STAGES,
  isClosedStage,
  STAGE_LABELS,
  stageAccent,
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
   resize (any of which would leave the anchored position stale). */
export function CardMoveMenu({
  stage,
  onMove,
  onResume,
}: {
  stage: string;
  onMove: (target: OpportunityStage) => void;
  onResume: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Any scroll (capture: also inner containers) or resize invalidates the anchor.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (isClosedStage(stage)) return null;

  const isPaused = stage === 'EN_PAUSA';
  const targets: OpportunityStage[] = ACTIVE_STAGES.includes(stage as OpportunityStage)
    ? [...ACTIVE_STAGES.filter((s) => s !== stage), 'EN_PAUSA', 'GANADA', 'PERDIDA']
    : [...ACTIVE_STAGES]; // En Pausa card → the active stages (+ Reanudar, below)

  const toggle = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const itemCount = targets.length + (isPaused ? 1 : 0);
      const estH = itemCount * 32 + 34;
      let top = r.bottom + 4;
      if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 4);
      const left = Math.max(8, Math.min(r.right - 200, window.innerWidth - 208));
      setPos({ top, left });
    }
    setOpen(true);
  };

  const pick = (ev: React.MouseEvent, fn: () => void) => {
    ev.stopPropagation();
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Mover a…"
        aria-label="Mover a…"
        className="rounded-md p-1 text-[var(--text-secondary)] hover:bg-black/[0.05] hover:text-[var(--text-primary)]"
      >
        <MoreVertical size={15} />
      </button>

      {open && pos && (
        <>
          {/* click-away backdrop (stops the click from reaching the card underneath) */}
          <div
            className="fixed inset-0 z-[55]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="fixed z-[56] w-[200px] overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Mover a…
            </p>
            {isPaused && (
              <MenuItem onClick={(e) => pick(e, onResume)}>
                <Play size={12} /> Reanudar
              </MenuItem>
            )}
            {targets.map((t) => (
              <MenuItem key={t} onClick={(e) => pick(e, () => onMove(t))}>
                <span
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
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-black/[0.04]"
    >
      {children}
    </button>
  );
}

export default CardMoveMenu;
