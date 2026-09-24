import React from 'react';
import { FileText, HardHat, Mail, Phone, Users } from 'lucide-react';

/* COM-008 — shared Comercial action label maps + type icons. Mirrors stageLabels /
   accountLabels: ASCII enum keys → Spanish display labels (never render the raw enum).
   Icons come from lucide-react, the icon set used across the app. Reused by ActionList
   (table, opportunity ficha, Cuentas) and ActionEditModal.
   COM-026 — the user-facing word is «acción»; the code keeps Activity / ActivityType.
   Also home of the action state labels and the ONE map of lastUpdate.kind → text. */

export const ACTIVITY_TYPES = ['LLAMADA', 'REUNION', 'EMAIL', 'VISITA_FAENA', 'NOTA'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LLAMADA: 'Llamada',
  REUNION: 'Reunión',
  EMAIL: 'Correo',
  VISITA_FAENA: 'Visita técnica', // COM-025 — label only; the enum stays VISITA_FAENA
  NOTA: 'Nota',
};

// Icon component per type (phone / users / mail / hard-hat / sticky-note-ish).
export const ACTIVITY_TYPE_ICON: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  LLAMADA: Phone,
  REUNION: Users,
  EMAIL: Mail,
  VISITA_FAENA: HardHat,
  NOTA: FileText,
};

export function activityTypeStyle(type: string): React.CSSProperties {
  switch (type) {
    case 'LLAMADA':
      return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };
    case 'REUNION':
      return { background: 'rgba(139,92,246,0.14)', color: '#6d28d9' };
    case 'EMAIL':
      return { background: 'rgba(6,182,212,0.14)', color: '#0e7490' };
    case 'VISITA_FAENA':
      return { background: 'rgba(234,179,8,0.14)', color: '#a16207' };
    default: // NOTA
      return { background: 'rgba(100,116,139,0.14)', color: '#475569' };
  }
}

/** Round icon chip for an action (decorative: the type label is always written next to it). */
export function ActivityTypeIcon({ type, small = false }: { type: string; small?: boolean }) {
  const Icon = ACTIVITY_TYPE_ICON[type] ?? FileText;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${
        small ? 'h-7 w-7' : 'h-8 w-8'
      }`}
      style={activityTypeStyle(type)}
    >
      <Icon size={small ? 14 : 15} />
    </span>
  );
}

/* ── COM-026 — action state (PENDIENTE / HECHA from the api; «Vencida» and «Sistema» are
   display states: overdue is the api's derived flag, system rows carry status null) ── */

export type ActionState = 'PENDIENTE' | 'VENCIDA' | 'HECHA' | 'SISTEMA';

export const ACTION_STATE_LABELS: Record<ActionState, string> = {
  PENDIENTE: 'Pendiente',
  VENCIDA: 'Vencida',
  HECHA: 'Hecha',
  SISTEMA: 'Registro del sistema', // COM-027 — says what the row is
};

/* ── COM-026 — «Actualización»: what the api's lastUpdate.kind means, in one place ── */

export const LAST_UPDATE_KIND_LABELS: Record<string, string> = {
  CREACION: 'Oportunidad creada',
  CAMBIO_ETAPA: 'Cambio de etapa',
  PAUSA: 'Cambio de etapa',
  REANUDACION: 'Cambio de etapa',
  GANADA: 'Cambio de etapa',
  PERDIDA: 'Cambio de etapa',
  REAPERTURA: 'Cambio de etapa',
  VALOR_ESTIMADO: 'Valor estimado definido',
  FECHA_CIERRE: 'Fecha de cierre definida',
  PROBABILIDAD: 'Probabilidad ajustada',
  LEAD: 'Lead vinculado',
  LEAD_DESVINCULADO: 'Lead desvinculado', // COM-029
  RESPONSABLE: 'Responsable cambiado',
  CUENTA_CLIENTE: 'Cuenta pasa a Cliente',
  ACCION_AGREGADA: 'Acción agregada',
  ACCION_COMPLETADA: 'Acción completada',
  ACCION_REABIERTA: 'Acción reabierta',
  ACCION_ELIMINADA: 'Acción eliminada',
  SISTEMA: 'Registro del sistema',
};

/** Short text for a lastUpdate.kind; SISTEMA or any unknown kind → «Registro del sistema». */
export const lastUpdateKindLabel = (kind: string | null | undefined) =>
  (kind && LAST_UPDATE_KIND_LABELS[kind]) || LAST_UPDATE_KIND_LABELS.SISTEMA;
