import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HsecIncident, HsecIncidentSeverity, HsecIncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { NotificationService } from '../../operations/notifications/notification.service';
import { RrhhEmployeeReadService } from '../../rrhh/employee-read/employee-read.service';
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

/* HSEC-004 — attachments, MIRRORING THE WORKPERMIT CONVENTION exactly
   (operations/permits/work-permits/work-permits.service.ts:31-58 — same bucket resolution,
   same 10 MB cap, same MAX 5, same mime allowlist, same AttachmentRecord entry shape inside
   the Json column, base64 blob fallback included). */
const ATTACHMENTS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

const ALLOWED_MIMETYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

interface AttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  filePath?: string | null;
  /* Base64-encoded buffer when MinIO is unavailable. Tripled size vs
     raw bytes — acceptable for a 10 MB cap × 5 files per incident. */
  fileData?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

/* HSEC-004 — the GRAVE|FATAL notification class (PART1 decision 7). */
const SEVERE_CLASS: HsecIncidentSeverity[] = [
  HsecIncidentSeverity.GRAVE,
  HsecIncidentSeverity.FATAL,
];

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
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly employeeRead: RrhhEmployeeReadService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
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

  /** HSEC-003 — detail embeds persons[] with fullName resolved via ONE resolveNamesByIds
   *  batch (no N+1; the leaf's two-key signed contract). A name that no longer resolves
   *  (employee hard-deleted from RRHH) degrades to null — the afectado row itself stays. */
  async findOne(id: string, companyId: string) {
    const incident = await this.getIncidentOrThrow(id, companyId);
    const rows = await this.prisma.hsecIncidentPerson.findMany({
      where: { companyId, incidentId: id },
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.employeeRead.resolveNamesByIds(
      companyId,
      rows.map((r) => r.employeeId),
    );
    const persons = rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      fullName: names[r.employeeId] ?? null,
      injuryType: r.injuryType,
      bodyPart: r.bodyPart,
      medicalAttention: r.medicalAttention,
      lostDays: r.lostDays,
      detail: r.detail,
    }));
    return { ...incident, persons };
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
    const row = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
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
    // HSEC-004 — created directly INSIDE the {GRAVE, FATAL} class → notify (decision 7).
    if (SEVERE_CLASS.includes(row.severity)) {
      await this.notifyAdminsSevere(companyId, row);
    }
    return row;
  }

  /** Free general-field edit, ANY status (decision 6). `status` here is rejected verbatim —
   *  the machine endpoint is the only path. */
  async update(id: string, companyId: string, userId: string, dto: UpdateIncidentDto) {
    const existing = await this.getIncidentOrThrow(id, companyId);
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

    const row = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecIncident.update({ where: { id }, data });
    });
    /* HSEC-004 — CLASS semantics (decision 7): notify only when the edit takes the incident
       INTO the {GRAVE, FATAL} class from OUTSIDE it (LEVE→GRAVE, LEVE→FATAL). Movement
       WITHIN the class never re-notifies — GRAVE→GRAVE edits and the GRAVE→FATAL escalation
       are already inside (the admins were already pinged once for this incident). */
    if (!SEVERE_CLASS.includes(existing.severity) && SEVERE_CLASS.includes(row.severity)) {
      await this.notifyAdminsSevere(companyId, row);
    }
    return row;
  }

  /** HSEC-004 — the thin notification path (PART1 decision 7): a DIRECT
   *  NotificationService.createGeneric call (the RRHH precedent —
   *  rrhh/employee-documents/document-reminders.service.ts:124 — NO cron, NO ops alert
   *  engine, no rules). Recipients: every ACTIVE ADMIN-role membership of the company
   *  (decision 7 names ADMIN; SUPER_ADMIN platform operators are not the safety audience).
   *  Best-effort: a notification failure never rolls back or fails the incident write. */
  private async notifyAdminsSevere(
    companyId: string,
    incident: Pick<HsecIncident, 'id' | 'incidentNumber' | 'severity'>,
  ) {
    try {
      const memberships = await this.prisma.membership.findMany({
        where: { companyId, isActive: true, role: 'ADMIN' },
        select: { userId: true },
      });
      const userIds = Array.from(new Set(memberships.map((m) => m.userId)));
      if (userIds.length === 0) return;
      await this.notifications.createGeneric(companyId, {
        userIds,
        sourceType: 'GENERAL',
        title: `Incidente ${incident.severity} — ${incident.incidentNumber}`,
        message: `Se registró el incidente ${incident.incidentNumber} con severidad ${incident.severity}. Requiere revisión inmediata.`,
        severity: 'CRITICAL',
        linkPath: '/hsec/incidentes',
        icon: 'Siren',
      });
    } catch (err) {
      this.logger.warn(
        `Severe-incident notification skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
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

  /* ---- HSEC-004: Attachments — the WorkPermit convention, mirrored ------------------------
     Upload/entry/download logic mirrors work-permits.service.ts:665-763 (addAttachment /
     getAttachment / deleteAttachment); the storage-vs-blob branch is the copy-adapted
     `storeFile` below (cloned from document-records.service.ts:558-581, the Operations
     original of the twice-established pair — adapted to return a base64 string because this
     blob lives INSIDE the Json entry, not in its own column, and extended with the
     WorkPermit's failed-upload fallback). Addressing is by entry id (`attachmentId`), not by
     array index. */

  /** Copy-adapt of DocumentRecordsService.storeFile (document-records.service.ts:558-581):
   *  object storage first when configured, DB blob (here: base64 inside the Json entry)
   *  otherwise — INCLUDING on upload failure (the WorkPermit branch). */
  private async storeFile(
    incidentId: string,
    attachmentId: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string | null; fileData: string | null }> {
    if (this.storage.isConfigured()) {
      const safeName = file.originalname.replace(/[^\w.-]+/g, '_');
      const key = `hsec/incidents/${incidentId}/${attachmentId}-${safeName}`;
      try {
        await this.storage.uploadFile(ATTACHMENTS_BUCKET, key, file.buffer, file.mimetype);
        return { filePath: key, fileData: null };
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to base64 blob.`,
        );
        return { filePath: null, fileData: file.buffer.toString('base64') };
      }
    }
    this.logger.warn('MinIO not available, storing attachment in DB blob');
    return { filePath: null, fileData: file.buffer.toString('base64') };
  }

  async addAttachment(
    id: string,
    companyId: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException('Formato no permitido para adjuntos.');
    }

    const incident = await this.getIncidentOrThrow(id, companyId);
    const attachments = (incident.attachments ?? []) as unknown as AttachmentRecord[];
    if (attachments.length >= MAX_ATTACHMENTS) {
      throw new BadRequestException('Máximo 5 archivos adjuntos por incidente.');
    }

    const attachmentId = randomUUID();
    const { filePath, fileData } = await this.storeFile(id, attachmentId, file);
    const record: AttachmentRecord = {
      id: attachmentId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath,
      fileData,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    };
    const next = [...attachments, record];
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.hsecIncident.update({
        where: { id },
        data: { attachments: next as unknown as Prisma.InputJsonValue },
      }),
    );
    /* fileData is heavy and only needed on download; strip before
       returning so the client doesn't pay the round-trip cost. */
    return { ...record, fileData: undefined };
  }

  async getAttachment(id: string, companyId: string, attachmentId: string) {
    const incident = await this.getIncidentOrThrow(id, companyId);
    const list = (incident.attachments ?? []) as unknown as AttachmentRecord[];
    const att = list.find((a) => a.id === attachmentId);
    if (!att) throw new NotFoundException('Adjunto no encontrado.');
    let buffer: Buffer;
    if (att.filePath) {
      buffer = await this.storage.downloadFile(ATTACHMENTS_BUCKET, att.filePath);
    } else if (att.fileData) {
      buffer = Buffer.from(att.fileData, 'base64');
    } else {
      throw new NotFoundException('El archivo no está disponible.');
    }
    return { fileName: att.fileName, mimeType: att.mimeType, buffer };
  }

  async deleteAttachment(id: string, companyId: string, userId: string, attachmentId: string) {
    const incident = await this.getIncidentOrThrow(id, companyId);
    const list = [...((incident.attachments ?? []) as unknown as AttachmentRecord[])];
    const index = list.findIndex((a) => a.id === attachmentId);
    if (index < 0) throw new NotFoundException('Adjunto no encontrado.');
    list.splice(index, 1);
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.hsecIncident.update({
        where: { id },
        data: { attachments: list as unknown as Prisma.InputJsonValue },
      }),
    );
    return { removed: attachmentId };
  }
}
