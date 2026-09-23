'use client';

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react';

/* COM-025 — a column header that explains itself (WCAG 1.4.13, content on hover or
 * focus): the help shows on pointer hover AND keyboard focus of the header's own
 * control, stays while the pointer moves onto it (hoverable), and Escape dismisses it
 * without moving focus. It never takes the click: a sortable header's button keeps its
 * onClick, and the help is wired as aria-describedby on that same control.
 *
 * The bubble is position:fixed, anchored to the trigger, so the table's overflow-x
 * container cannot clip it; scroll or resize hides it (the anchor would be stale). The
 * description lives in a hidden element that is always in the DOM, so screen readers get
 * it whether or not the bubble is showing; the bubble itself is aria-hidden. */
export function ColumnHelp({
  help,
  children,
}: {
  help: string;
  /** The header's focusable control (sort button or a tabIndex=0 label). */
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const cancelHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = () => {
    cancelHide();
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 240;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 6, left });
  };
  // A short grace period lets the pointer travel from the header onto the bubble.
  const hideSoon = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setPos(null), 120);
  };
  const hideNow = () => {
    cancelHide();
    setPos(null);
  };

  useEffect(() => {
    if (!pos) return;
    const hide = () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos]);

  useEffect(() => cancelHide, []);

  return (
    <span
      ref={wrapRef}
      className="inline-flex max-w-full"
      onPointerEnter={show}
      onPointerLeave={hideSoon}
      onFocus={show}
      onBlur={hideNow}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span id={id} hidden>
        {help}
      </span>
      {pos && (
        <span
          aria-hidden="true"
          onPointerEnter={cancelHide}
          onPointerLeave={hideSoon}
          className="fixed z-[60] w-[240px] rounded-lg border border-line bg-card-solid px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-fg shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {help}
        </span>
      )}
    </span>
  );
}

export default ColumnHelp;
