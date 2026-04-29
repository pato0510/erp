import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/* OPS-030 — calendar aggregator. Six event sources (documents,
   permits, work permits, acknowledgments, exceptions, published
   procedures) collapsed into one timeline so the UI can render
   month/week/day/list views without N+1 calls.

   Severity levels mirror the AlertSeverity enum used throughout the
   module so the frontend can reuse SEVERITY_META from AlertDetailModal. */

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
  /* Single-day events use `date`; ranged events (work permits) also
     populate `endDate`. The frontend treats `date` as DTSTART when
     producing iCal exports. */
  date: string;
  endDate?: string;
  severity: CalendarSeverity;
  metadata: Record<string, unknown>;
  linkPath: string;
}

export interface GetEventsDto {
  startDate: string;
  endDate: string;
  types?: CalendarEventType[];
  assetId?: string;
  locationId?: string;
  severity?: CalendarSeverity;
}

const ALL_TYPES: CalendarEventType[] = [
  'document_expiration',
  'permit_expiration',
  'work_permit_scheduled',
  'acknowledgment_deadline',
  'exception_expiration',
  'procedure_published',
];

@Injectable()
export class OperationsCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(companyId: string, userId: string, dto: GetEventsDto) {
    const { start, end } = this.parseRange(dto.startDate, dto.endDate);
    const types = this.resolveTypes(dto.types);
    const isAdminOrManager = await this.isAdminOrManager(companyId, userId);

    const eventLists = await Promise.all([
      types.includes('document_expiration')
        ? this.fetchDocumentExpirations(companyId, start, end, dto)
        : Promise.resolve([]),
      types.includes('permit_expiration')
        ? this.fetchPermitExpirations(companyId, start, end, dto)
        : Promise.resolve([]),
      types.includes('work_permit_scheduled')
        ? this.fetchWorkPermitsScheduled(companyId, start, end, dto)
        : Promise.resolve([]),
      types.includes('acknowledgment_deadline')
        ? this.fetchAcknowledgmentDeadlines(companyId, userId, isAdminOrManager, start, end)
        : Promise.resolve([]),
      types.includes('exception_expiration')
        ? this.fetchExceptionExpirations(companyId, start, end, dto)
        : Promise.resolve([]),
      types.includes('procedure_published')
        ? this.fetchProceduresPublished(companyId, start, end)
        : Promise.resolve([]),
    ]);

    let events = eventLists.flat();
    if (dto.severity) {
      events = events.filter((e) => e.severity === dto.severity);
    }
    events.sort((a, b) => {
      const ad = new Date(a.date).getTime();
      const bd = new Date(b.date).getTime();
      return ad - bd;
    });

    return {
      events,
      summary: this.buildSummary(events),
    };
  }

  async getEventsByDate(
    companyId: string,
    userId: string,
    date: string,
    types?: CalendarEventType[],
  ) {
    const day = this.parseDate(date);
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const end = new Date(start.getTime() + 86_400_000 - 1);
    const result = await this.getEvents(companyId, userId, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      types,
    });
    /* Filter strictly to events whose `date` falls on this day —
       work permits with multi-day spans only appear if their
       startDate is on the requested day. */
    const dayKey = start.toISOString().slice(0, 10);
    return {
      ...result,
      events: result.events.filter((e) => e.date.slice(0, 10) === dayKey),
    };
  }

  async getMonthSummary(companyId: string, userId: string, year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Año inválido.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Mes inválido (1-12).');
    }
    const start = new Date(Date.UTC(year, month - 1, 1));
    /* Last millisecond of the last day of the month. */
    const end = new Date(Date.UTC(year, month, 1) - 1);
    const { events } = await this.getEvents(companyId, userId, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    /* Aggregate per day-of-month so the UI can splat severity dots
       on a 28/30/31-cell grid. */
    type DayRow = { criticalCount: number; warningCount: number; infoCount: number };
    const byDay: Record<number, DayRow> = {};
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      byDay[d] = { criticalCount: 0, warningCount: 0, infoCount: 0 };
    }
    for (const e of events) {
      const day = new Date(e.date).getUTCDate();
      const slot = byDay[day];
      if (!slot) continue;
      if (e.severity === 'CRITICAL' || e.severity === 'BLOCKING') slot.criticalCount++;
      else if (e.severity === 'WARNING') slot.warningCount++;
      else slot.infoCount++;
    }
    return { year, month, days: byDay };
  }

  /* iCal generator. We emit a minimal but RFC-5545 compliant text
     stream so Google/Apple/Outlook can import it. UID is stable per
     event ID so re-imports update existing rows instead of
     duplicating. Body is plain ASCII; we fold long lines per spec. */
  async exportIcal(
    companyId: string,
    userId: string,
    dto: GetEventsDto,
    publicBaseUrl: string,
  ): Promise<{ filename: string; body: string }> {
    const { events } = await this.getEvents(companyId, userId, dto);
    const lines: string[] = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//Excelsia//OperationsCalendar//ES');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push('X-WR-CALNAME:Excelsia Operaciones');
    lines.push('X-WR-TIMEZONE:America/Santiago');
    const stamp = this.icalDateTime(new Date());
    for (const e of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@excelsia.cl`);
      lines.push(`DTSTAMP:${stamp}`);
      const allDay = !e.endDate;
      if (allDay) {
        lines.push(`DTSTART;VALUE=DATE:${this.icalDate(e.date)}`);
        const next = new Date(new Date(e.date).getTime() + 86_400_000);
        lines.push(`DTEND;VALUE=DATE:${this.icalDate(next.toISOString())}`);
      } else {
        lines.push(`DTSTART:${this.icalDateTime(new Date(e.date))}`);
        lines.push(`DTEND:${this.icalDateTime(new Date(e.endDate!))}`);
      }
      lines.push(`SUMMARY:${this.icalEscape(e.title)}`);
      const desc = this.buildIcalDescription(e);
      if (desc) lines.push(`DESCRIPTION:${this.icalEscape(desc)}`);
      lines.push(`URL:${publicBaseUrl}${e.linkPath}`);
      lines.push(`CATEGORIES:${this.icalEscape(this.typeLabel(e.type).toUpperCase())}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    /* RFC 5545 — fold lines longer than 75 octets at byte boundary. */
    const body = lines.map((l) => this.foldLine(l)).join('\r\n') + '\r\n';
    const filename = `excelsia-operaciones-${dto.startDate.slice(0, 10)}-a-${dto.endDate.slice(
      0,
      10,
    )}.ics`;
    return { filename, body };
  }

  /* ---- Source-specific fetchers ------------------------------- */

  private async fetchDocumentExpirations(
    companyId: string,
    start: Date,
    end: Date,
    dto: GetEventsDto,
  ): Promise<CalendarEvent[]> {
    const where: Prisma.DocumentRecordWhereInput = {
      companyId,
      isActive: true,
      status: 'APPROVED',
      replacedByDocumentId: null,
      expirationDate: { gte: start, lte: end },
    };
    if (dto.assetId) where.assetId = dto.assetId;
    const rows = await this.prisma.documentRecord.findMany({
      where,
      select: {
        id: true,
        expirationDate: true,
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            locationId: true,
          },
        },
        documentType: {
          select: {
            id: true,
            name: true,
            code: true,
            category: true,
            criticality: true,
            blocksOperation: true,
            color: true,
          },
        },
      },
      orderBy: { expirationDate: 'asc' },
    });
    const filtered = dto.locationId
      ? rows.filter((r) => r.asset.locationId === dto.locationId)
      : rows;
    const today = this.startOfTodayUtc();
    return filtered.map((r) => {
      const exp = r.expirationDate!;
      const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
      const severity = this.documentSeverity(r.documentType.criticality, days);
      return {
        id: `doc-${r.id}`,
        type: 'document_expiration' as const,
        title: `${r.documentType.name} — ${r.asset.code}`,
        date: exp.toISOString(),
        severity,
        metadata: {
          documentRecordId: r.id,
          assetId: r.asset.id,
          documentTypeId: r.documentType.id,
          assetCode: r.asset.code,
          assetName: r.asset.name,
          documentTypeName: r.documentType.name,
          documentCode: r.documentType.code,
          documentColor: r.documentType.color,
          isCritical: r.documentType.criticality === 'CRITICAL',
          blocksOperation: r.documentType.blocksOperation,
          daysRemaining: days,
        },
        linkPath: `/operaciones/documentos?id=${r.id}`,
      };
    });
  }

  private async fetchPermitExpirations(
    companyId: string,
    start: Date,
    end: Date,
    dto: GetEventsDto,
  ): Promise<CalendarEvent[]> {
    const where: Prisma.PermitWhereInput = {
      companyId,
      isActive: true,
      status: 'APPROVED',
      replacedByPermitId: null,
      expirationDate: { gte: start, lte: end },
    };
    if (dto.assetId) where.assetId = dto.assetId;
    if (dto.locationId) where.locationId = dto.locationId;
    const rows = await this.prisma.permit.findMany({
      where,
      select: {
        id: true,
        permitNumber: true,
        expirationDate: true,
        asset: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        permitType: {
          select: {
            id: true,
            name: true,
            code: true,
            criticality: true,
            blocksOperation: true,
            color: true,
          },
        },
      },
      orderBy: { expirationDate: 'asc' },
    });
    const today = this.startOfTodayUtc();
    return rows.map((r) => {
      const exp = r.expirationDate!;
      const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
      const severity = this.documentSeverity(r.permitType.criticality, days);
      const target = r.asset?.code ?? r.location?.code ?? 'sin objetivo';
      return {
        id: `perm-${r.id}`,
        type: 'permit_expiration' as const,
        title: `${r.permitType.name} — ${target}`,
        date: exp.toISOString(),
        severity,
        metadata: {
          permitId: r.id,
          permitNumber: r.permitNumber,
          permitTypeName: r.permitType.name,
          permitTypeCode: r.permitType.code,
          permitColor: r.permitType.color,
          asset: r.asset,
          location: r.location,
          isCritical: r.permitType.criticality === 'CRITICAL',
          blocksOperation: r.permitType.blocksOperation,
          daysRemaining: days,
        },
        linkPath: `/operaciones/permisos?id=${r.id}`,
      };
    });
  }

  private async fetchWorkPermitsScheduled(
    companyId: string,
    start: Date,
    end: Date,
    dto: GetEventsDto,
  ): Promise<CalendarEvent[]> {
    const where: Prisma.WorkPermitWhereInput = {
      companyId,
      isActive: true,
      status: { notIn: ['DRAFT', 'CANCELLED', 'EXPIRED'] },
      plannedStart: { gte: start, lte: end },
    };
    if (dto.assetId) where.assetId = dto.assetId;
    if (dto.locationId) where.locationId = dto.locationId;
    const rows = await this.prisma.workPermit.findMany({
      where,
      select: {
        id: true,
        permitNumber: true,
        title: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        actualStart: true,
        actualEnd: true,
        supervisorId: true,
        permitType: {
          select: { id: true, name: true, code: true, color: true, category: true },
        },
        asset: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: { plannedStart: 'asc' },
    });

    /* Resolve supervisor names in a single batch — surfaced in the
       event detail modal so the operator can see who's responsible
       at a glance. */
    const supervisorIds = Array.from(new Set(rows.map((r) => r.supervisorId).filter(Boolean)));
    const supervisors = supervisorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: supervisorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const supById = new Map(supervisors.map((u) => [u.id, u]));

    return rows.map((r) => {
      const supervisor = supById.get(r.supervisorId) ?? null;
      const severity: CalendarSeverity = r.status === 'IN_EXECUTION' ? 'CRITICAL' : 'WARNING';
      return {
        id: `wp-${r.id}`,
        type: 'work_permit_scheduled' as const,
        title: `${r.permitNumber} — ${r.title}`,
        date: r.plannedStart.toISOString(),
        endDate: r.plannedEnd.toISOString(),
        severity,
        metadata: {
          permitId: r.id,
          permitNumber: r.permitNumber,
          status: r.status,
          permitTypeName: r.permitType.name,
          permitTypeCode: r.permitType.code,
          permitColor: r.permitType.color,
          plannedStart: r.plannedStart,
          plannedEnd: r.plannedEnd,
          actualStart: r.actualStart,
          actualEnd: r.actualEnd,
          asset: r.asset,
          location: r.location,
          supervisor: supervisor
            ? {
                id: supervisor.id,
                name: `${supervisor.firstName} ${supervisor.lastName}`.trim() || supervisor.email,
                email: supervisor.email,
              }
            : null,
        },
        linkPath: `/operaciones/permisos/trabajo/${r.id}`,
      };
    });
  }

  private async fetchAcknowledgmentDeadlines(
    companyId: string,
    userId: string,
    isAdminOrManager: boolean,
    start: Date,
    end: Date,
  ): Promise<CalendarEvent[]> {
    const where: Prisma.ProcedureAcknowledgmentWhereInput = {
      companyId,
      status: { in: ['PENDING', 'READ'] },
      dueDate: { gte: start, lte: end },
    };
    /* Non-admins only see their own acknowledgments — privacy guard
       beyond CASL; the dashboard "my pending" already filters by
       userId so this matches the same contract. */
    if (!isAdminOrManager) where.userId = userId;
    const rows = await this.prisma.procedureAcknowledgment.findMany({
      where,
      select: {
        id: true,
        userId: true,
        dueDate: true,
        status: true,
        procedure: {
          select: { id: true, code: true, title: true, version: true, category: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    const today = this.startOfTodayUtc();
    return rows
      .filter((r) => r.procedure !== null)
      .map((r) => {
        const due = r.dueDate!;
        const days = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
        const severity: CalendarSeverity =
          days < 0 ? 'CRITICAL' : days <= 3 ? 'CRITICAL' : days <= 7 ? 'WARNING' : 'INFO';
        return {
          id: `ack-${r.id}`,
          type: 'acknowledgment_deadline' as const,
          title: `Acuse: ${r.procedure!.title}`,
          date: due.toISOString(),
          severity,
          metadata: {
            acknowledgmentId: r.id,
            procedureId: r.procedure!.id,
            code: r.procedure!.code,
            title: r.procedure!.title,
            version: r.procedure!.version,
            category: r.procedure!.category,
            currentStatus: r.status,
            forUserId: r.userId,
            isMine: r.userId === userId,
            daysRemaining: days,
          },
          linkPath: `/operaciones/procedimientos/${r.procedure!.id}`,
        };
      });
  }

  private async fetchExceptionExpirations(
    companyId: string,
    start: Date,
    end: Date,
    dto: GetEventsDto,
  ): Promise<CalendarEvent[]> {
    const where: Prisma.AssetExceptionWhereInput = {
      companyId,
      status: 'APPROVED',
      validUntil: { gte: start, lte: end },
    };
    if (dto.assetId) where.assetId = dto.assetId;
    const rows = await this.prisma.assetException.findMany({
      where,
      select: {
        id: true,
        validFrom: true,
        validUntil: true,
        approvedReason: true,
        asset: { select: { id: true, code: true, name: true, locationId: true } },
      },
      orderBy: { validUntil: 'asc' },
    });
    const filtered = dto.locationId
      ? rows.filter((r) => r.asset.locationId === dto.locationId)
      : rows;
    return filtered.map((r) => {
      const exp = r.validUntil!;
      return {
        id: `exc-${r.id}`,
        type: 'exception_expiration' as const,
        title: `Excepción — ${r.asset.code}`,
        date: exp.toISOString(),
        severity: 'WARNING' as const,
        metadata: {
          exceptionId: r.id,
          assetId: r.asset.id,
          assetCode: r.asset.code,
          assetName: r.asset.name,
          validFrom: r.validFrom,
          validUntil: r.validUntil,
          approvedReason: r.approvedReason,
        },
        linkPath: `/operaciones/excepciones?id=${r.id}`,
      };
    });
  }

  private async fetchProceduresPublished(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<CalendarEvent[]> {
    const rows = await this.prisma.procedure.findMany({
      where: {
        companyId,
        status: 'PUBLISHED',
        publishedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        code: true,
        title: true,
        version: true,
        category: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'asc' },
    });
    return rows
      .filter((r) => r.publishedAt !== null)
      .map((r) => ({
        id: `proc-${r.id}`,
        type: 'procedure_published' as const,
        title: `${r.title} — v${r.version}`,
        date: r.publishedAt!.toISOString(),
        severity: 'INFO' as const,
        metadata: {
          procedureId: r.id,
          code: r.code,
          title: r.title,
          version: r.version,
          category: r.category,
        },
        linkPath: `/operaciones/procedimientos/${r.id}`,
      }));
  }

  /* ---- Helpers ------------------------------------------------ */

  private parseRange(startStr: string, endStr: string) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Fechas inválidas.');
    }
    if (start > end) {
      throw new BadRequestException('startDate debe ser anterior a endDate.');
    }
    /* Cap the window at 18 months so a runaway query doesn't fan
       out into pages and pages of events. The frontend only ever
       requests at most 1 month at a time. */
    const eighteenMonthsMs = 18 * 31 * 86_400_000;
    if (end.getTime() - start.getTime() > eighteenMonthsMs) {
      throw new BadRequestException('El rango no puede exceder 18 meses.');
    }
    return { start, end };
  }

  private parseDate(s: string) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Fecha inválida.');
    }
    return d;
  }

  private resolveTypes(input?: CalendarEventType[]): CalendarEventType[] {
    if (!input || input.length === 0) return ALL_TYPES;
    /* Defensive — drop unknown entries the client may have sent. */
    const filtered = input.filter((t) => ALL_TYPES.includes(t));
    return filtered.length === 0 ? ALL_TYPES : filtered;
  }

  private async isAdminOrManager(companyId: string, userId: string): Promise<boolean> {
    const m = await this.prisma.membership.findFirst({
      where: { companyId, userId, isActive: true },
      select: { role: true },
    });
    if (!m) return false;
    return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(m.role);
  }

  private startOfTodayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private documentSeverity(
    criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    daysRemaining: number,
  ): CalendarSeverity {
    if (criticality === 'CRITICAL') {
      if (daysRemaining < 0) return 'BLOCKING';
      if (daysRemaining <= 7) return 'CRITICAL';
      return 'WARNING';
    }
    if (criticality === 'HIGH') {
      if (daysRemaining < 0) return 'CRITICAL';
      if (daysRemaining <= 7) return 'WARNING';
      return 'INFO';
    }
    if (daysRemaining < 0) return 'WARNING';
    return 'INFO';
  }

  private buildSummary(events: CalendarEvent[]) {
    const byType: Record<CalendarEventType, number> = {
      document_expiration: 0,
      permit_expiration: 0,
      work_permit_scheduled: 0,
      acknowledgment_deadline: 0,
      exception_expiration: 0,
      procedure_published: 0,
    };
    const bySeverity: Record<Lowercase<CalendarSeverity>, number> = {
      info: 0,
      warning: 0,
      critical: 0,
      blocking: 0,
    };
    const byMonth: Record<string, number> = {};
    for (const e of events) {
      byType[e.type]++;
      bySeverity[e.severity.toLowerCase() as Lowercase<CalendarSeverity>]++;
      const monthKey = e.date.slice(0, 7);
      byMonth[monthKey] = (byMonth[monthKey] ?? 0) + 1;
    }
    return {
      total: events.length,
      byType,
      bySeverity,
      byMonth,
    };
  }

  private typeLabel(type: CalendarEventType): string {
    switch (type) {
      case 'document_expiration':
        return 'Documento';
      case 'permit_expiration':
        return 'Permiso externo';
      case 'work_permit_scheduled':
        return 'Permiso de trabajo';
      case 'acknowledgment_deadline':
        return 'Acuse';
      case 'exception_expiration':
        return 'Excepción';
      case 'procedure_published':
        return 'Procedimiento';
    }
  }

  /* ---- iCal helpers ------------------------------------------ */

  private icalDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}${this.pad2(d.getUTCMonth() + 1)}${this.pad2(d.getUTCDate())}`;
  }

  private icalDateTime(d: Date): string {
    return `${d.getUTCFullYear()}${this.pad2(d.getUTCMonth() + 1)}${this.pad2(
      d.getUTCDate(),
    )}T${this.pad2(d.getUTCHours())}${this.pad2(d.getUTCMinutes())}${this.pad2(
      d.getUTCSeconds(),
    )}Z`;
  }

  private pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  /* RFC 5545 §3.3.11 — backslash, comma, semicolon, newline must
     be escaped inside SUMMARY/DESCRIPTION values. */
  private icalEscape(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  /* RFC 5545 §3.1 — fold lines longer than 75 octets. We fold at 73
     so the leading single space (which is the continuation marker)
     plus the next character stay under the limit. */
  private foldLine(line: string): string {
    if (line.length <= 75) return line;
    const out: string[] = [];
    let i = 0;
    out.push(line.slice(i, i + 73));
    i += 73;
    while (i < line.length) {
      out.push(' ' + line.slice(i, i + 72));
      i += 72;
    }
    return out.join('\r\n');
  }

  private buildIcalDescription(e: CalendarEvent): string {
    const parts: string[] = [];
    parts.push(`Tipo: ${this.typeLabel(e.type)}`);
    parts.push(`Severidad: ${e.severity}`);
    const meta = e.metadata as Record<string, unknown>;
    if (typeof meta.daysRemaining === 'number') {
      const d = meta.daysRemaining;
      parts.push(d >= 0 ? `Días restantes: ${d}` : `Vencido hace ${Math.abs(d)} días`);
    }
    if (typeof meta.assetCode === 'string' && typeof meta.assetName === 'string') {
      parts.push(`Activo: ${meta.assetCode} — ${meta.assetName}`);
    }
    if (typeof meta.permitNumber === 'string') {
      parts.push(`Permiso: ${meta.permitNumber}`);
    }
    return parts.join('\n');
  }
}
