import React from 'react';
import { FileText, HardHat, Mail, Phone, Users } from 'lucide-react';

/* COM-008 — shared Comercial activity label maps + type icons. Mirrors stageLabels /
   accountLabels: ASCII enum keys → Spanish display labels (never render the raw enum).
   Icons come from lucide-react, the icon set used across the app. Reused by the
   account-ficha and opportunity-detail timelines and the register/edit modal. */

export const ACTIVITY_TYPES = ['LLAMADA', 'REUNION', 'EMAIL', 'VISITA_FAENA', 'NOTA'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LLAMADA: 'Llamada',
  REUNION: 'Reunión',
  EMAIL: 'Email',
  VISITA_FAENA: 'Visita a faena',
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

/** Round icon chip for a timeline entry. */
export function ActivityTypeIcon({ type }: { type: string }) {
  const Icon = ACTIVITY_TYPE_ICON[type] ?? FileText;
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={activityTypeStyle(type)}
      title={ACTIVITY_TYPE_LABELS[type] ?? type}
    >
      <Icon size={15} />
    </span>
  );
}
