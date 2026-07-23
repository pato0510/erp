'use client';

import Link from 'next/link';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import type { VencimientoCalendarEntry } from './activityTypes';

/* CAL-016 — a READ-ONLY mini-card for a document-expiration (vencimiento) chip. Shows label +
   fecha only (the narrowed payload). The link to the ops documents surface is ability-shaped by
   the server: `entry.link` is null for a caller who cannot read DocumentRecord, and we render NO
   door in that case. */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function VencimientoCalendarModal({
  vencimiento,
  onClose,
}: {
  vencimiento: VencimientoCalendarEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'rgba(217,119,6,0.16)', color: '#d97706' }}
            >
              <AlertTriangle size={16} />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Vencimiento
              </div>
              <h2
                className="text-base font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {vencimiento.label}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Vence</span>
            <span className="font-medium text-[var(--text-primary)]">
              {formatDate(vencimiento.date)}
            </span>
          </div>
          {vencimiento.link && (
            <Link
              href={vencimiento.link}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              Ver en Documentos <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default VencimientoCalendarModal;
