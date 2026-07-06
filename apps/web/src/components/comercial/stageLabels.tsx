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

/* LostReason enum (COM-005). "Canceló el proyecto" is the display for
   PROYECTO_CANCELADO; detail is required ONLY for OTRO (enforced in the modal AND
   ultimately by the backend 400). */
export const LOST_REASONS = ['PRECIO', 'COMPETENCIA', 'PROYECTO_CANCELADO', 'OTRO'] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const LOST_REASON_LABELS: Record<string, string> = {
  PRECIO: 'Precio',
  COMPETENCIA: 'Competencia',
  PROYECTO_CANCELADO: 'Canceló el proyecto',
  OTRO: 'Otro',
};

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
