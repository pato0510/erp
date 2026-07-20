/* CAL-005 — client view-models for the Actividades calendar. Mirror the CAL-003 API shapes
   (GET /actividades/calendar and /activities return the raw Prisma rows). startDate/endDate are
   @db.Date, serialized as "YYYY-MM-DDT00:00:00.000Z" (UTC midnight — the stored calendar day).
   startTime is a wall-clock "HH:mm" STRING, never a timestamp. */

export type ActivityStatus = 'PENDIENTE' | 'HECHA' | 'CANCELADA';

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
}

export interface ActivityArea {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
}
