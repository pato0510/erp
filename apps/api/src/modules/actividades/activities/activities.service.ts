import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

interface ListFilters {
  status?: ActivityStatus;
  areaId?: string;
  from?: string;
  to?: string;
}

/* CAL-003 — the calendar-activity status machine, as directed adjacency (current → allowed
   targets). No self-loops, so same-status moves are rejected (the COM-005 convention). The
   allowed edges (§2.2 / decision e):
   - PENDIENTE → HECHA          (mark done)
   - HECHA     → PENDIENTE       (undo a misclick)
   - PENDIENTE → CANCELADA       (cancel)
   - CANCELADA → PENDIENTE       (reactivate)
   HECHA ↔ CANCELADA is intentionally absent (you reopen to PENDIENTE first). */
const STATUS_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  [ActivityStatus.PENDIENTE]: [ActivityStatus.HECHA, ActivityStatus.CANCELADA],
  [ActivityStatus.HECHA]: [ActivityStatus.PENDIENTE],
  [ActivityStatus.CANCELADA]: [ActivityStatus.PENDIENTE],
};

/* CAL-003 — Calendar activities.
 *
 * EDIT-IN-ANY-STATUS (deliberate contrast with campaigns): PATCH /:id edits general fields in
 * ANY status — PENDIENTE, HECHA or CANCELADA. Campaigns freeze general edits once closed
 * (CLOSED_STATUSES + reopen); this module does NOT, because a calendar is a planning tool, not
 * a financial ledger (decision b spirit). The only gated mutation is the status move itself
 * (PATCH /:id/status), which honors the machine above. DELETE is likewise always allowed for
 * writers, any status (decision b).
 *
 * DATES: startDate/endDate are @db.Date, anchored to UTC midnight end-to-end (HR-004b) so the
 * column never suffers the timezone off-by-one. `startTime` is a wall-clock "HH:mm" STRING —
 * validated by regex in the DTO, stored and compared AS A STRING; it is NEVER passed to a Date
 * constructor anywhere in this service. */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Anchor a YYYY-MM-DD string to UTC midnight (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async getActivityOrThrow(id: string, companyId: string) {
    const activity = await this.prisma.calendarActivity.findFirst({ where: { id, companyId } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    return activity;
  }

  /** The area must exist, belong to the company AND be active — otherwise 400. Only called
   *  when areaId is being set (create) or CHANGED (update); an unchanged area is never
   *  re-checked, so an activity whose area was deactivated later stays editable (as long as
   *  its areaId is not touched). */
  private async assertAreaUsable(companyId: string, areaId: string) {
    const area = await this.prisma.activityArea.findFirst({ where: { id: areaId, companyId } });
    if (!area) {
      throw new BadRequestException('El área indicada no existe.');
    }
    if (!area.active) {
      throw new BadRequestException('El área indicada está inactiva; elige un área activa.');
    }
  }

  /** Cross-field date/time rules, evaluated on the EFFECTIVE (post-write) values. Never parses
   *  startTime as a Date — it only checks its presence against the multi-day span. */
  private assertDateTimeRules(start: Date, end: Date | null, startTime: string | null) {
    if (end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        'La fecha de término no puede ser anterior a la fecha de inicio.',
      );
    }
    const isMultiDay = end !== null && end.getTime() !== start.getTime();
    if (startTime && isMultiDay) {
      throw new BadRequestException('La hora solo puede indicarse en actividades de un único día.');
    }
  }

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.CalendarActivityWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.areaId) where.areaId = filters.areaId;
    if (filters.from || filters.to) {
      where.startDate = {};
      if (filters.from) where.startDate.gte = this.toDateOnly(filters.from);
      if (filters.to) where.startDate.lte = this.toDateOnly(filters.to);
    }
    return this.prisma.calendarActivity.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    return this.getActivityOrThrow(id, companyId);
  }

  async create(companyId: string, userId: string, dto: CreateActivityDto) {
    await this.assertAreaUsable(companyId, dto.areaId);
    const start = this.toDateOnly(dto.startDate);
    const end = dto.endDate ? this.toDateOnly(dto.endDate) : null;
    const startTime = dto.startTime ?? null;
    this.assertDateTimeRules(start, end, startTime);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.calendarActivity.create({
        data: {
          companyId,
          createdBy: userId,
          title: dto.title.trim(),
          areaId: dto.areaId,
          startDate: start,
          endDate: end,
          startTime,
          assigneeId: dto.assigneeId ?? null,
          notes: dto.notes ?? null,
          // status is NEVER taken from the DTO — a fresh activity is always PENDIENTE.
          status: ActivityStatus.PENDIENTE,
        },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateActivityDto) {
    const existing = await this.getActivityOrThrow(id, companyId);

    // The active-area check applies ONLY when areaId is being changed to a different value.
    if (dto.areaId !== undefined && dto.areaId !== existing.areaId) {
      await this.assertAreaUsable(companyId, dto.areaId);
    }

    // Effective (post-write) values for the cross-field rules.
    const start = dto.startDate !== undefined ? this.toDateOnly(dto.startDate) : existing.startDate;
    const end =
      dto.endDate !== undefined
        ? dto.endDate
          ? this.toDateOnly(dto.endDate)
          : null
        : existing.endDate;
    const startTime = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    this.assertDateTimeRules(start, end, startTime);

    const data: Prisma.CalendarActivityUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.areaId !== undefined) data.areaId = dto.areaId;
    if (dto.startDate !== undefined) data.startDate = start;
    if (dto.endDate !== undefined) data.endDate = end;
    if (dto.startTime !== undefined) data.startTime = dto.startTime ?? null;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId ?? null;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.calendarActivity.update({ where: { id }, data });
    });
  }

  async changeStatus(id: string, companyId: string, userId: string, target: ActivityStatus) {
    const activity = await this.getActivityOrThrow(id, companyId);
    const allowed = STATUS_TRANSITIONS[activity.status];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${activity.status} → ${target}.`,
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.calendarActivity.update({ where: { id }, data: { status: target } });
    });
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.getActivityOrThrow(id, companyId);
    // DELETE is always allowed for writers, in any status (decision b) — a calendar typo must
    // be one click to remove.
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.calendarActivity.delete({ where: { id } });
    });
  }

  /** CAL-003 — the month FEED (surfaced at GET /actividades/calendar). Month bounds are
   *  clamped in UTC (the MKT-004 recipe): [firstDay, firstDayOfNextMonth). Returns single-day
   *  activities that fall inside the month AND ranged activities that INTERSECT it, EXCLUDING
   *  CANCELADA (Part 1 §5 / decision e — cancelled activities never paint on the calendar,
   *  though they remain reachable via the list's ?status=CANCELADA filter). CAL-006 will fold
   *  a `birthdays` array into this same envelope. */
  async monthFeed(companyId: string, month: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) {
      throw new BadRequestException('El mes debe tener el formato YYYY-MM.');
    }
    const year = Number(m[1]);
    const mon = Number(m[2]);
    if (mon < 1 || mon > 12) {
      throw new BadRequestException('El mes debe estar entre 01 y 12.');
    }
    const monthStart = new Date(Date.UTC(year, mon - 1, 1));
    const nextMonthStart = new Date(Date.UTC(year, mon, 1));

    const activities = await this.prisma.calendarActivity.findMany({
      where: {
        companyId,
        status: { not: ActivityStatus.CANCELADA },
        OR: [
          // Single-day: no endDate, startDate lands inside the month.
          { endDate: null, startDate: { gte: monthStart, lt: nextMonthStart } },
          // Ranged: intersects the month iff it starts before the month ends AND ends on/after
          // the month begins (an endDate comparison never matches a NULL, so single-day rows
          // only enter through the branch above — no double counting).
          { endDate: { gte: monthStart }, startDate: { lt: nextMonthStart } },
        ],
      },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    });

    return { activities };
  }
}
