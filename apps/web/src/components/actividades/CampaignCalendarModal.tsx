'use client';

import Link from 'next/link';
import { ExternalLink, Megaphone, X } from 'lucide-react';
import type { CampaignCalendarEntry, CampaignStatusVM } from './activityTypes';

/* CAL-017 — a READ-ONLY mini-card for a campaign chip. Shows nombre + estado + rango and NOTHING
   else — NO budget, NO spend (the projection is money-free). The link to the campaign detail is
   ability-shaped by the server: `entry.link` is null for a caller who cannot read Campaign
   (ANALYST/VIEWER), and we render NO door in that case. */

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatusVM, string> = {
  BORRADOR: 'Borrador',
  ACTIVA: 'Activa',
  PAUSADA: 'Pausada',
  FINALIZADA: 'Finalizada',
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

export function CampaignCalendarModal({
  campana,
  onClose,
}: {
  campana: CampaignCalendarEntry;
  onClose: () => void;
}) {
  const rango = campana.startDate
    ? campana.endDate
      ? `${formatDate(campana.startDate)} — ${formatDate(campana.endDate)}`
      : `Desde ${formatDate(campana.startDate)}`
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-[var(--bg-card)] shadow-xl">
        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'rgba(124,58,237,0.16)', color: '#7c3aed' }}
            >
              <Megaphone size={16} />
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Campaña (Marketing)
              </div>
              <h2
                className="text-base font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display, 'Outfit'), sans-serif" }}
              >
                {campana.name}
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
            <span className="text-[var(--text-secondary)]">Rango</span>
            <span className="font-medium text-[var(--text-primary)]">{rango}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Estado</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: 'rgba(124,58,237,0.16)', color: '#7c3aed' }}
            >
              {CAMPAIGN_STATUS_LABEL[campana.status]}
            </span>
          </div>
          {campana.link && (
            <Link
              href={campana.link}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              Ver campaña <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default CampaignCalendarModal;
