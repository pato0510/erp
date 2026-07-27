import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HsecIncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';

/* HSEC-002 — the incident status machine, as directed adjacency (current → allowed targets).
   No self-loops, so same-status moves are rejected (the COM-005 convention). PART1 §3 edges:
   REPORTADO ↔ EN_INVESTIGACION · REPORTADO → CERRADO (shortcut) · EN_INVESTIGACION → CERRADO ·
   CERRADO → EN_INVESTIGACION (explicit reopen). REJECTED (never listed): CERRADO → REPORTADO,
   same-status. */
const STATUS_TRANSITIONS: Record<HsecIncidentStatus, HsecIncidentStatus[]> = {
  [HsecIncidentStatus.REPORTADO]: [HsecIncidentStatus.EN_INVESTIGACION, HsecIncidentStatus.CERRADO],
  [HsecIncidentStatus.EN_INVESTIGACION]: [HsecIncidentStatus.REPORTADO, HsecIncidentStatus.CERRADO],
  [HsecIncidentStatus.CERRADO]: [HsecIncidentStatus.EN_INVESTIGACION],
};

/* CAL-008b doctrine (copy-adapted from actividades/activities.service.ts — module boundaries
   forbid importing a neighbor's internals): the incident number's {YYYY} is the CHILEAN
   calendar year at creation time, never the UTC one, which rolls over early in the Chilean
   evening every Dec 31. Chilean-platform constant (the CHILE_IVA_RATE precedent); per-company
   timezone is a recorded V2 seed. */
function santiagoDateOf(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
function todayInSantiago(): string {
  return santiagoDateOf(new Date());
}

/* HSEC-002 — Incidents.
 *
 * EDIT-IN-ANY-STATUS + DELETE-IN-ANY-STATUS (PART1 decision 6, the CAL-012 bitácora doctrine):
 * a CERRADO incident stays editable and deletable by writers; the platform audit trigger is
 * the forensic layer (every UPDATE/DELETE preserves the prior content in audit_logs). The only
 * gated mutation is the status move (PATCH /:id/status — the machine above).
 *
 * NUMBERING (PART1 decision 6): incidentNumber "INC-{YYYY}-{0000}", per-company AND per-year;
 * next = max existing suffix for the year prefix + 1, computed INSIDE the same executeWithRls
 * transaction as the create (the ServiceOrder orderNumber precedent). The accepted V1 caveat —
 * deleting the year's latest incident lets its number be reused — is recorded; no counter
 * table is built. The @@unique([companyId, incidentNumber]) is the hard backstop.
 *
 * DATES: occurredDate is @db.Date anchored to UTC midnight (HR-004b); occurredTime is a
 * wall-clock "HH:mm" STRING — validated by regex in the DTO, stored and returned AS A STRING;
 * it is NEVER passed to a Date constructor anywhere in this service. */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Anchor a YYYY-MM-DD string to UTC midnight (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async getIncidentOrThrow(id: string, companyId: string) {
    const incident = await this.prisma.hsecIncident.findFirst({ where: { id, companyId } });
    if (!incident) throw new NotFoundException('Incidente no encontrado');
    return incident;
  }

  /** List, newest occurredDate first. Server-side filter: ?status ONLY (the rest is
   *  client-side over the fetched set — the Gestión precedent, PART2/HSEC-005). */
  async findAll(companyId: string, status?: string) {
    const where: Prisma.HsecIncidentWhereInput = { companyId };
    if (status !== undefined && status !== '') {
      if (!(Object.values(HsecIncidentStatus) as string[]).includes(status)) {
        throw new BadRequestException('El estado debe ser REPORTADO, EN_INVESTIGACION o CERRADO.');
      }
      where.status = status as HsecIncidentStatus;
    }
    return this.prisma.hsecIncident.findMany({
      where,
      orderBy: [{ occurredDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    return this.getIncidentOrThrow(id, companyId);
  }

  /** "INC-{YYYY}-{0000}" — YYYY is the CHILEAN calendar year NOW (creation time, not the
   *  occurrence date); the suffix scan is prefix-scoped so the sequence restarts each year.
   *  Zero-padded to 4 → lexicographic desc within one prefix IS numeric desc. */
  private async nextIncidentNumber(tx: Prisma.TransactionClient, companyId: string) {
    const year = todayInSantiago().slice(0, 4);
    const prefix = `INC-${year}-`;
    const last = await tx.hsecIncident.findFirst({
      where: { companyId, incidentNumber: { startsWith: prefix } },
      orderBy: { incidentNumber: 'desc' },
      select: { incidentNumber: true },
    });
    const n = last ? (parseInt(last.incidentNumber.slice(prefix.length), 10) || 0) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  async create(companyId: string, userId: string, dto: CreateIncidentDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const incidentNumber = await this.nextIncidentNumber(tx, companyId);
      return tx.hsecIncident.create({
        data: {
          companyId,
          incidentNumber,
          type: dto.type,
          severity: dto.severity,
          // status is NEVER taken from the DTO — a fresh incident is always REPORTADO.
          status: HsecIncidentStatus.REPORTADO,
          occurredDate: this.toDateOnly(dto.occurredDate),
          occurredTime: dto.occurredTime ?? null,
          location: dto.location.trim(),
          description: dto.description.trim(),
          immediateCause: dto.immediateCause ?? null,
          correctiveActions: dto.correctiveActions ?? null,
          sourceWorkPermitId: dto.sourceWorkPermitId ?? null,
          // createdBy is ALWAYS the JWT actor — dto.createdBy is a decoy and is NEVER read.
          createdBy: userId,
        },
      });
    });
  }

  /** Free general-field edit, ANY status (decision 6). `status` here is rejected verbatim —
   *  the machine endpoint is the only path. */
  async update(id: string, companyId: string, userId: string, dto: UpdateIncidentDto) {
    await this.getIncidentOrThrow(id, companyId);
    if (dto.status !== undefined) {
      throw new BadRequestException(
        'Los cambios de estado se realizan vía PATCH /:id/status, no en la edición general.',
      );
    }
    const data: Prisma.HsecIncidentUncheckedUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.occurredDate !== undefined) data.occurredDate = this.toDateOnly(dto.occurredDate);
    if (dto.occurredTime !== undefined) data.occurredTime = dto.occurredTime ?? null;
    if (dto.location !== undefined) data.location = dto.location.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.immediateCause !== undefined) data.immediateCause = dto.immediateCause ?? null;
    if (dto.correctiveActions !== undefined) data.correctiveActions = dto.correctiveActions ?? null;
    if (dto.sourceWorkPermitId !== undefined)
      data.sourceWorkPermitId = dto.sourceWorkPermitId ?? null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecIncident.update({ where: { id }, data });
    });
  }

  /** THE canonical status machine (PART1 §3). */
  async changeStatus(id: string, companyId: string, userId: string, target: HsecIncidentStatus) {
    const incident = await this.getIncidentOrThrow(id, companyId);
    const allowed = STATUS_TRANSITIONS[incident.status];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${incident.status} → ${target}.`,
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecIncident.update({ where: { id }, data: { status: target } });
    });
  }

  /** DELETE for writers, ANY status (decision 6). The audit trigger preserves the row. */
  async remove(id: string, companyId: string, userId: string) {
    await this.getIncidentOrThrow(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecIncident.delete({ where: { id } });
    });
  }
}
