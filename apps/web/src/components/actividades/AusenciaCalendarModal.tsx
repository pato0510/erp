'use client';

import Link from 'next/link';
import { ExternalLink, UserRound, X } from 'lucide-react';
import type { AusenciaCalendarEntry } from './activityTypes';

/* CAL-018 — a READ-ONLY mini-card for an ausencia chip. Shows nombre + rango + the UI constant
   "No disponible" and NOTHING else — NEVER the motivo, category, licencia folio or health entity
   (the payload structurally cannot carry them — the CAL-006 discipline, final exam). The link to
   the RRHH employee is ability-shaped by the server: `entry.link` is null for a caller who cannot
   read Employee (ANALYST/VIEWER), and we render NO door in that case. */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AusenciaCalendarModal({
  ausencia,
  onClose,
}: {
  ausencia: AusenciaCalendarEntry;
  onClose: () => void;
}) {
  const rango =
    ausencia.startDate.slice(0, 10) === ausencia.endDate.slice(0, 10)
      ? formatDate(ausencia.startDate)
      : `${formatDate(ausencia.startDate)} — ${formatDate(ausencia.endDate)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'rgba(100,116,139,0.16)', color: '#475569' }}
            >
              <UserRound size={16} />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Ausencia (RRHH)
              </div>
              <h2
                className="text-base font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {ausencia.fullName}
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
            <span className="text-[var(--text-secondary)]">Período</span>
            <span className="font-medium text-[var(--text-primary)]">{rango}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Estado</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: 'rgba(100,116,139,0.16)', color: '#475569' }}
            >
              No disponible
            </span>
          </div>
          {ausencia.link && (
            <Link
              href={ausencia.link}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              Ver trabajador <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default AusenciaCalendarModal;
