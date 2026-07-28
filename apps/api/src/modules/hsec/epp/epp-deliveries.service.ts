import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { RrhhEmployeeReadService } from '../../rrhh/employee-read/employee-read.service';
import { CreateEppDeliveryDto, CreateEppDeliveryLineDto } from './dto/create-epp-delivery.dto';
import { UpdateEppDeliveryDto } from './dto/update-epp-delivery.dto';

const DOCUMENTS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
/* The house size cap (employee-documents.service.ts:21) + the same mime allowlist family. */
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

/* HSEC-008 — EPP deliveries (entregas): header (worker + date + acuse) + lines (item ×
 * cantidad × talla). employeeId is a BARE uuid resolved via the RrhhEmployeeRead leaf and
 * IMMUTABLE after create (pair-identity ruling — wrong person = delete + recreate). Lines on
 * PATCH are REPLACE-SET (delete + recreate in ONE transaction; the audit trigger keeps the
 * old lines). NEW deliveries only accept ACTIVE items; historical ones keep inactive items
 * via the DB Restrict. Free edit/delete (decision 6); DELETE cascades lines. */
@Injectable()
export class EppDeliveriesService {
  private readonly logger = new Logger(EppDeliveriesService.name);

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

  private async getDeliveryOrThrow(id: string, companyId: string) {
    const delivery = await this.prisma.hsecEppDelivery.findFirst({ where: { id, companyId } });
    if (!delivery) throw new NotFoundException('Entrega no encontrada');
    return delivery;
  }

  /** Line rules with VERBATIM Spanish 400s (service-thrown — the platform filter only
   *  surfaces string messages): at least one line; positive integer quantities; every item
   *  exists in the company AND is active (NEW/replacement sets never accept inactive items). */
  private async assertLinesUsable(companyId: string, lines: CreateEppDeliveryLineDto[]) {
    if (lines.length === 0) {
      throw new BadRequestException('La entrega debe incluir al menos un elemento.');
    }
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1) {
        throw new BadRequestException('La cantidad debe ser un número entero positivo.');
      }
    }
    const ids = Array.from(new Set(lines.map((l) => l.eppItemId)));
    const items = await this.prisma.hsecEppItem.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, active: true },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const id of ids) {
      const item = byId.get(id);
      if (!item) throw new BadRequestException('El elemento indicado no existe.');
      if (!item.active) throw new BadRequestException('El elemento está inactivo.');
    }
  }

  /** List, date desc. Server ?employeeId with the UUID guard (the HSEC-006 correction is the
   *  house standard now); date range stays client-side. Names via ONE leaf batch; the heavy
   *  fileData column is NEVER selected on list. */
  async findAll(companyId: string, employeeId?: string) {
    const where: Prisma.HsecEppDeliveryWhereInput = { companyId };
    if (employeeId) {
      if (!isUUID(employeeId)) {
        throw new BadRequestException('El empleado indicado no es válido.');
      }
      where.employeeId = employeeId;
    }
    const rows = await this.prisma.hsecEppDelivery.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        employeeId: true,
        date: true,
        notes: true,
        fileName: true,
        fileSize: true,
        createdAt: true,
        _count: { select: { lines: true } },
      },
    });
    const names = await this.employeeRead.resolveNamesByIds(
      companyId,
      rows.map((r) => r.employeeId),
    );
    return rows.map(({ _count, ...r }) => ({
      ...r,
      fullName: names[r.employeeId] ?? null,
      linesCount: _count.lines,
    }));
  }

  /** Detail embeds the worker's fullName (leaf) + lines[] with the item name. */
  async findOne(id: string, companyId: string) {
    const delivery = await this.getDeliveryOrThrow(id, companyId);
    const [names, lines] = await Promise.all([
      this.employeeRead.resolveNamesByIds(companyId, [delivery.employeeId]),
      this.prisma.hsecEppDeliveryLine.findMany({
        where: { companyId, deliveryId: id },
        orderBy: { createdAt: 'asc' },
        include: { item: { select: { name: true, active: true } } },
      }),
    ]);
    const { fileData, ...rest } = delivery;
    return {
      ...rest,
      hasFile: !!(delivery.fileName && (delivery.filePath || fileData)),
      fullName: names[delivery.employeeId] ?? null,
      lines: lines.map((l) => ({
        id: l.id,
        eppItemId: l.eppItemId,
        itemName: l.item.name,
        itemActive: l.item.active,
        quantity: l.quantity,
        size: l.size,
      })),
    };
  }

  /** ONE executeWithRls transaction: header + lines together. */
  async create(companyId: string, userId: string, dto: CreateEppDeliveryDto) {
    const names = await this.employeeRead.resolveNamesByIds(companyId, [dto.employeeId]);
    if (names[dto.employeeId] === undefined) {
      throw new BadRequestException('El empleado no pertenece a la empresa.');
    }
    await this.assertLinesUsable(companyId, dto.lines);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const delivery = await tx.hsecEppDelivery.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          date: this.toDateOnly(dto.date),
          notes: dto.notes ?? null,
          // createdBy is ALWAYS the JWT actor — dto.createdBy is a decoy and is NEVER read.
          createdBy: userId,
        },
      });
      await tx.hsecEppDeliveryLine.createMany({
        data: dto.lines.map((l) => ({
          companyId,
          deliveryId: delivery.id,
          eppItemId: l.eppItemId,
          quantity: l.quantity,
          size: l.size ?? null,
        })),
      });
      return delivery;
    });
  }

  /** Header fields date/notes only (employeeId IMMUTABLE — see the DTO). Optional lines[]
   *  REPLACES the full set transactionally: delete + recreate inside ONE transaction — the
   *  audit trigger preserves every old line (the replace-set semantics, recorded). */
  async update(id: string, companyId: string, userId: string, dto: UpdateEppDeliveryDto) {
    await this.getDeliveryOrThrow(id, companyId);
    if (dto.lines) await this.assertLinesUsable(companyId, dto.lines);
    const data: Prisma.HsecEppDeliveryUncheckedUpdateInput = {};
    if (dto.date !== undefined) data.date = this.toDateOnly(dto.date);
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const row = await tx.hsecEppDelivery.update({ where: { id }, data });
      if (dto.lines) {
        await tx.hsecEppDeliveryLine.deleteMany({ where: { companyId, deliveryId: id } });
        await tx.hsecEppDeliveryLine.createMany({
          data: dto.lines.map((l) => ({
            companyId,
            deliveryId: id,
            eppItemId: l.eppItemId,
            quantity: l.quantity,
            size: l.size ?? null,
          })),
        });
      }
      return row;
    });
  }

  /** DELETE always (decision 6) — cascades lines; the audit trigger keeps every row. */
  async remove(id: string, companyId: string, userId: string) {
    await this.getDeliveryOrThrow(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecEppDelivery.delete({ where: { id } });
    });
  }

  /* ---- The acuse file (single slot; upload REPLACES) -----------------------------------
     Cloned from the trainings trio (HSEC-006 — itself the employee-documents storeFile
     copy-adapt); a module-local extraction rides the HSEC-011 polish list, NOT this ticket. */

  private async storeFile(
    companyId: string,
    deliveryId: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string | null; fileData: Uint8Array<ArrayBuffer> | null }> {
    const safeFileName = file.originalname.replace(/[^\w.-]+/g, '_');
    const storageKey = `hsec/epp-deliveries/${companyId}/${deliveryId}/${safeFileName}`;
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
    this.logger.warn('MinIO not available, storing acuse in DB blob');
    return { filePath: null, fileData: Uint8Array.from(file.buffer) };
  }

  /** SINGLE SLOT — uploading again REPLACES the previous acuse (the HSEC-006 semantics; the
   *  audit trigger preserves the prior columns). */
  async uploadFile(id: string, companyId: string, userId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException('Formato no permitido para el acuse.');
    }
    await this.getDeliveryOrThrow(id, companyId);
    const { filePath, fileData } = await this.storeFile(companyId, id, file);
    const row = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecEppDelivery.update({
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

  /** DB blob wins when present; otherwise pull from MinIO (the house read-path idiom). */
  async downloadFile(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.hsecEppDelivery.findFirst({
      where: { id, companyId },
      select: { fileName: true, mimeType: true, filePath: true, fileData: true },
    });
    if (!row) throw new NotFoundException('Entrega no encontrada');
    if (!row.fileName || !row.mimeType) throw new NotFoundException('Acuse no disponible.');
    if (row.fileData) {
      return { buffer: Buffer.from(row.fileData), mimeType: row.mimeType, fileName: row.fileName };
    }
    if (row.filePath) {
      const buffer = await this.storage.downloadFile(DOCUMENTS_BUCKET, row.filePath);
      return { buffer, mimeType: row.mimeType, fileName: row.fileName };
    }
    throw new NotFoundException('Acuse no disponible.');
  }

  async deleteFile(id: string, companyId: string, userId: string) {
    const delivery = await this.getDeliveryOrThrow(id, companyId);
    if (!delivery.fileName) throw new NotFoundException('Acuse no disponible.');
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.hsecEppDelivery.update({
        where: { id },
        data: { fileName: null, mimeType: null, fileSize: null, filePath: null, fileData: null },
      });
    });
    return { removed: true };
  }
}
