import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertSeverity,
  Prisma,
  ProcedureCategory,
  ProcedureStatus,
  RevisionType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateProcedureDto } from './dto/create-procedure.dto';
import { FilterProceduresDto } from './dto/filter-procedures.dto';
import { CreateNewVersionDto } from './dto/new-version-procedure.dto';
import { UpdateProcedureDto } from './dto/update-procedure.dto';
import {
  AddAttachmentDto,
  DeprecateProcedureDto,
  PublishProcedureDto,
  ReviewProcedureDto,
} from './dto/workflow.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAIN_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
const MAIN_FILE_MAX_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

const ALLOWED_MAIN_MIMETYPES = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_ATTACHMENT_MIMETYPES = new Set<string>([
  ...ALLOWED_MAIN_MIMETYPES,
  'text/plain',
  'text/csv',
]);

interface AttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  filePath?: string | null;
  fileData?: string | null;
  description?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

@Injectable()
export class ProceduresService {
  private readonly logger = new Logger(ProceduresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
  ) {}

  /* ---- Read ----------------------------------------------------- */

  async findAll(companyId: string, userId: string, filters: FilterProceduresDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.ProcedureWhereInput = {
      companyId,
      isActive: true,
    };
    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    } else if (!filters.includeDeprecated) {
      where.status = { not: 'DEPRECATED' };
    }
    if (filters.category) where.category = filters.category;
    if (filters.requiresAcknowledgment !== undefined) {
      where.requiresAcknowledgment = filters.requiresAcknowledgment;
    }
    if (filters.applicableAssetId) {
      /* Match if the asset is in applicableAssetIds OR its asset
         type is in applicableAssetTypeIds. We compute the asset's
         typeId once and compose an OR. */
      const asset = await this.prisma.operationalAsset.findFirst({
        where: { id: filters.applicableAssetId, companyId },
        select: { id: true, assetTypeId: true, locationId: true },
      });
      if (!asset) {
        return this.emptyPage(page, limit);
      }
      where.OR = [
        { applicableAssetIds: { has: asset.id } },
        { applicableAssetTypeIds: { has: asset.assetTypeId } },
        ...(asset.locationId
          ? [{ applicableLocationIds: { has: asset.locationId } } as Prisma.ProcedureWhereInput]
          : []),
      ];
    }
    if (filters.applicableToMe) {
      const role = await this.userRoleInCompany(userId, companyId);
      if (role) {
        where.OR = [...(where.OR ?? []), { applicableRoles: { has: role } }];
      }
    }
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        ...(where.OR ?? []),
        { code: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { keywords: { has: s } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.procedure.findMany({
        where,
        select: this.listSelect(),
        orderBy: [{ category: 'asc' }, { code: 'asc' }, { version: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.procedure.count({ where }),
    ]);
    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      include: {
        replaces: { select: { id: true, code: true, version: true, status: true } },
        replacedBy: { select: { id: true, code: true, version: true, status: true } },
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!row) throw new NotFoundException('Procedimiento no encontrado.');
    /* All versions of the same code (handy for the version sidebar). */
    const allVersions = await this.prisma.procedure.findMany({
      where: { companyId, code: row.code, isActive: true },
      select: { id: true, version: true, status: true, publishedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { ...row, allVersions };
  }

  async getKpiCounts(companyId: string) {
    const [published, inReview, draft, withAck] = await Promise.all([
      this.prisma.procedure.count({
        where: { companyId, isActive: true, status: 'PUBLISHED' },
      }),
      this.prisma.procedure.count({
        where: { companyId, isActive: true, status: 'IN_REVIEW' },
      }),
      this.prisma.procedure.count({
        where: { companyId, isActive: true, status: 'DRAFT' },
      }),
      this.prisma.procedure.count({
        where: {
          companyId,
          isActive: true,
          status: 'PUBLISHED',
          requiresAcknowledgment: true,
        },
      }),
    ]);
    return { published, inReview, draft, withAck };
  }

  async getCategoryCounts(companyId: string) {
    const rows = await this.prisma.procedure.groupBy({
      by: ['category'],
      where: { companyId, isActive: true, status: 'PUBLISHED' },
      _count: { _all: true },
    });
    const out: Record<ProcedureCategory, number> = {
      OPERATION: 0,
      MAINTENANCE: 0,
      EMERGENCY: 0,
      SAFETY: 0,
      QUALITY: 0,
      ENVIRONMENTAL: 0,
      OTHER: 0,
    };
    for (const r of rows) out[r.category] = r._count._all;
    return out;
  }

  /* OPS-027 part 8 — applicable procedures view used by the asset
     detail page. Returns PUBLISHED procedures that target this
     asset (directly, by asset type, or by location), plus those
     that target the user's role. */
  async getApplicable(companyId: string, userId: string, assetId: string | undefined) {
    const role = await this.userRoleInCompany(userId, companyId);
    const where: Prisma.ProcedureWhereInput = {
      companyId,
      isActive: true,
      status: 'PUBLISHED',
    };
    const ors: Prisma.ProcedureWhereInput[] = [];
    if (assetId) {
      const asset = await this.prisma.operationalAsset.findFirst({
        where: { id: assetId, companyId },
        select: { id: true, assetTypeId: true, locationId: true },
      });
      if (asset) {
        ors.push({ applicableAssetIds: { has: asset.id } });
        ors.push({ applicableAssetTypeIds: { has: asset.assetTypeId } });
        if (asset.locationId) {
          ors.push({ applicableLocationIds: { has: asset.locationId } });
        }
      }
    }
    if (role) {
      ors.push({ applicableRoles: { has: role } });
    }
    if (ors.length === 0) return [];
    where.OR = ors;
    return this.prisma.procedure.findMany({
      where,
      select: this.listSelect(),
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  async getRevisions(procedureId: string, companyId: string) {
    const exists = await this.prisma.procedure.findFirst({
      where: { id: procedureId, companyId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Procedimiento no encontrado.');
    return this.prisma.procedureRevision.findMany({
      where: { companyId, procedureId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /* ---- Mutations / workflow ----------------------------------- */

  async create(
    companyId: string,
    userId: string,
    dto: CreateProcedureDto,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo principal.');
    this.validateMainFile(file);

    const procedureId = randomUUID();
    const version = (dto.version ?? '1.0').trim();
    const code = dto.code.trim().toUpperCase();
    const { filePath, fileData } = await this.storeMainFile(companyId, procedureId, file);

    const initialStatus: ProcedureStatus = dto.submitImmediately ? 'IN_REVIEW' : 'DRAFT';

    let created;
    try {
      created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const row = await tx.procedure.create({
          data: {
            id: procedureId,
            companyId,
            code,
            title: dto.title.trim(),
            description: dto.description?.trim() ?? null,
            category: dto.category,
            authoredBy: userId,
            version,
            changelog: dto.changelog?.trim() ?? null,
            fileName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            filePath,
            fileData,
            keywords: dto.keywords ?? [],
            scope: dto.scope?.trim() ?? null,
            estimatedReadingMinutes: dto.estimatedReadingMinutes ?? null,
            requiresAcknowledgment: dto.requiresAcknowledgment ?? false,
            acknowledgmentDeadlineDays: dto.acknowledgmentDeadlineDays ?? null,
            applicableAssetTypeIds: dto.applicableAssetTypeIds ?? [],
            applicableAssetIds: dto.applicableAssetIds ?? [],
            applicableLocationIds: dto.applicableLocationIds ?? [],
            applicableRoles: dto.applicableRoles ?? [],
            status: initialStatus,
          },
        });
        await tx.procedureRevision.create({
          data: {
            companyId,
            procedureId: row.id,
            revisionType: RevisionType.CREATED,
            changedBy: userId,
            changeNotes: 'Creación inicial',
            newData: { version, status: row.status },
          },
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Ya existe un procedimiento con el código ${code} y versión ${version}.`,
        );
      }
      throw err;
    }
    if (initialStatus === 'IN_REVIEW') {
      await this.notifyReviewerRoles(companyId, created.id, created.code, created.title);
    }
    return this.findOne(created.id, companyId);
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateProcedureDto) {
    const existing = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, authoredBy: true },
    });
    if (!existing) throw new NotFoundException('Procedimiento no encontrado.');
    if (existing.status === 'PUBLISHED' || existing.status === 'SUPERSEDED') {
      throw new BadRequestException(
        'No se puede editar un procedimiento publicado. Crea una nueva versión.',
      );
    }
    if (existing.status === 'DEPRECATED') {
      throw new BadRequestException('No se puede editar un procedimiento deprecado.');
    }
    if (existing.authoredBy !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException(
        'Solo el autor o un administrador pueden editar el procedimiento.',
      );
    }

    const data: Prisma.ProcedureUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() ?? null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.version !== undefined) data.version = dto.version.trim();
    if (dto.changelog !== undefined) data.changelog = dto.changelog?.trim() ?? null;
    if (dto.keywords !== undefined) data.keywords = dto.keywords;
    if (dto.scope !== undefined) data.scope = dto.scope?.trim() ?? null;
    if (dto.estimatedReadingMinutes !== undefined) {
      data.estimatedReadingMinutes = dto.estimatedReadingMinutes ?? null;
    }
    if (dto.requiresAcknowledgment !== undefined) {
      data.requiresAcknowledgment = dto.requiresAcknowledgment;
    }
    if (dto.acknowledgmentDeadlineDays !== undefined) {
      data.acknowledgmentDeadlineDays = dto.acknowledgmentDeadlineDays ?? null;
    }
    if (dto.applicableAssetTypeIds !== undefined) {
      data.applicableAssetTypeIds = dto.applicableAssetTypeIds;
    }
    if (dto.applicableAssetIds !== undefined) {
      data.applicableAssetIds = dto.applicableAssetIds;
    }
    if (dto.applicableLocationIds !== undefined) {
      data.applicableLocationIds = dto.applicableLocationIds;
    }
    if (dto.applicableRoles !== undefined) data.applicableRoles = dto.applicableRoles;

    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.procedure.update({ where: { id }, data });
      await tx.procedureRevision.create({
        data: {
          companyId,
          procedureId: id,
          revisionType: RevisionType.UPDATED,
          changedBy: userId,
          newData: dto as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, authoredBy: true },
    });
    if (!existing) throw new NotFoundException('Procedimiento no encontrado.');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Solo se puede eliminar un borrador.');
    }
    if (existing.authoredBy !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo el autor o un administrador pueden eliminar el borrador.');
    }
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.procedure.update({ where: { id }, data: { isActive: false } }),
    );
  }

  async submitForReview(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, authoredBy: true, code: true, title: true },
    });
    if (!existing) throw new NotFoundException('Procedimiento no encontrado.');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Solo se puede enviar a revisión un borrador.');
    }
    if (existing.authoredBy !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo el autor puede enviarlo a revisión.');
    }
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.procedure.update({
        where: { id },
        data: { status: ProcedureStatus.IN_REVIEW },
      });
      await tx.procedureRevision.create({
        data: {
          companyId,
          procedureId: id,
          revisionType: RevisionType.UPDATED,
          changedBy: userId,
          changeNotes: 'Enviado a revisión',
        },
      });
    });
    await this.notifyReviewerRoles(companyId, id, existing.code, existing.title);
    return this.findOne(id, companyId);
  }

  async review(id: string, companyId: string, userId: string, dto: ReviewProcedureDto) {
    const existing = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, authoredBy: true, code: true, title: true },
    });
    if (!existing) throw new NotFoundException('Procedimiento no encontrado.');
    if (existing.status !== 'IN_REVIEW') {
      throw new BadRequestException('El procedimiento no está en revisión.');
    }
    if (existing.authoredBy === userId) {
      throw new ForbiddenException('El autor no puede revisar su propio procedimiento.');
    }
    if (!(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo administradores o gerentes pueden revisar.');
    }
    const now = new Date();
    if (dto.approved) {
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        await tx.procedure.update({
          where: { id },
          data: { reviewedBy: userId, reviewedAt: now },
        });
        await tx.procedureRevision.create({
          data: {
            companyId,
            procedureId: id,
            revisionType: RevisionType.REVIEWED,
            changedBy: userId,
            changeNotes: dto.notes ?? null,
          },
        });
      });
    } else {
      const reason = dto.notes?.trim();
      if (!reason || reason.length < 10) {
        throw new BadRequestException('Indica un motivo de al menos 10 caracteres al rechazar.');
      }
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        await tx.procedure.update({
          where: { id },
          data: {
            status: ProcedureStatus.DRAFT,
            statusReason: reason,
            reviewedBy: null,
            reviewedAt: null,
          },
        });
        await tx.procedureRevision.create({
          data: {
            companyId,
            procedureId: id,
            revisionType: RevisionType.UPDATED,
            changedBy: userId,
            changeNotes: `Rechazado en revisión: ${reason}`,
          },
        });
      });
      await this.notifications.createGeneric(companyId, {
        userIds: [existing.authoredBy],
        sourceType: 'DOCUMENT_REJECTED',
        title: `Procedimiento ${existing.code} rechazado en revisión`,
        message: reason,
        severity: 'WARNING' as AlertSeverity,
        linkPath: `/operaciones/procedimientos/${id}`,
        icon: 'XCircle',
      });
    }
    return this.findOne(id, companyId);
  }

  async publish(id: string, companyId: string, userId: string, dto: PublishProcedureDto) {
    const existing = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        reviewedBy: true,
        reviewedAt: true,
        replacesProcedureId: true,
        code: true,
        title: true,
        applicableRoles: true,
        authoredBy: true,
      },
    });
    if (!existing) throw new NotFoundException('Procedimiento no encontrado.');
    if (existing.status !== 'IN_REVIEW') {
      throw new BadRequestException('Solo procedimientos en revisión pueden publicarse.');
    }
    if (!existing.reviewedBy || !existing.reviewedAt) {
      throw new BadRequestException('Falta la revisión previa antes de publicar.');
    }
    if (!(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo administradores o gerentes pueden publicar.');
    }
    const effective = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();

    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.procedure.update({
        where: { id },
        data: {
          status: ProcedureStatus.PUBLISHED,
          publishedBy: userId,
          publishedAt: effective,
          statusReason: dto.notes ?? null,
        },
      });
      /* Auto-supersede the replaced procedure if any. */
      if (existing.replacesProcedureId) {
        await tx.procedure.update({
          where: { id: existing.replacesProcedureId },
          data: {
            status: ProcedureStatus.SUPERSEDED,
            replacedByProcedureId: id,
          },
        });
        await tx.procedureRevision.create({
          data: {
            companyId,
            procedureId: existing.replacesProcedureId,
            revisionType: RevisionType.SUPERSEDED,
            changedBy: userId,
            changeNotes: `Reemplazado por nueva versión ${id}`,
          },
        });
      }
      await tx.procedureRevision.create({
        data: {
          companyId,
          procedureId: id,
          revisionType: RevisionType.PUBLISHED,
          changedBy: userId,
          changeNotes: dto.notes ?? null,
        },
      });
    });
    /* Notify role-targeted users that a new procedure is live. */
    if (existing.applicableRoles.length > 0) {
      const memberships = await this.prisma.membership.findMany({
        where: {
          companyId,
          isActive: true,
          role: {
            in: existing.applicableRoles.filter((r): r is UserRole =>
              ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'].includes(r),
            ),
          },
        },
        select: { userId: true },
      });
      const userIds = [...new Set(memberships.map((m) => m.userId))];
      if (userIds.length > 0) {
        await this.notifications.createGeneric(companyId, {
          userIds,
          sourceType: 'DOCUMENT_APPROVED',
          title: `Procedimiento publicado: ${existing.code}`,
          message: existing.title,
          severity: 'INFO' as AlertSeverity,
          linkPath: `/operaciones/procedimientos/${id}`,
          icon: 'CheckCircle2',
        });
      }
    }
    return this.findOne(id, companyId);
  }

  async createNewVersion(
    sourceId: string,
    companyId: string,
    userId: string,
    dto: CreateNewVersionDto,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo principal de la nueva versión.');
    this.validateMainFile(file);
    const source = await this.prisma.procedure.findFirst({
      where: { id: sourceId, companyId },
    });
    if (!source) throw new NotFoundException('Procedimiento origen no encontrado.');
    if (source.status !== 'PUBLISHED' && source.status !== 'IN_REVIEW') {
      throw new BadRequestException(
        'Solo se puede crear una nueva versión a partir de un procedimiento publicado o en revisión.',
      );
    }
    if (source.code !== dto.code.trim().toUpperCase()) {
      throw new BadRequestException('El código de la nueva versión debe coincidir con el origen.');
    }
    if (source.version === dto.version.trim()) {
      throw new ConflictException('La nueva versión debe ser distinta de la actual.');
    }

    const newId = randomUUID();
    const { filePath, fileData } = await this.storeMainFile(companyId, newId, file);
    let created;
    try {
      created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const row = await tx.procedure.create({
          data: {
            id: newId,
            companyId,
            code: source.code,
            title: dto.title.trim(),
            description: dto.description?.trim() ?? source.description,
            category: dto.category,
            authoredBy: userId,
            version: dto.version.trim(),
            changelog: dto.changelog.trim(),
            replacesProcedureId: source.id,
            fileName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            filePath,
            fileData,
            keywords: dto.keywords ?? source.keywords,
            scope: dto.scope?.trim() ?? source.scope,
            estimatedReadingMinutes: dto.estimatedReadingMinutes ?? source.estimatedReadingMinutes,
            requiresAcknowledgment: dto.requiresAcknowledgment ?? source.requiresAcknowledgment,
            acknowledgmentDeadlineDays:
              dto.acknowledgmentDeadlineDays ?? source.acknowledgmentDeadlineDays,
            applicableAssetTypeIds: dto.applicableAssetTypeIds ?? source.applicableAssetTypeIds,
            applicableAssetIds: dto.applicableAssetIds ?? source.applicableAssetIds,
            applicableLocationIds: dto.applicableLocationIds ?? source.applicableLocationIds,
            applicableRoles: dto.applicableRoles ?? source.applicableRoles,
            status: ProcedureStatus.DRAFT,
          },
        });
        await tx.procedureRevision.create({
          data: {
            companyId,
            procedureId: row.id,
            revisionType: RevisionType.CREATED,
            changedBy: userId,
            changeNotes: `Nueva versión ${row.version} (reemplaza ${source.version})`,
            newData: { version: row.version, replacesProcedureId: source.id },
          },
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Ya existe una versión "${dto.version}" para el código ${source.code}.`,
        );
      }
      throw err;
    }
    return this.findOne(created.id, companyId);
  }

  async deprecate(id: string, companyId: string, userId: string, dto: DeprecateProcedureDto) {
    const existing = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Procedimiento no encontrado.');
    if (existing.status !== 'PUBLISHED') {
      throw new BadRequestException('Solo se pueden deprecar procedimientos publicados.');
    }
    const role = await this.userRoleInCompany(userId, companyId);
    if (!role || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ForbiddenException('Solo un administrador puede deprecar.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.procedure.update({
        where: { id },
        data: {
          status: ProcedureStatus.DEPRECATED,
          deprecatedBy: userId,
          deprecatedAt: new Date(),
          statusReason: dto.reason.trim(),
        },
      });
      await tx.procedureRevision.create({
        data: {
          companyId,
          procedureId: id,
          revisionType: RevisionType.DEPRECATED,
          changedBy: userId,
          changeNotes: dto.reason.trim(),
        },
      });
      return updated;
    });
  }

  /* ---- Attachments + main file ------------------------------- */

  async addAttachment(
    id: string,
    companyId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    dto: AddAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    if (!ALLOWED_ATTACHMENT_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException('Formato no permitido para adjuntos.');
    }
    const procedure = await this.findOne(id, companyId);
    if (procedure.status === 'DEPRECATED' || procedure.status === 'SUPERSEDED') {
      throw new BadRequestException(
        'No se pueden agregar adjuntos a procedimientos deprecados o reemplazados.',
      );
    }
    const list = (procedure.attachments ?? []) as unknown as AttachmentRecord[];
    if (list.length >= MAX_ATTACHMENTS) {
      throw new BadRequestException(`Máximo ${MAX_ATTACHMENTS} adjuntos por procedimiento.`);
    }
    const attachmentId = randomUUID();
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_');
    let filePath: string | null = null;
    let fileData: string | null = null;
    if (this.storage.isConfigured()) {
      const key = `operations/procedures/${id}/attachments/${attachmentId}-${safeName}`;
      try {
        await this.storage.uploadFile(MAIN_BUCKET, key, file.buffer, file.mimetype);
        filePath = key;
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to base64.`,
        );
        fileData = file.buffer.toString('base64');
      }
    } else {
      fileData = file.buffer.toString('base64');
    }
    const record: AttachmentRecord = {
      id: attachmentId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      filePath,
      fileData,
      description: dto.description?.trim() ?? null,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    };
    const next = [...list, record];
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.procedure.update({
        where: { id },
        data: { attachments: next as unknown as Prisma.InputJsonValue },
      }),
    );
    return { ...record, fileData: undefined };
  }

  async removeAttachment(id: string, companyId: string, userId: string, attachmentIndex: number) {
    const procedure = await this.findOne(id, companyId);
    if (procedure.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden eliminar adjuntos en estado borrador. Crea una nueva versión para cambios posteriores.',
      );
    }
    const list = [...((procedure.attachments ?? []) as unknown as AttachmentRecord[])];
    if (attachmentIndex < 0 || attachmentIndex >= list.length) {
      throw new NotFoundException('Adjunto no encontrado.');
    }
    if (procedure.authoredBy !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo el autor o un administrador pueden eliminar adjuntos.');
    }
    list.splice(attachmentIndex, 1);
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.procedure.update({
        where: { id },
        data: { attachments: list as unknown as Prisma.InputJsonValue },
      }),
    );
    return { removed: attachmentIndex };
  }

  async downloadFile(id: string, companyId: string) {
    const proc = await this.prisma.procedure.findFirst({
      where: { id, companyId },
      select: { fileName: true, mimeType: true, filePath: true, fileData: true },
    });
    if (!proc) throw new NotFoundException('Procedimiento no encontrado.');
    let buffer: Buffer;
    if (proc.filePath) {
      buffer = await this.storage.downloadFile(MAIN_BUCKET, proc.filePath);
    } else if (proc.fileData) {
      buffer = Buffer.from(proc.fileData);
    } else {
      throw new NotFoundException('Archivo no disponible.');
    }
    return { fileName: proc.fileName, mimeType: proc.mimeType, buffer };
  }

  async downloadAttachment(id: string, companyId: string, attachmentIndex: number) {
    const proc = await this.findOne(id, companyId);
    const list = (proc.attachments ?? []) as unknown as AttachmentRecord[];
    const att = list[attachmentIndex];
    if (!att) throw new NotFoundException('Adjunto no encontrado.');
    let buffer: Buffer;
    if (att.filePath) {
      buffer = await this.storage.downloadFile(MAIN_BUCKET, att.filePath);
    } else if (att.fileData) {
      buffer = Buffer.from(att.fileData, 'base64');
    } else {
      throw new NotFoundException('Archivo no disponible.');
    }
    return { fileName: att.fileName, mimeType: att.mimeType, buffer };
  }

  /* ---- Helpers ------------------------------------------------ */

  private validateMainFile(file: Express.Multer.File) {
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > MAIN_FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 25 MB.');
    }
    if (!ALLOWED_MAIN_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Usa PDF, DOC/DOCX, XLS/XLSX o imagen.');
    }
  }

  private async storeMainFile(companyId: string, procedureId: string, file: Express.Multer.File) {
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_');
    if (this.storage.isConfigured()) {
      const key = `operations/procedures/${companyId}/${procedureId}/main/${safeName}`;
      try {
        await this.storage.uploadFile(MAIN_BUCKET, key, file.buffer, file.mimetype);
        return { filePath: key, fileData: null as Uint8Array<ArrayBuffer> | null };
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB blob`,
        );
      }
    }
    return {
      filePath: null as string | null,
      fileData: Uint8Array.from(file.buffer),
    };
  }

  private listSelect() {
    return {
      id: true,
      code: true,
      title: true,
      description: true,
      category: true,
      version: true,
      authoredBy: true,
      reviewedBy: true,
      publishedBy: true,
      publishedAt: true,
      status: true,
      requiresAcknowledgment: true,
      acknowledgmentDeadlineDays: true,
      estimatedReadingMinutes: true,
      keywords: true,
      applicableAssetTypeIds: true,
      applicableAssetIds: true,
      applicableLocationIds: true,
      applicableRoles: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.ProcedureSelect;
  }

  private emptyPage(page: number, limit: number) {
    return {
      data: [] as Array<unknown>,
      total: 0,
      page,
      limit,
      totalPages: 1,
    };
  }

  private async userRoleInCompany(userId: string, companyId: string): Promise<string | null> {
    const m = await this.prisma.membership.findFirst({
      where: { userId, companyId, isActive: true },
      select: { role: true },
    });
    return m?.role ?? null;
  }

  private async isAdminOrManager(userId: string, companyId: string) {
    const role = await this.userRoleInCompany(userId, companyId);
    return role !== null && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role);
  }

  private async notifyReviewerRoles(
    companyId: string,
    procedureId: string,
    code: string,
    title: string,
  ) {
    /* Reviewers are MANAGER + ADMIN. Could become per-category in
       a future ticket; for now mirroring the OPS-026 pattern. */
    const memberships = await this.prisma.membership.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
      select: { userId: true },
    });
    const userIds = [...new Set(memberships.map((m) => m.userId))];
    if (userIds.length === 0) return;
    await this.notifications.createGeneric(companyId, {
      userIds,
      sourceType: 'GENERAL',
      title: `Procedimiento ${code} en revisión`,
      message: title,
      severity: 'WARNING' as AlertSeverity,
      linkPath: `/operaciones/procedimientos/${procedureId}`,
      icon: 'BookOpen',
    });
  }
}
