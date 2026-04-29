/* OPS-030 — view-models for the calendar feed. Mirror the API
   shapes from operations-calendar.service.ts loosely; we keep them
   non-discriminated so individual views can pick the metadata
   fields they need without shape ceremony. */

export type CalendarEventType =
  | 'document_expiration'
  | 'permit_expiration'
  | 'work_permit_scheduled'
  | 'acknowledgment_deadline'
  | 'exception_expiration'
  | 'procedure_published';

export type CalendarSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKING';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  endDate?: string;
  severity: CalendarSeverity;
  metadata: Record<string, unknown>;
  linkPath: string;
}

export interface CalendarEventsResponse {
  events: CalendarEvent[];
  summary: {
    total: number;
    byType: Record<CalendarEventType, number>;
    bySeverity: Record<Lowercase<CalendarSeverity>, number>;
    byMonth: Record<string, number>;
  };
}

export interface MonthSummaryResponse {
  year: number;
  month: number;
  days: Record<string, { criticalCount: number; warningCount: number; infoCount: number }>;
}

export type CalendarView = 'month' | 'week' | 'day' | 'list';

export interface CalendarFilters {
  types: CalendarEventType[];
  assetId: string | null;
  locationId: string | null;
  severity: CalendarSeverity | null;
}

/* Per-type meta — color, icon name, accessible label. Centralized
   here so MonthView / WeekView / DayView / ListView all stay in
   visual sync. The icon is picked from lucide-react in the view
   components themselves so this file stays runtime-light. */
export const TYPE_META: Record<
  CalendarEventType,
  { label: string; short: string; color: string; bg: string }
> = {
  document_expiration: {
    label: 'Documento',
    short: 'DOC',
    color: '#b91c1c',
    bg: 'rgba(239,68,68,0.14)',
  },
  permit_expiration: {
    label: 'Permiso externo',
    short: 'PERMISO',
    color: '#0f766e',
    bg: 'rgba(15,118,110,0.14)',
  },
  work_permit_scheduled: {
    label: 'PT programado',
    short: 'PT',
    color: '#c2410c',
    bg: 'rgba(234,88,12,0.14)',
  },
  acknowledgment_deadline: {
    label: 'Acuse',
    short: 'ACUSE',
    color: '#1d4ed8',
    bg: 'rgba(37,99,235,0.14)',
  },
  exception_expiration: {
    label: 'Excepción',
    short: 'EXC',
    color: '#a16207',
    bg: 'rgba(234,179,8,0.18)',
  },
  procedure_published: {
    label: 'Procedimiento',
    short: 'PROC',
    color: '#15803d',
    bg: 'rgba(34,197,94,0.14)',
  },
};

export const SEVERITY_META: Record<CalendarSeverity, { label: string; color: string; bg: string }> =
  {
    INFO: { label: 'Info', color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' },
    WARNING: { label: 'Warning', color: '#a16207', bg: 'rgba(234,179,8,0.14)' },
    CRITICAL: { label: 'Crítica', color: '#c2410c', bg: 'rgba(249,115,22,0.14)' },
    BLOCKING: { label: 'Bloqueante', color: '#b91c1c', bg: 'rgba(239,68,68,0.14)' },
  };

export const ALL_TYPES: CalendarEventType[] = [
  'document_expiration',
  'permit_expiration',
  'work_permit_scheduled',
  'acknowledgment_deadline',
  'exception_expiration',
  'procedure_published',
];

export const ALL_SEVERITIES: CalendarSeverity[] = ['INFO', 'WARNING', 'CRITICAL', 'BLOCKING'];
