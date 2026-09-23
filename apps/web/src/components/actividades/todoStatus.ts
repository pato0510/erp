/* GO-004 — the one vocabulary of the to-do board: status and priority labels, their
 * full-cell fills, and the Santiago-date rules behind the table's groups and the
 * Cronograma bar. Status order = the api's enum order (GO-003: DONE last).
 *
 * Fills: every text/fill pair is ≥ 4.5:1 in BOTH themes (measured in GO-004's QA).
 * Pendiente is neutral through theme tokens only (UI-001); the other fills are
 * semantic colours, identical in both themes because they are saturated enough for
 * either background. Priority uses a blue/indigo scale so it never shares a hue with
 * a status. */

import { addDays, civilDate, daysBetween, santiagoDate } from '../../lib/dates';

export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
export type TodoPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export const TODO_STATUS_ORDER: TodoStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'IN_REVIEW',
  'BLOCKED',
  'DONE',
];

export const TODO_STATUS: Record<TodoStatus, { label: string; fill: string; bar: string }> = {
  PENDING: { label: 'Pendiente', fill: 'bg-subtle text-fg', bar: 'bg-fg-muted' },
  IN_PROGRESS: { label: 'En curso', fill: 'bg-amber-400 text-amber-950', bar: 'bg-amber-400' },
  IN_REVIEW: { label: 'En revisión', fill: 'bg-violet-600 text-white', bar: 'bg-violet-600' },
  BLOCKED: { label: 'Detenida', fill: 'bg-red-600 text-white', bar: 'bg-red-600' },
  DONE: { label: 'Hecha', fill: 'bg-green-700 text-white', bar: 'bg-green-700' },
};

export const TODO_PRIORITY: Record<TodoPriority, { label: string; fill: string }> = {
  HIGH: { label: 'Alta', fill: 'bg-indigo-900 text-white' },
  MEDIUM: { label: 'Media', fill: 'bg-blue-600 text-white' },
  LOW: { label: 'Baja', fill: 'bg-sky-200 text-sky-950' },
};

export const isOpenStatus = (status: TodoStatus) => status !== 'DONE';

/* ── Santiago calendar dates (CAL-008b doctrine: never the UTC date) ──
 * The shared helpers live in lib/dates.ts since COM-025; re-exported here so GO-004's
 * imports stay as they were. */

export {
  santiagoDate,
  santiagoToday,
  addDays,
  daysBetween,
  civilDate,
  formatDmy,
} from '../../lib/dates';

/** The Sunday closing the Monday–Sunday week that contains `today`. */
export function weekEnd(today: string): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

/** dd-mm (kanban card). */
export const formatDm = (ymd: string) => `${ymd.slice(8, 10)}-${ymd.slice(5, 7)}`;

/* ── Table groups ── */

export type TodoGroupKey = 'overdue' | 'thisWeek' | 'nextWeek' | 'later' | 'noDue' | 'done';

export const TODO_GROUPS: { key: TodoGroupKey; label: string; accent: string }[] = [
  { key: 'overdue', label: 'Vencidos', accent: 'bg-red-600' },
  { key: 'thisWeek', label: 'Esta semana', accent: 'bg-amber-400' },
  { key: 'nextWeek', label: 'Próxima semana', accent: 'bg-blue-600' },
  { key: 'later', label: 'Más adelante', accent: 'bg-indigo-900' },
  { key: 'noDue', label: 'Sin plazo', accent: 'bg-fg-muted' },
  { key: 'done', label: 'Hechos (últimos 30 días)', accent: 'bg-green-700' },
];

/** The deadline group of a row for a given Santiago `today` (weeks start on Monday). */
export function groupOf(
  row: { status: TodoStatus; dueDate: string | null },
  today: string,
): TodoGroupKey {
  if (row.status === 'DONE') return 'done';
  if (!row.dueDate) return 'noDue';
  const due = civilDate(row.dueDate);
  if (due < today) return 'overdue';
  const sunday = weekEnd(today);
  if (due <= sunday) return 'thisWeek';
  if (due <= addDays(sunday, 7)) return 'nextWeek';
  return 'later';
}

/* ── Cronograma ── */

export interface Timeline {
  /** 0–1 filled fraction, or null when there is no deadline («—»). */
  fraction: number | null;
  tone: 'progress' | 'overdue' | 'done';
  label: string;
}

/** Bar from createdAt to dueDate: elapsed fraction; overdue → full red; done → full green. */
export function timelineOf(
  row: { status: TodoStatus; dueDate: string | null; createdAt: string },
  today: string,
): Timeline {
  if (row.status === 'DONE') return { fraction: 1, tone: 'done', label: 'Completada' };
  if (!row.dueDate) return { fraction: null, tone: 'progress', label: 'Sin plazo' };
  const due = civilDate(row.dueDate);
  const left = daysBetween(today, due);
  if (left < 0) {
    const ago = -left;
    return {
      fraction: 1,
      tone: 'overdue',
      label: `Venció hace ${ago} ${ago === 1 ? 'día' : 'días'}`,
    };
  }
  const start = santiagoDate(row.createdAt);
  const span = daysBetween(start, due);
  const fraction = span <= 0 ? 1 : Math.min(1, Math.max(0, daysBetween(start, today) / span));
  const label =
    left === 0
      ? 'Vence hoy'
      : `${left === 1 ? 'Queda' : 'Quedan'} ${left} ${left === 1 ? 'día' : 'días'}`;
  return { fraction, tone: 'progress', label };
}
