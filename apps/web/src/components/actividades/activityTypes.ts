/* CAL-005 — client view-models for the Actividades calendar. Mirror the CAL-003 API shapes
   (GET /actividades/calendar and /activities return the raw Prisma rows). startDate/endDate are
   @db.Date, serialized as "YYYY-MM-DDT00:00:00.000Z" (UTC midnight — the stored calendar day).
   startTime is a wall-clock "HH:mm" STRING, never a timestamp. */

export type ActivityStatus = 'PENDIENTE' | 'EN_EJECUCION' | 'HECHA' | 'CANCELADA';

export interface CalendarActivity {
  id: string;
  companyId: string;
  title: string;
  areaId: string;
  startDate: string; // "YYYY-MM-DDT00:00:00.000Z"
  endDate: string | null; // "YYYY-MM-DDT00:00:00.000Z" | null
  startTime: string | null; // "HH:mm" wall-clock, or null (untimed)
  assigneeId: string | null;
  status: ActivityStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // CAL-008/009 read-time derived fields — present on the LIST + DETAIL payloads (not on the
  // calendar feed, which returns raw rows). Optional so both shapes typecheck.
  dueDate?: string;
  overdue?: boolean;
  notesCount?: number;
  latestNote?: { text: string; createdAt: string } | null;
}

export interface ActivityArea {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
}

/* CAL-008 — a company member option for the Responsable select + author-name resolution
   (GET /actividades/members). Structurally { userId, displayName } only. */
export interface MemberOption {
  userId: string;
  displayName: string;
}

/* CAL-009 — a bitácora entry (GET /actividades/activities/:id/notes). Immutable: no updatedAt.
   authorId is resolved to a name via the members map. */
export interface ActivityNote {
  id: string;
  activityId: string;
  authorId: string;
  text: string;
  createdAt: string;
  updatedAt: string | null; // CAL-012 — null = never edited; set only on edit (the "editada" marker)
}

/* CAL-006 — the birthday feed entry (GET /actividades/calendar → { activities, birthdays }).
   PII-safe by construction (decision d): name + day/month of ACTIVE employees, NEVER the year.
   employeeId is a render key only — never linked or resolved. Mirror of the backend
   BirthdayReadService.BirthdayEntry; the shape carries nothing else on purpose. */
export interface BirthdayEntry {
  employeeId: string;
  fullName: string;
  day: number;
  month: number;
}
