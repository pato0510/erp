import React from 'react';

/* MKT-003 — shared Marketing campaign label maps + badges + date helpers + the
   curated status-action config. ASCII enum keys → Spanish display labels (never
   render the raw enum). Colors are inline React.CSSProperties (same convention as
   the Comercial accountLabels/stageLabels). ONE file so labels/badges/actions never
   drift between the list, the form and the detail page. */

/* ── Channels ── */
export const CAMPAIGN_CHANNELS = [
  'FERIA_EVENTO',
  'REDES_SOCIALES',
  'GOOGLE_ADS',
  'EMAIL',
  'REFERIDOS',
  'LICITACION',
  'OTRO',
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];
export const CHANNEL_LABELS: Record<string, string> = {
  FERIA_EVENTO: 'Feria / Evento',
  REDES_SOCIALES: 'Redes sociales',
  GOOGLE_ADS: 'Google Ads',
  EMAIL: 'Email',
  REFERIDOS: 'Referidos',
  LICITACION: 'Licitación',
  OTRO: 'Otro',
};

/* ── Statuses ── */
export const CAMPAIGN_STATUSES = [
  'BORRADOR',
  'ACTIVA',
  'PAUSADA',
  'FINALIZADA',
  'CANCELADA',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador',
  ACTIVA: 'Activa',
  PAUSADA: 'Pausada',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

/* Badge variants follow the platform badge conventions used by opportunities:
   BORRADOR neutral · ACTIVA success · PAUSADA warning · FINALIZADA closed/info ·
   CANCELADA danger. */
export function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'ACTIVA':
      return { background: 'rgba(34,197,94,0.12)', color: '#15803d' }; // success
    case 'PAUSADA':
      return { background: 'rgba(234,179,8,0.14)', color: '#a16207' }; // warning
    case 'FINALIZADA':
      return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }; // closed / info
    case 'CANCELADA':
      return { background: 'rgba(239,68,68,0.12)', color: '#b91c1c' }; // danger
    default: // BORRADOR — neutral
      return { background: 'rgba(100,116,139,0.12)', color: '#475569' };
  }
}

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={statusStyle(status)}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Closed-state helper ── */
export const CLOSED_STATUSES: CampaignStatus[] = ['FINALIZADA', 'CANCELADA'];
export const isClosedStatus = (status: string) =>
  CLOSED_STATUSES.includes(status as CampaignStatus);

/* ── UTC-safe date handling (HR-004b) ── @db.Date fields arrive UTC-anchored (e.g.
   "2026-08-01T00:00:00.000Z"). Format and slice in UTC so the calendar day never
   shifts under the browser's local timezone (Chile is UTC-3/-4). */
export function formatCampaignDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
/** The YYYY-MM-DD value for a <input type="date">, UTC-safe (mirrors the Comercial
    quotes `toInput`). */
export function toDateInput(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

/* ── Curated status actions per current status (MKT-003 §5) ──
   The backend machine ALLOWS more edges (e.g. ACTIVA↔BORRADOR); the UI deliberately
   offers this subset. `target` is the status endpoint's target; terminal actions
   carry a confirmation string. DELETE (BORRADOR only) is handled separately by the
   detail page (it is not a status transition). */
export interface StatusAction {
  target: CampaignStatus;
  label: string;
  confirm?: string; // present → run behind window.confirm (terminal actions)
  danger?: boolean; // red styling
}
export const STATUS_ACTIONS: Record<string, StatusAction[]> = {
  BORRADOR: [{ target: 'ACTIVA', label: 'Activar' }],
  ACTIVA: [
    { target: 'PAUSADA', label: 'Pausar' },
    {
      target: 'FINALIZADA',
      label: 'Finalizar',
      confirm: '¿Finalizar esta campaña? Podrás reabrirla más tarde.',
    },
    {
      target: 'CANCELADA',
      label: 'Cancelar',
      confirm: '¿Cancelar esta campaña? Podrás reabrirla más tarde.',
      danger: true,
    },
  ],
  PAUSADA: [
    { target: 'ACTIVA', label: 'Reanudar' },
    {
      target: 'FINALIZADA',
      label: 'Finalizar',
      confirm: '¿Finalizar esta campaña? Podrás reabrirla más tarde.',
    },
    {
      target: 'CANCELADA',
      label: 'Cancelar',
      confirm: '¿Cancelar esta campaña? Podrás reabrirla más tarde.',
      danger: true,
    },
  ],
  FINALIZADA: [{ target: 'ACTIVA', label: 'Reabrir' }],
  CANCELADA: [{ target: 'ACTIVA', label: 'Reabrir' }],
};

/* ── Derived badges (MKT-005 §6) ── computed at read time by the backend
   (overBudget / endingSoon) and rendered identically in the campaigns list rows and
   the detail header. Labels + styles centralized here (single source of truth).
   "Sobre presupuesto" = danger; "Termina en 7 días" = warning. */
const OVER_BUDGET_STYLE: React.CSSProperties = {
  background: 'rgba(239,68,68,0.12)',
  color: '#b91c1c',
};
const ENDING_SOON_STYLE: React.CSSProperties = {
  background: 'rgba(234,179,8,0.14)',
  color: '#a16207',
};

export function CampaignDerivedBadges({
  overBudget,
  endingSoon,
}: {
  overBudget?: boolean;
  endingSoon?: boolean;
}) {
  if (!overBudget && !endingSoon) return null;
  return (
    <>
      {overBudget && (
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={OVER_BUDGET_STYLE}
        >
          Sobre presupuesto
        </span>
      )}
      {endingSoon && (
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={ENDING_SOON_STYLE}
        >
          Termina en 7 días
        </span>
      )}
    </>
  );
}
