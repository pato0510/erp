import type { ActivityStatus } from './activityTypes';

/* CAL-010 — the status machine's legal targets, MIRRORING the backend STATUS_TRANSITIONS
   (activities.service.ts) exactly. The UI offers ONLY these targets from a given status; the
   backend re-validates every move (PATCH /:id/status), so this is a convenience, never the
   authority. Must stay in lockstep with the backend map. */
export const STATUS_TARGETS: Record<ActivityStatus, ActivityStatus[]> = {
  PENDIENTE: ['EN_EJECUCION', 'HECHA', 'CANCELADA'],
  EN_EJECUCION: ['PENDIENTE', 'HECHA', 'CANCELADA'],
  HECHA: ['PENDIENTE', 'EN_EJECUCION'],
  CANCELADA: ['PENDIENTE'],
};

/* CAL-008/010 — the display map (labels + badge colors). Shared by the Gestión table and the
   calendar detail modal so a status reads identically everywhere. */
export const STATUS_LABEL: Record<ActivityStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_EJECUCION: 'En ejecución',
  HECHA: 'Hecha',
  CANCELADA: 'Cancelada',
};

export const STATUS_STYLE: Record<ActivityStatus, { bg: string; color: string }> = {
  PENDIENTE: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },
  EN_EJECUCION: { bg: 'rgba(245,158,11,0.14)', color: '#b45309' }, // amber "in progress"
  HECHA: { bg: 'rgba(34,197,94,0.12)', color: '#15803d' },
  CANCELADA: { bg: 'rgba(100,116,139,0.14)', color: '#475569' },
};
