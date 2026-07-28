import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HsecTrainingType, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { RrhhEmployeeReadService } from '../../rrhh/employee-read/employee-read.service';
import { AddAttendeeDto } from './dto/add-attendee.dto';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';

const DOCUMENTS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
/* The house size cap, mirrored from employee-documents (employee-documents.service.ts:21 —
   FILE_MAX_BYTES = 10 MB) and the same mime allowlist family. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
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

/* HSEC-006 — Trainings (capacitaciones/charlas/inducciones).
 *
 * A training EVENT: fecha + tema + relator + asistentes + the single optional signed-planilla
 * scan (coexistence doctrine, PART1 decision 9 — see the schema comment). Free edit + delete
 * always (decision 6); DELETE cascades attendees (the audit trigger keeps everything).
 *
 * ATTENDEE GATE (no subject of their own): the founder-signed matrix has exactly FIVE
 * subjects; changing a training's composition IS updating the training, so the attendee
 * endpoints gate on `update HsecTraining` — HsecTrainingAttendee never becomes a CASL
 * subject. employeeId is a BARE uuid resolved via the RrhhEmployeeRead leaf (two-key signed
 * contract): membership 400 on write, DESVINCULADO addable (historical registration, the
 * HSEC-003 rationale), duplicate pair → DB unique backstop → P2002 → 409 verbatim.
 *
 * DATES: date is @db.Date anchored to UTC midnight (HR-004b); time is a wall-clock "HH:mm"
 * STRING — never passed to a Date constructor anywhere in this service. */
@Injectable()
export class TrainingsService {
  private readonly logger = new Logger(TrainingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly employeeRead: RrhhEmployeeReadService,
  ) {}

  /** Anchor a YYYY-MM-DD string to UTC midnight (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async getTrainingOrThrow(id: string, companyId: string) {
    const training = await this.prisma.hsecTraining.findFirst({ where: { id, companyId } });
    if (!training) throw new NotFoundException('Capacitación no encontrada');
    return training;
  }

  /** List, date desc. Server-side filters: ?type and ?employeeId (attendee-based). The
   *  heavy fileData column is NEVER selected on list. */
  async findAll(companyId: string, type?: string, employeeId?: string) {
    const where: Prisma.HsecTrainingWhereInput = { companyId };
    if (type !== undefined && type !== '') {
      if (!(Object.values(HsecTrainingType) as string[]).includes(type)) {
        throw new BadRequestException('El tipo debe ser CHARLA, INDUCCION o CAPACITACION.');
      }
      where.type = type as HsecTrainingType;
    }
    if (employeeId) {
      /* HSEC-006 correction — guard the raw query param: a malformed value would otherwise
         reach Prisma's @db.Uuid validation and 500. Same in-service idiom as the ?status
         guard above; isUUID is the class-validator functional twin of the DTO decorator. */
      if (!isUUID(employeeId)) {
        throw new BadRequestException('El empleado indicado no es válido.');
      }
      where.attendees = { some: { employeeId } };
    }
    const rows = await this.prisma.hsecTraining.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        topic: true,
        date: true,
        time: true,
        durationMinutes: true,
        instructorName: true,
        notes: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        _count: { select: { attendees: true } },
      },
    });
    return rows.map(({ _count, ...r }) => ({ ...r, attendeesCount: _count.attendees }));
  }

  /** Detail embeds attendees[] with fullName via ONE resolveNamesByIds batch (no N+1). */
  async findOne(id: string, companyId: string) {
    const training = await this.getTrainingOrThrow(id, companyId);
    const rows = await this.prisma.hsecTrainingAttendee.findMany({
      where: { companyId, trainingId: id },
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.employeeRead.resolveNamesByIds(
      companyId,
      rows.map((r) => r.employeeId),
    );
    const attendees = rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      fullName: names[r.employeeId] ?? null,
    }));
    // fileData is heavy and only needed on download — strip it from the detail payload.
    const { fileData, ...rest } = training;
    return {
      ...rest,
      hasFile: !!(training.fileName && (training.filePath || fileData)),
      attendees,
    };
  }

  async create(companyId: string, userId: string, dto: CreateTrainingDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecTraining.create({
        data: {
          companyId,
          type: dto.type,
          topic: dto.topic.trim(),
          date: this.toDateOnly(dto.date),
          time: dto.time ?? null,
          durationMinutes: dto.durationMinutes ?? null,
          instructorName: dto.instructorName.trim(),
          notes: dto.notes ?? null,
          // createdBy is ALWAYS the JWT actor — dto.createdBy is a decoy and is NEVER read.
          createdBy: userId,
        },
      });
    });
  }

  /** Free general-field edit (decision 6). */
  async update(id: string, companyId: string, userId: string, dto: UpdateTrainingDto) {
    await this.getTrainingOrThrow(id, companyId);
    const data: Prisma.HsecTrainingUncheckedUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.topic !== undefined) data.topic = dto.topic.trim();
    if (dto.date !== undefined) data.date = this.toDateOnly(dto.date);
    if (dto.time !== undefined) data.time = dto.time ?? null;
    if (dto.durationMinutes !== undefined) data.durationMinutes = dto.durationMinutes ?? null;
    if (dto.instructorName !== undefined) data.instructorName = dto.instructorName.trim();
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecTraining.update({ where: { id }, data });
    });
  }

  /** DELETE always (decision 6) — cascades attendees; the audit trigger keeps every row. */
  async remove(id: string, companyId: string, userId: string) {
    await this.getTrainingOrThrow(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecTraining.delete({ where: { id } });
    });
  }

  /* ---- Attendees (gate: update HsecTraining — see the class comment) ---- */

  async addAttendee(id: string, companyId: string, userId: string, dto: AddAttendeeDto) {
    await this.getTrainingOrThrow(id, companyId);
    // Membership gate via the leaf: company-scoped, ANY status (DESVINCULADO addable).
    const names = await this.employeeRead.resolveNamesByIds(companyId, [dto.employeeId]);
    const fullName = names[dto.employeeId];
    if (fullName === undefined) {
      throw new BadRequestException('El empleado no pertenece a la empresa.');
    }
    try {
      const row = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.hsecTrainingAttendee.create({
          data: { companyId, trainingId: id, employeeId: dto.employeeId },
        });
      });
      return { ...row, fullName };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'El empleado ya está registrado como asistente en esta capacitación.',
        );
      }
      throw e;
    }
  }

  async removeAttendee(id: string, attendeeId: string, companyId: string, userId: string) {
    await this.getTrainingOrThrow(id, companyId);
    const attendee = await this.prisma.hsecTrainingAttendee.findFirst({
      where: { id: attendeeId, trainingId: id, companyId },
    });
    if (!attendee) throw new NotFoundException('Asistente no encontrado');
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecTrainingAttendee.delete({ where: { id: attendeeId } });
    });
  }

  /* ---- The planilla file (single slot; upload REPLACES) --------------------------------
     storeFile is cloned from EmployeeDocumentsService.storeFile
     (rrhh/employee-documents/employee-documents.service.ts:156-175 — the { storageKey,
     blobFallback } per-column variant; here the columns are Procedure-shaped, so the pair
     maps to { filePath, fileData }). Reads prefer the DB blob when present (the house
     read-path idiom, employee-documents.service.ts:405-430). */

  /** MinIO-first with DB-blob fallback (including on upload failure). */
  private async storeFile(
    companyId: string,
    trainingId: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string | null; fileData: Uint8Array<ArrayBuffer> | null }> {
    const safeFileName = file.originalname.replace(/[^\w.-]+/g, '_');
    const storageKey = `hsec/trainings/${companyId}/${trainingId}/${safeFileName}`;
    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(DOCUMENTS_BUCKET, storageKey, file.buffer, file.mimetype);
        return { filePath: storageKey, fileData: null };
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB blob.`,
        );
        return { filePath: null, fileData: Uint8Array.from(file.buffer) };
      }
    }
    this.logger.warn('MinIO not available, storing planilla in DB blob');
    return { filePath: null, fileData: Uint8Array.from(file.buffer) };
  }

  /** SINGLE SLOT — uploading again REPLACES the previous planilla (recorded decision: the
   *  scan of the signed sheet has one current truth; the audit trigger preserves the prior
   *  column values; a superseded storage object is not garbage-collected — the house
   *  supersession behavior). */
  async uploadFile(id: string, companyId: string, userId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException('Formato no permitido para la planilla.');
    }
    await this.getTrainingOrThrow(id, companyId);
    const { filePath, fileData } = await this.storeFile(companyId, id, file);
    const row = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecTraining.update({
        where: { id },
        data: {
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath,
          fileData,
        },
      });
    });
    const { fileData: _stripped, ...rest } = row;
    return { ...rest, hasFile: true };
  }

  /** DB blob wins when present (already in memory); otherwise pull from MinIO. */
  async downloadFile(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.hsecTraining.findFirst({
      where: { id, companyId },
      select: { fileName: true, mimeType: true, filePath: true, fileData: true },
    });
    if (!row) throw new NotFoundException('Capacitación no encontrada');
    if (!row.fileName || !row.mimeType) throw new NotFoundException('Planilla no disponible.');
    if (row.fileData) {
      return { buffer: Buffer.from(row.fileData), mimeType: row.mimeType, fileName: row.fileName };
    }
    if (row.filePath) {
      const buffer = await this.storage.downloadFile(DOCUMENTS_BUCKET, row.filePath);
      return { buffer, mimeType: row.mimeType, fileName: row.fileName };
    }
    throw new NotFoundException('Planilla no disponible.');
  }

  async deleteFile(id: string, companyId: string, userId: string) {
    const training = await this.getTrainingOrThrow(id, companyId);
    if (!training.fileName) throw new NotFoundException('Planilla no disponible.');
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecTraining.update({
        where: { id },
        data: { fileName: null, mimeType: null, fileSize: null, filePath: null, fileData: null },
      });
    });
    return { removed: true };
  }
}
