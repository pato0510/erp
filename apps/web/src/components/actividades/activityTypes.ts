/* CAL-005 — client view-models for the Actividades calendar. Mirror the CAL-003 API shapes
   (GET /actividades/calendar and /activities return the raw Prisma rows). startDate/endDate are
   @db.Date, serialized as "YYYY-MM-DDT00:00:00.000Z" (UTC midnight — the stored calendar day).
   startTime is a wall-clock "HH:mm" STRING, never a timestamp. */

export type ActivityStatus = 'PENDIENTE' | 'EN_EJECUCION' | 'HECHA' | 'CANCELADA';
export type ActivityKind = 'ACTIVIDAD' | 'SERVICIO'; // CAL-014 — the view lens

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
  kind: ActivityKind; // CAL-014 — ACTIVIDAD | SERVICIO
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

/* CAL-016 — the ops status vocabulary, VERBATIM (RECIBIDA·EN_EJECUCION·COMPLETADA·CANCELADA).
   Kept as its own union, NEVER mapped to ActivityStatus (the vocabulary-coexistence doctrine —
   these are different machines for different things). */
export type ServiceOrderStatusVM = 'RECIBIDA' | 'EN_EJECUCION' | 'COMPLETADA' | 'CANCELADA';

/* CAL-016 — the two Operaciones collections folded into the SAME calendar envelope
   (GET /actividades/calendar → { activities, birthdays, servicios, vencimientos }). Mirrors the
   backend OpsCalendarReadService narrowed contracts. STRUCTURALLY money-free: a servicio carries
   a label + range + ops status and NOTHING else — there is no netAmount/total/currency here, by
   design (the signed matrix). `link` is ability-shaped by the SERVER: null = the caller cannot
   read the target (the chip modal opens without a door). */
export interface ServicioCalendarEntry {
  serviceOrderId: string;
  label: string;
  executionStart: string; // "YYYY-MM-DDT00:00:00.000Z"
  executionEnd: string; // "YYYY-MM-DDT00:00:00.000Z"
  status: ServiceOrderStatusVM; // ops vocabulary, verbatim
  link: string | null; // server-shaped: '/operaciones/servicios-activos' | null
}

export interface VencimientoCalendarEntry {
  id: string;
  label: string;
  date: string; // "YYYY-MM-DDT00:00:00.000Z"
  link: string | null; // server-shaped: '/operaciones/documentos' | null
}

/* CAL-017 — the Marketing campaign status vocabulary, verbatim. Own union (not mapped). */
export type CampaignStatusVM = 'BORRADOR' | 'ACTIVA' | 'PAUSADA' | 'FINALIZADA' | 'CANCELADA';

/* CAL-017 — the two commercial-side collections in the SAME envelope. `campanas` is visible to all
   six roles; `cierres` is THE GATED collection — the KEY IS ABSENT for non-Opportunity-readers, so
   the page type marks it optional (undefined = the caller may not see it; the UI renders no chip
   and no legend entry). Both are STRUCTURALLY minimal: a campaign carries name + status + range and
   NO money; a cierre carries name + expected date and NO amount, NO stage. `link` is server-shaped
   (null = no door). */
export interface CampaignCalendarEntry {
  campaignId: string;
  name: string;
  status: CampaignStatusVM;
  startDate: string | null; // "YYYY-MM-DDT00:00:00.000Z" | null
  endDate: string | null; // "YYYY-MM-DDT00:00:00.000Z" | null
  link: string | null; // server-shaped: '/marketing/campanas/{id}' | null
}

export interface CierreCalendarEntry {
  opportunityId: string;
  name: string;
  expectedDate: string; // "YYYY-MM-DDT00:00:00.000Z"
  link: string | null; // server-shaped: '/comercial/pipeline/{id}' | null (never null in practice)
}

/* CAL-018 — an RRHH not-available window (ausencia). STRUCTURALLY minimal: employeeId + fullName +
   range. NO category, NO medicalFolio, NO healthEntity, NO type/motivo, NO status — the health PII
   has no slot to leak into (the CAL-006 discipline). "No disponible" is a UI constant, not a field.
   Visible to all six roles; `link` is server-shaped (Employee readers only → RRHH employee page). */
export interface AusenciaCalendarEntry {
  employeeId: string;
  fullName: string;
  startDate: string; // "YYYY-MM-DDT00:00:00.000Z"
  endDate: string; // "YYYY-MM-DDT00:00:00.000Z"
  link: string | null; // server-shaped: '/rrhh/trabajadores/{id}' | null
}
