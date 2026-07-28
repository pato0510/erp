/* HSEC-005 — shared types + display maps for the incidents UI. Labels/badges follow the
 * actividades statusMachine.ts idiom: ASCII enum members from the API, Spanish display
 * labels + badge colors mapped ONCE here so every screen reads identically. */

export type HsecIncidentType =
  | 'ACCIDENTE_TRABAJO'
  | 'ACCIDENTE_TRAYECTO'
  | 'CASI_INCIDENTE'
  | 'DANO_MATERIAL'
  | 'AMBIENTAL';
export type HsecIncidentSeverity = 'LEVE' | 'GRAVE' | 'FATAL';
export type HsecIncidentStatus = 'REPORTADO' | 'EN_INVESTIGACION' | 'CERRADO';

export interface IncidentPerson {
  id: string;
  employeeId: string;
  fullName: string | null;
  injuryType: string | null;
  bodyPart: string | null;
  medicalAttention: boolean;
  lostDays: number | null;
  detail: string | null;
}

export interface IncidentAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface HsecIncident {
  id: string;
  incidentNumber: string;
  type: HsecIncidentType;
  severity: HsecIncidentSeverity;
  status: HsecIncidentStatus;
  occurredDate: string; // @db.Date UTC-midnight ISO — render ONLY via formatIncidentDate
  occurredTime: string | null; // wall-clock "HH:mm" string — never parsed as a Date
  location: string;
  description: string;
  immediateCause: string | null;
  correctiveActions: string | null;
  attachments?: IncidentAttachment[];
  persons?: IncidentPerson[];
  createdAt: string;
}

export interface RosterEntry {
  employeeId: string;
  fullName: string;
}

/* HSEC-005 — the status machine's legal targets, MIRRORING the backend STATUS_TRANSITIONS
   (apps/api/src/modules/hsec/incidents/incidents.service.ts) exactly — PART1 §3: REPORTADO ↔
   EN_INVESTIGACION · REPORTADO → CERRADO · EN_INVESTIGACION → CERRADO · CERRADO →
   EN_INVESTIGACION (reopen). The UI offers ONLY these targets from a given status; the
   backend re-validates every move (PATCH /:id/status), so this is a convenience, never the
   authority. Must stay in lockstep with the backend map. */
export const INCIDENT_STATUS_TARGETS: Record<HsecIncidentStatus, HsecIncidentStatus[]> = {
  REPORTADO: ['EN_INVESTIGACION', 'CERRADO'],
  EN_INVESTIGACION: ['REPORTADO', 'CERRADO'],
  CERRADO: ['EN_INVESTIGACION'],
};

export const TYPE_LABEL: Record<HsecIncidentType, string> = {
  ACCIDENTE_TRABAJO: 'Accidente del trabajo',
  ACCIDENTE_TRAYECTO: 'Accidente de trayecto',
  CASI_INCIDENTE: 'Casi incidente',
  DANO_MATERIAL: 'Daño material',
  AMBIENTAL: 'Ambiental',
};

export const STATUS_LABEL: Record<HsecIncidentStatus, string> = {
  REPORTADO: 'Reportado',
  EN_INVESTIGACION: 'En investigación',
  CERRADO: 'Cerrado',
};

export const STATUS_STYLE: Record<HsecIncidentStatus, { bg: string; color: string }> = {
  REPORTADO: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },
  EN_INVESTIGACION: { bg: 'rgba(245,158,11,0.14)', color: '#b45309' },
  CERRADO: { bg: 'rgba(34,197,94,0.12)', color: '#15803d' },
};

/* Escalating visual weight: LEVE muted, GRAVE amber, FATAL red + heavier. */
export const SEVERITY_LABEL: Record<HsecIncidentSeverity, string> = {
  LEVE: 'Leve',
  GRAVE: 'Grave',
  FATAL: 'Fatal',
};

export const SEVERITY_STYLE: Record<
  HsecIncidentSeverity,
  { bg: string; color: string; weight: number }
> = {
  LEVE: { bg: 'rgba(100,116,139,0.14)', color: '#475569', weight: 500 },
  GRAVE: { bg: 'rgba(245,158,11,0.18)', color: '#b45309', weight: 600 },
  FATAL: { bg: 'rgba(220,38,38,0.16)', color: '#b91c1c', weight: 700 },
};

/* HSEC-005 — DATE-TRAP-safe render (the Gestión formatCierre idiom): occurredDate is a
   @db.Date UTC-midnight ISO; formatting it in the browser's LOCAL zone (Chile, UTC-3/-4)
   would render the PREVIOUS day. `timeZone: 'UTC'` pins the formatter to the stored
   calendar day — the value never passes through a local-zone Date render. */
export function formatIncidentDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
