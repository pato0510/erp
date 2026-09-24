import React from 'react';

/* COM-007 — shared Comercial pipeline label maps + badges. Mirrors accountLabels:
   ASCII enum keys → Spanish display labels (never render the raw enum). Colors are
   inline React.CSSProperties (same convention as accountLabels). Reused by the
   kanban board, the pipeline cards and the minimal opportunity detail.

   The stage machine itself lives entirely in the backend (COM-005); this module is
   pure presentation + the client-side classification the board needs (which columns
   accept drops, which cards are draggable). */

// Column order for the board (display order). Active stages first, then EN_PAUSA,
// then the semi-terminal closed stages.
export const STAGE_ORDER = [
  'PROSPECTO',
  'CONTACTO',
  'VISITA_TECNICA',
  'COTIZACION',
  'NEGOCIACION',
  'EN_PAUSA',
  'GANADA',
  'PERDIDA',
] as const;
export type OpportunityStage = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<string, string> = {
  PROSPECTO: 'Prospecto',
  CONTACTO: 'Contacto',
  VISITA_TECNICA: 'Visita Técnica',
  COTIZACION: 'Cotización',
  NEGOCIACION: 'Negociación',
  EN_PAUSA: 'En Pausa',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
};

// The five freely-interchangeable active stages (Rule 1). A card in one of these
// can be dragged to any other active column, to EN_PAUSA, or to a closed column.
export const ACTIVE_STAGES: OpportunityStage[] = [
  'PROSPECTO',
  'CONTACTO',
  'VISITA_TECNICA',
  'COTIZACION',
  'NEGOCIACION',
];
// Semi-terminal — reopen-only. Cards here are NOT draggable.
export const CLOSED_STAGES: OpportunityStage[] = ['GANADA', 'PERDIDA'];

export const isActiveStage = (stage: string) => ACTIVE_STAGES.includes(stage as OpportunityStage);
export const isClosedStage = (stage: string) => CLOSED_STAGES.includes(stage as OpportunityStage);

/** COM-025 — the stages a card may move to (shared by CardMoveMenu and the table's stage
 * cell): active → the other active stages + En Pausa + Ganada + Perdida; En Pausa → the
 * five active stages; Ganada/Perdida → none (semi-terminal, Reabrir lives elsewhere). */
export function stageMoveTargets(stage: string): OpportunityStage[] {
  if (isActiveStage(stage))
    return [...ACTIVE_STAGES.filter((s) => s !== stage), 'EN_PAUSA', 'GANADA', 'PERDIDA'];
  if (stage === 'EN_PAUSA') return [...ACTIVE_STAGES];
  return [];
}

/* LostReason enum (COM-005; COM-023 adds PLAZO and SIN_RESPUESTA). The api's order and
   labels; detail is required ONLY for OTRO (enforced in the modal AND ultimately by the
   backend 400). */
export const LOST_REASONS = [
  'PRECIO',
  'PLAZO',
  'COMPETENCIA',
  'SIN_RESPUESTA',
  'PROYECTO_CANCELADO',
  'OTRO',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const LOST_REASON_LABELS: Record<string, string> = {
  PRECIO: 'Precio',
  PLAZO: 'Plazo',
  COMPETENCIA: 'Competencia',
  SIN_RESPUESTA: 'Sin respuesta del cliente',
  PROYECTO_CANCELADO: 'Canceló el proyecto',
  OTRO: 'Otro',
};

/* ── COM-027 — espejo de COM-023; el api manda ──────────────────────────────────────
   A STATIC mirror of the api's pipeline rules (precedent: lib/password-policy.ts). It
   only decides what the stage-entry dialog, quick add and the new-opportunity modal ASK
   for; the api validates every move and its 4xx is what the user sees. */

/** Stages whose entry requires an estimated value (F1). */
export const VALUE_STAGES: OpportunityStage[] = ['COTIZACION', 'NEGOCIACION', 'GANADA'];
/** Stages whose entry requires an expected close date (F1). */
export const DATE_STAGES: OpportunityStage[] = ['VISITA_TECNICA', ...VALUE_STAGES];

export function stageRequires(stage: string): { value: boolean; date: boolean } {
  return {
    value: VALUE_STAGES.includes(stage as OpportunityStage),
    date: DATE_STAGES.includes(stage as OpportunityStage),
  };
}

/** F3 — moving to an active stage BEFORE the reference is a move back (needs a reason).
 *  Reference = the current active stage; while En Pausa, previousStage (Negociación if
 *  null). Pause, win and lose are never move backs. */
export function isMoveBack(from: string, previousStage: string | null, to: string): boolean {
  if (!isActiveStage(to)) return false;
  const reference = from === 'EN_PAUSA' ? (previousStage ?? 'NEGOCIACION') : from;
  const ri = ACTIVE_STAGES.indexOf(reference as OpportunityStage);
  return ri >= 0 && ACTIVE_STAGES.indexOf(to as OpportunityStage) < ri;
}

/** Where a resume lands: previousStage, or Negociación when it is null. */
export const resumeTarget = (previousStage: string | null): OpportunityStage =>
  (previousStage as OpportunityStage | null) ?? 'NEGOCIACION';

/** The reason rule shared by move back and reopen (trimmed 3..500). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Probabilities the api accepts: 0..100, multiples of 10. */
export const PROBABILITY_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

export function stageStyle(stage: string): React.CSSProperties {
  switch (stage) {
    case 'PROSPECTO':
      return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };
    case 'CONTACTO':
      return { background: 'rgba(99,102,241,0.12)', color: '#4f46e5' };
    case 'VISITA_TECNICA':
      return { background: 'rgba(6,182,212,0.14)', color: '#0e7490' };
    case 'COTIZACION':
      return { background: 'rgba(234,179,8,0.14)', color: '#a16207' };
    case 'NEGOCIACION':
      return { background: 'rgba(139,92,246,0.14)', color: '#6d28d9' };
    case 'EN_PAUSA':
      return { background: 'rgba(100,116,139,0.14)', color: '#475569' };
    case 'GANADA':
      return { background: 'rgba(34,197,94,0.12)', color: '#15803d' };
    case 'PERDIDA':
      return { background: 'rgba(239,68,68,0.12)', color: '#b91c1c' };
    default:
      return { background: 'rgba(100,116,139,0.12)', color: '#475569' };
  }
}

/** The solid accent for a stage (column dot / left bar). */
export function stageAccent(stage: string): string {
  return stageStyle(stage).color as string;
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={stageStyle(stage)}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
