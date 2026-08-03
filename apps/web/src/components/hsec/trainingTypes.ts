/* HSEC-007 — shared types + display maps for the trainings UI (the incidentTypes.ts sibling).
 * The date-trap-safe formatter and file-size helper are REUSED from incidentTypes.ts (same
 * function, same @db.Date UTC-midnight input — no second copy to drift). */

export type HsecTrainingType = 'CHARLA' | 'INDUCCION' | 'CAPACITACION';

export interface TrainingAttendee {
  id: string;
  employeeId: string;
  fullName: string | null;
}

/* The SHAPED list row (the HSEC-006 list payload: no blob, attendeesCount folded in). */
export interface TrainingListRow {
  id: string;
  type: HsecTrainingType;
  topic: string;
  date: string; // @db.Date UTC-midnight ISO — render ONLY via formatDbDate
  time: string | null; // wall-clock "HH:mm" string — never parsed as a Date
  durationMinutes: number | null;
  instructorName: string;
  notes: string | null;
  fileName: string | null; // planilla indicator on the list: non-null = has file
  fileSize: number | null;
  createdAt: string;
  attendeesCount: number;
}

/* The SHAPED detail (hasFile derived server-side; attendees name-resolved via the leaf). */
export interface TrainingDetail extends Omit<TrainingListRow, 'attendeesCount'> {
  mimeType: string | null;
  filePath: string | null;
  hasFile: boolean;
  attendees: TrainingAttendee[];
}

export const TRAINING_TYPE_LABEL: Record<HsecTrainingType, string> = {
  CHARLA: 'Charla',
  INDUCCION: 'Inducción',
  CAPACITACION: 'Capacitación',
};

export const TRAINING_TYPE_STYLE: Record<HsecTrainingType, { bg: string; color: string }> = {
  CHARLA: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },
  INDUCCION: { bg: 'rgba(13,148,136,0.14)', color: '#0f766e' },
  CAPACITACION: { bg: 'rgba(124,58,237,0.12)', color: '#6d28d9' },
};
