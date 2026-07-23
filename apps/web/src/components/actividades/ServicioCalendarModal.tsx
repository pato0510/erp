'use client';

import Link from 'next/link';
import { CalendarClock, ExternalLink, X } from 'lucide-react';
import type { ServicioCalendarEntry, ServiceOrderStatusVM } from './activityTypes';

/* CAL-016 — a READ-ONLY mini-card for an ops servicio chip. Shows label + rango + estado in the
   OPS VOCABULARY (Recibida / En ejecución / …), NEVER activity words and NEVER any amount (the
   payload structurally cannot carry money). The link to "Servicios activos" is ability-shaped by
   the server: `entry.link` is null for a caller who cannot read ServiceOrder (VIEWER/ANALYST), and
   we render NO door in that case — the chip is not a door. */

/* Ops status labels, verbatim vocabulary — a display map, NOT a translation to ActivityStatus. */
const OPS_STATUS_LABEL: Record<ServiceOrderStatusVM, string> = {
  RECIBIDA: 'Recibida',
  EN_EJECUCION: 'En ejecución',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ServicioCalendarModal({
  servicio,
  onClose,
}: {
  servicio: ServicioCalendarEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'rgba(13,148,136,0.16)', color: '#0d9488' }}
            >
              <CalendarClock size={16} />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Servicio (Operaciones)
              </div>
              <h2
                className="text-base font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {servicio.label}
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
            <span className="text-[var(--text-secondary)]">Ejecución</span>
            <span className="font-medium text-[var(--text-primary)]">
              {formatDate(servicio.executionStart)} — {formatDate(servicio.executionEnd)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Estado</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: 'rgba(13,148,136,0.16)', color: '#0d9488' }}
            >
              {OPS_STATUS_LABEL[servicio.status]}
            </span>
          </div>
          {servicio.link && (
            <Link
              href={servicio.link}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              Ver en Servicios activos <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default ServicioCalendarModal;
