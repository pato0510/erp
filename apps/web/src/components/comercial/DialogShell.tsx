'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/* COM-027 — the Comercial dialog shell: rendered through a portal to document.body (so no
 * ancestor with transform / filter / container-type can become its containing block),
 * role="dialog" + aria-modal, focus starts on the first field and is trapped inside,
 * Escape and a click on the backdrop cancel, and on close focus goes back to the trigger:
 * `returnFocusId` when the trigger may have been re-rendered meanwhile (e.g. a table row
 * that moved group), else the element that was focused when the dialog opened, else
 * `fallbackFocusId` (the trigger itself may be gone, e.g. «Reabrir» after reopening) —
 * never <body>. */

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function DialogShell({
  title,
  onCancel,
  children,
  footer,
  returnFocusId,
  fallbackFocusId,
  maxWidth = 'max-w-md',
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusId?: string;
  fallbackFocusId?: string;
  maxWidth?: string;
}) {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Initial focus + focus return on close.
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>('input, select, textarea') ??
      root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      // After the caller's re-render (a reverted row is a new node).
      window.requestAnimationFrame(() => {
        const byId = returnFocusId ? document.getElementById(returnFocusId) : null;
        const target =
          byId ??
          (opener && document.contains(opener) ? opener : null) ??
          (fallbackFocusId ? document.getElementById(fallbackFocusId) : null);
        target?.focus();
      });
    };
    // returnFocusId / fallbackFocusId are fixed for the dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const els = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancelRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-xl bg-card-solid shadow-xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2
            id={`${uid}-title`}
            className="text-lg font-semibold text-fg"
            style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={() => cancelRef.current()}
            aria-label="Cerrar"
            className="rounded-md text-fg-secondary hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export const DIALOG_INPUT =
  'w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
export const DIALOG_LABEL = 'mb-1 block text-xs font-medium text-fg-secondary';
export const DIALOG_GHOST =
  'rounded-lg border border-line px-4 py-2 text-sm text-fg-secondary hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
export const DIALOG_PRIMARY =
  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default DialogShell;
