import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PermitStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { ApprovalActionsService } from './approvals/approval-actions.service';
import { ArchivePermitDto } from './dto/archive-permit.dto';
import { CreatePermitDto } from './dto/create-permit.dto';
import { FilterPermitsDto } from './dto/filter-permits.dto';
import { RejectPermitDto } from './dto/reject-permit.dto';
import { SupersedePermitDto } from './dto/supersede-permit.dto';
import { UpdatePermitDto } from './dto/update-permit.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PERMITS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
const FILE_MAX_BYTES = 10 * 1024 * 1024;

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
const ALLOWED_EXTENSIONS = new Set<string>([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
]);

export type DerivedPermitStatus =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'BORRADOR'
  | 'PENDIENTE_REVISION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'REEMPLAZADO'
  | 'ARCHIVADO';

@Injectable()
export class PermitsService {
  private readonly logger = new Logger(PermitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly approvalActions: ApprovalActionsService,
  ) {}

  /* Mirrors DocumentRecordsService.deriveStatus — same UI semantics so
     the frontend can reuse the badge component. */
  private deriveStatus(
    status: PermitStatus,
    expirationDate: Date | null,
    alertDaysBefore: number,
    now: Date,
  ): DerivedPermitStatus {
    if (status === 'APPROVED' && expirationDate) {
      const ms = expirationDate.getTime() - now.getTime();
      const days = Math.floor(ms / 86400000);
      if (days < 0) return 'VENCIDO';
      if (days <= alertDaysBefore) return 'POR_VENCER';
      return 'VIGENTE';
    }
    if (status === 'APPROVED') return 'APROBADO';
    if (status === 'DRAFT') return 'BORRADOR';
    if (status === 'PENDING_REVIEW') return 'PENDIENTE_REVISION';
    if (status === 'REJECTED') return 'RECHAZADO';
    if (status === 'REPLACED') return 'REEMPLAZADO';
    return 'ARCHIVADO';
  }

  async findAll(companyId: string, filters: FilterPermitsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const where: Prisma.PermitWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.permitTypeId) where.permitTypeId = filters.permitTypeId;
    if (filters.status) where.status = filters.status;
    if (!filters.includeReplaced && filters.status !== 'REPLACED') {
      where.status = where.status ?? { not: 'REPLACED' };
    }
    const expirationFilter: Prisma.DateTimeNullableFilter = {};
    if (filters.expirationFrom) expirationFilter.gte = new Date(filters.expirationFrom);
    if (filters.expirationTo) expirationFilter.lte = new Date(filters.expirationTo);
    if (filters.expiringInDays != null) {
      const horizon = new Date(today);
      horizon.setUTCDate(horizon.getUTCDate() + filters.expiringInDays);
      expirationFilter.gte = today;
      expirationFilter.lte = horizon;
      where.status = 'APPROVED';
    }
    if (filters.isExpired) {
      expirationFilter.lt = today;
      where.status = 'APPROVED';
    }
    if (Object.keys(expirationFilter).length > 0) {
      where.expirationDate = expirationFilter;
    }
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { permitNumber: { contains: s, mode: 'insensitive' } },
        { issuingAuthority: { contains: s, mode: 'insensitive' } },
        { scope: { contains: s, mode: 'insensitive' } },
        { permitType: { name: { contains: s, mode: 'insensitive' } } },
        { permitType: { code: { contains: s, mode: 'insensitive' } } },
        { asset: { code: { contains: s, mode: 'insensitive' } } },
        { asset: { name: { contains: s, mode: 'insensitive' } } },
        { location: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.permit.findMany({
        where,
        select: {
          id: true,
          permitTypeId: true,
          assetId: true,
          locationId: true,
          permitNumber: true,
          issuingAuthority: true,
          issueDate: true,
          expirationDate: true,
          scope: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          status: true,
          statusReason: true,
          version: true,
          uploadedBy: true,
          createdAt: true,
          updatedAt: true,
          permitType: {
            select: {
              id: true,
              name: true,
              code: true,
              category: true,
              criticality: true,
              blocksOperation: true,
              alertDaysBefore: true,
              hasExpiration: true,
              defaultValidityDays: true,
              issuingAuthority: true,
              color: true,
              icon: true,
            },
          },
          asset: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              assetType: { select: { id: true, name: true, category: true } },
            },
          },
          location: {
            select: { id: true, name: true, code: true, address: true },
          },
        },
        orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.permit.count({ where }),
    ]);

    const data = rows.map((r) => ({
      ...r,
      derivedStatus: this.deriveStatus(
        r.status,
        r.expirationDate,
        r.permitType.alertDaysBefore,
        now,
      ),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.permit.findFirst({
      where: { id, companyId },
      include: {
        permitType: true,
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            assetType: { select: { id: true, name: true, category: true } },
          },
        },
        location: { select: { id: true, name: true, code: true, address: true } },
        replacedBy: {
          select: { id: true, permitNumber: true, version: true, status: true },
        },
        replaces: {
          select: {
            id: true,
            permitNumber: true,
            version: true,
            status: true,
            createdAt: true,
          },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Permiso no encontrado');
    const now = new Date();
    return {
      ...row,
      derivedStatus: this.deriveStatus(
        row.status,
        row.expirationDate,
        row.permitType.alertDaysBefore,
        now,
      ),
    };
  }

  async getCompliance(companyId: string) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    /* Latest APPROVED, non-replaced, isActive permit per
       (target, permitTypeId) — same heuristic as documents. */
    const latest = await this.prisma.permit.findMany({
      where: {
        companyId,
        isActive: true,
        status: 'APPROVED',
        replacedByPermitId: null,
      },
      select: {
        id: true,
        assetId: true,
        locationId: true,
        permitTypeId: true,
        expirationDate: true,
        permitType: {
          select: { criticality: true, alertDaysBefore: true, hasExpiration: true },
        },
      },
    });

    let total = 0;
    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    const seen = new Set<string>();
    for (const p of latest) {
      const targetKey = `${p.assetId ?? p.locationId ?? '?'}::${p.permitTypeId}`;
      if (seen.has(targetKey)) continue;
      seen.add(targetKey);
      total++;
      if (!p.permitType.hasExpiration || !p.expirationDate) {
        valid++;
        continue;
      }
      const exp = p.expirationDate;
      const expUtc = new Date(Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate()));
      const days = Math.floor((expUtc.getTime() - today.getTime()) / 86400000);
      if (days < 0) expired++;
      else if (days <= p.permitType.alertDaysBefore) expiringSoon++;
      else valid++;
    }
    const compliancePercentage =
      total === 0 ? 100 : Math.round(((valid + expiringSoon) / total) * 1000) / 10;
    return { total, valid, expiringSoon, expired, compliancePercentage };
  }

  /* ---- Workflow + create -------------------------------------- */

  private validateFile(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_MIMETYPES.has(file.mimetype) && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        'Formato no permitido. Usa PDF, JPG, PNG, WEBP, DOC, DOCX, XLS o XLSX.',
      );
    }
  }

  /* Validates exactly one of (assetId, locationId) is set and that it
     belongs to the company. Returns the resolved permitType. */
  private async validateRefs(
    companyId: string,
    permitTypeId: string,
    assetId?: string,
    locationId?: string,
  ) {
    if (!assetId && !locationId) {
      throw new BadRequestException('El permiso debe asociarse a un activo o a una ubicación.');
    }
    if (assetId && locationId) {
      throw new BadRequestException(
        'El permiso solo puede asociarse a un activo o a una ubicación, no ambos.',
      );
    }
    const [permitType, asset, location] = await Promise.all([
      this.prisma.permitType.findFirst({
        where: { id: permitTypeId, companyId },
      }),
      assetId
        ? this.prisma.operationalAsset.findFirst({
            where: { id: assetId, companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
      locationId
        ? this.prisma.location.findFirst({
            where: { id: locationId, companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!permitType) {
      throw new BadRequestException('El tipo de permiso no existe en esta empresa.');
    }
    if (assetId && !asset) {
      throw new BadRequestException('El activo no existe en esta empresa.');
    }
    if (locationId && !location) {
      throw new BadRequestException('La ubicación no existe en esta empresa.');
    }
    return { permitType };
  }

  private async storeFile(
    companyId: string,
    permitId: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string | null; fileData: Uint8Array<ArrayBuffer> | null }> {
    const safeFileName = file.originalname.replace(/[^\w.-]+/g, '_');
    const storageKey = `operations/permits/${companyId}/${permitId}/${safeFileName}`;
    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(PERMITS_BUCKET, storageKey, file.buffer, file.mimetype);
        return { filePath: storageKey, fileData: null };
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB blob`,
        );
        return { filePath: null, fileData: Uint8Array.from(file.buffer) };
      }
    }
    return { filePath: null, fileData: Uint8Array.from(file.buffer) };
  }

  private async nextVersion(
    companyId: string,
    permitTypeId: string,
    assetId?: string | null,
    locationId?: string | null,
  ) {
    const latest = await this.prisma.permit.aggregate({
      where: {
        companyId,
        permitTypeId,
        ...(assetId ? { assetId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      _max: { version: true },
    });
    return (latest._max.version ?? 0) + 1;
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreatePermitDto,
    file: Express.Multer.File | undefined,
  ) {
    this.validateFile(file);
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');

    const { permitType } = await this.validateRefs(
      companyId,
      dto.permitTypeId,
      dto.assetId,
      dto.locationId,
    );

    const status: PermitStatus = dto.setStatus ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'El estado inicial debe ser DRAFT o PENDING_REVIEW. Otros estados se gestionan en el workflow.',
      );
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    let expirationDate: Date | null = null;
    if (dto.expirationDate) {
      expirationDate = new Date(dto.expirationDate);
    } else if (permitType.hasExpiration && issueDate && permitType.defaultValidityDays) {
      const exp = new Date(issueDate);
      exp.setDate(exp.getDate() + permitType.defaultValidityDays);
      expirationDate = exp;
    }

    const version = await this.nextVersion(
      companyId,
      dto.permitTypeId,
      dto.assetId,
      dto.locationId,
    );

    const permitId = randomUUID();
    const { filePath, fileData } = await this.storeFile(companyId, permitId, file);

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.permit.create({
        data: {
          id: permitId,
          companyId,
          permitTypeId: dto.permitTypeId,
          assetId: dto.assetId ?? null,
          locationId: dto.locationId ?? null,
          permitNumber: dto.permitNumber.trim(),
          issuingAuthority: dto.issuingAuthority?.trim() ?? permitType.issuingAuthority ?? null,
          issueDate,
          expirationDate,
          scope: dto.scope?.trim() ?? null,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath,
          fileData,
          status,
          statusChangedAt: new Date(),
          statusChangedBy: userId,
          uploadedBy: userId,
          version,
          notes: dto.notes ?? null,
          isActive: true,
        },
        include: {
          permitType: true,
          asset: { select: { id: true, code: true, name: true } },
          location: { select: { id: true, name: true, code: true } },
        },
      }),
    );
    /* OPS-026 — when a permit is created already in PENDING_REVIEW
       (the common "I have the file, send it for approval now" flow),
       initialize the multi-step chain right away so downstream
       approve/reject calls can advance it. */
    if (status === 'PENDING_REVIEW') {
      await this.approvalActions.initializeApprovalChain(
        companyId,
        userId,
        created.id,
        'external-permit',
      );
    }
    return created;
  }

  async update(id: string, companyId: string, userId: string, dto: UpdatePermitDto) {
    const existing = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Permiso no encontrado');

    if (existing.status === 'REPLACED') {
      throw new ForbiddenException('No se puede editar un permiso reemplazado.');
    }
    if (dto.status !== undefined) {
      if (existing.status !== 'DRAFT' || dto.status !== 'PENDING_REVIEW') {
        throw new BadRequestException(
          'Solo se permite cambiar el estado de BORRADOR a PENDIENTE_REVISION desde este endpoint.',
        );
      }
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.permit.update({
        where: { id },
        data: {
          ...(dto.permitNumber !== undefined ? { permitNumber: dto.permitNumber.trim() } : {}),
          ...(dto.issuingAuthority !== undefined
            ? { issuingAuthority: dto.issuingAuthority?.trim() ?? null }
            : {}),
          ...(dto.issueDate !== undefined
            ? { issueDate: dto.issueDate ? new Date(dto.issueDate) : null }
            : {}),
          ...(dto.expirationDate !== undefined
            ? { expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null }
            : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope?.trim() ?? null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
          ...(dto.status !== undefined
            ? { status: dto.status, statusChangedAt: new Date(), statusChangedBy: userId }
            : {}),
        },
      }),
    );
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Permiso no encontrado');
    if (existing.status === 'APPROVED') {
      throw new ForbiddenException(
        'No se puede eliminar un permiso APROBADO. Usa archivar en su lugar.',
      );
    }
    if (existing.status === 'REPLACED') {
      throw new ForbiddenException('No se puede eliminar un permiso reemplazado (inmutable).');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.permit.update({
        where: { id },
        data: { isActive: false },
      }),
    );
  }

  async archive(id: string, companyId: string, userId: string, dto: ArchivePermitDto) {
    const existing = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { id: true, notes: true },
    });
    if (!existing) throw new NotFoundException('Permiso no encontrado');
    const archiveNote = `[Archivado ${new Date().toISOString()}] ${dto.reason}`;
    const mergedNotes = existing.notes ? `${existing.notes}\n\n${archiveNote}` : archiveNote;
    return this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.permit.update({
        where: { id },
        data: {
          status: 'ARCHIVED',
          statusReason: dto.reason,
          statusChangedAt: new Date(),
          statusChangedBy: userId,
          notes: mergedNotes,
          isActive: false,
        },
      }),
    );
  }

  /* OPS-026 — multi-step approval. Calls into the engine, which owns
     status transitions, signature hashing, and notifications. The
     legacy "uploader cannot approve" rule is preserved by the
     engine's `mustBeDifferentFromRequester` flag (defaults to true
     on every step). */
  async approve(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, currentApprovalStep: true },
    });
    if (!existing) throw new NotFoundException('Permiso no encontrado');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Solo se pueden aprobar permisos en estado PENDIENTE_REVISION');
    }
    /* Lazy chain init — handles permits created before OPS-026 that
       reached PENDING_REVIEW without ever calling
       initializeApprovalChain. Idempotent on re-entry: when the row
       already has approvals seeded the call is a no-op (the engine
       deletes prior PENDING rows and re-seeds, but the chain shape
       is identical so no state is lost). */
    if (existing.currentApprovalStep === 0) {
      await this.approvalActions.initializeApprovalChain(companyId, userId, id, 'external-permit');
    }
    const refreshed = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { currentApprovalStep: true },
    });
    const stepOrder = Math.max(1, refreshed?.currentApprovalStep ?? 1);
    await this.approvalActions.approveStep(
      companyId,
      userId,
      id,
      'external-permit',
      { stepOrder },
      { ip: null, userAgent: null },
    );
    return this.findOne(id, companyId);
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectPermitDto) {
    const existing = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, currentApprovalStep: true },
    });
    if (!existing) throw new NotFoundException('Permiso no encontrado');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Solo se pueden rechazar permisos en estado PENDIENTE_REVISION',
      );
    }
    if (existing.currentApprovalStep === 0) {
      await this.approvalActions.initializeApprovalChain(companyId, userId, id, 'external-permit');
    }
    const refreshed = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { currentApprovalStep: true },
    });
    const stepOrder = Math.max(1, refreshed?.currentApprovalStep ?? 1);
    await this.approvalActions.rejectStep(
      companyId,
      userId,
      id,
      'external-permit',
      { stepOrder, notes: dto.reason },
      { ip: null, userAgent: null },
    );
    return this.findOne(id, companyId);
  }

  async resubmit(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, uploadedBy: true },
    });
    if (!existing) throw new NotFoundException('Permiso no encontrado');
    if (existing.status !== 'REJECTED') {
      throw new BadRequestException(
        'Solo se pueden reenviar a revisión permisos en estado RECHAZADO',
      );
    }
    if (existing.uploadedBy !== userId) {
      throw new ForbiddenException(
        'Solo el usuario que cargó el permiso puede reenviarlo a revisión',
      );
    }
    const now = new Date();
    const updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.permit.update({
        where: { id },
        data: {
          status: 'PENDING_REVIEW',
          rejectedBy: null,
          rejectedAt: null,
          statusReason: null,
          statusChangedAt: now,
          statusChangedBy: userId,
        },
      }),
    );
    /* OPS-026 — restart the chain on resubmission. The engine deletes
       the prior approvals before re-seeding, so signature hashes from
       the first attempt are kept in the audit trail (deletes go
       through audit triggers) but are no longer queryable through the
       active timeline. */
    await this.approvalActions.initializeApprovalChain(companyId, userId, id, 'external-permit');
    return updated;
  }

  async supersede(
    companyId: string,
    userId: string,
    oldPermitId: string,
    dto: SupersedePermitDto,
    file: Express.Multer.File | undefined,
  ) {
    this.validateFile(file);
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');

    const old = await this.prisma.permit.findFirst({
      where: { id: oldPermitId, companyId },
      select: {
        id: true,
        assetId: true,
        locationId: true,
        permitTypeId: true,
        status: true,
        isActive: true,
        replacedByPermitId: true,
        version: true,
      },
    });
    if (!old) throw new NotFoundException('Permiso no encontrado');
    if (old.status !== 'APPROVED') {
      throw new BadRequestException(
        'Solo se pueden reemplazar permisos APROBADOS. Para otros estados, edita o sube uno nuevo.',
      );
    }
    if (!old.isActive) {
      throw new BadRequestException('No se puede reemplazar un permiso inactivo.');
    }
    if (old.replacedByPermitId) {
      throw new BadRequestException('Este permiso ya fue reemplazado por una versión más nueva.');
    }
    const { permitType } = await this.validateRefs(
      companyId,
      old.permitTypeId,
      old.assetId ?? undefined,
      old.locationId ?? undefined,
    );

    const status: PermitStatus = dto.setStatus ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'El estado inicial debe ser DRAFT o PENDING_REVIEW. Otros estados se gestionan en el workflow.',
      );
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    let expirationDate: Date | null = null;
    if (dto.expirationDate) {
      expirationDate = new Date(dto.expirationDate);
    } else if (permitType.hasExpiration && issueDate && permitType.defaultValidityDays) {
      const exp = new Date(issueDate);
      exp.setDate(exp.getDate() + permitType.defaultValidityDays);
      expirationDate = exp;
    }

    const version = await this.nextVersion(
      companyId,
      old.permitTypeId,
      old.assetId,
      old.locationId,
    );

    const newPermitId = randomUUID();
    const { filePath, fileData } = await this.storeFile(companyId, newPermitId, file);
    const now = new Date();

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const created = await tx.permit.create({
        data: {
          id: newPermitId,
          companyId,
          permitTypeId: old.permitTypeId,
          assetId: old.assetId,
          locationId: old.locationId,
          permitNumber: dto.permitNumber.trim(),
          issuingAuthority: dto.issuingAuthority?.trim() ?? null,
          issueDate,
          expirationDate,
          scope: dto.scope?.trim() ?? null,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          filePath,
          fileData,
          status,
          statusChangedAt: now,
          statusChangedBy: userId,
          uploadedBy: userId,
          version,
          notes: dto.notes ?? null,
          isActive: true,
        },
      });
      const replaced = await tx.permit.update({
        where: { id: old.id },
        data: {
          status: 'REPLACED',
          replacedByPermitId: created.id,
          statusReason: `Reemplazado por versión v${version}`,
          statusChangedAt: now,
          statusChangedBy: userId,
        },
      });
      return { newPermit: created, replacedPermit: replaced };
    });
  }

  /* Version history for a (target, permitType) pair. The target is
     identified by exactly one of assetId/locationId. */
  async getVersionHistory(
    companyId: string,
    permitTypeId: string,
    assetId?: string,
    locationId?: string,
  ) {
    if (!assetId && !locationId) {
      throw new BadRequestException('Debes indicar assetId o locationId.');
    }
    const rows = await this.prisma.permit.findMany({
      where: {
        companyId,
        permitTypeId,
        ...(assetId ? { assetId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      include: {
        permitType: { select: { id: true, name: true, code: true, alertDaysBefore: true } },
      },
      orderBy: { version: 'desc' },
    });
    const now = new Date();
    return rows.map((r) => ({
      ...r,
      derivedStatus: this.deriveStatus(
        r.status,
        r.expirationDate,
        r.permitType.alertDaysBefore,
        now,
      ),
    }));
  }

  async downloadFile(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.permit.findFirst({
      where: { id, companyId },
      select: { fileName: true, mimeType: true, filePath: true, fileData: true },
    });
    if (!row || !row.fileName || !row.mimeType) {
      throw new NotFoundException('Archivo no disponible.');
    }
    if (row.fileData) {
      return {
        buffer: Buffer.from(row.fileData),
        mimeType: row.mimeType,
        fileName: row.fileName,
      };
    }
    if (row.filePath) {
      const buffer = await this.storage.downloadFile(PERMITS_BUCKET, row.filePath);
      return { buffer, mimeType: row.mimeType, fileName: row.fileName };
    }
    throw new NotFoundException('Archivo no disponible.');
  }
}
