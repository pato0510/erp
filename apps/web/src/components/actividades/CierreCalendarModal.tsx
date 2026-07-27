'use client';

import Link from 'next/link';
import { ExternalLink, Target, X } from 'lucide-react';
import type { CierreCalendarEntry } from './activityTypes';

/* CAL-017 — a READ-ONLY mini-card for an expected-close (cierre) chip. Shows nombre + fecha
   esperada and NOTHING else — NO amount, NO stage (the pipeline shape is commercially sensitive).
   This chip only exists for Opportunity readers (the server omits the whole collection otherwise),
   so `entry.link` is present in practice; we still guard it defensively. */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function CierreCalendarModal({
  cierre,
  onClose,
}: {
  cierre: CierreCalendarEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'rgba(225,29,72,0.14)', color: '#e11d48' }}
            >
              <Target size={16} />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Cierre esperado (Comercial)
              </div>
              <h2
                className="text-base font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {cierre.name}
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
            <span className="text-[var(--text-secondary)]">Cierre esperado</span>
            <span className="font-medium text-[var(--text-primary)]">
              {formatDate(cierre.expectedDate)}
            </span>
          </div>
          {cierre.link && (
            <Link
              href={cierre.link}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              Ver oportunidad <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default CierreCalendarModal;
