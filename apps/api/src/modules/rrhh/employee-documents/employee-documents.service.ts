import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { EmployeeDocumentRequirementsService } from './employee-document-requirements.service';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { RejectEmployeeDocumentDto } from './dto/reject-employee-document.dto';
import { SupersedeEmployeeDocumentDto } from './dto/supersede-employee-document.dto';

const DOCUMENTS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
/* EmployeeDocumentType has no per-type alertDaysBefore column (kept thin); the
   POR_VENCER window uses a single platform default. Mirrors the Operations
   deriveStatus, which read documentType.alertDaysBefore (default 30). */
const DEFAULT_ALERT_DAYS_BEFORE = 30;

/* MIME/extension allow-list — copied VERBATIM from the Operations engine
   (document-records.service.ts). We accept a file when EITHER the mimetype is on
   the list OR the extension matches (some browsers send octet-stream for Office
   docs). */
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

export type EmployeeDocDerivedStatus =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'BORRADOR'
  | 'PENDIENTE_REVISION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'REEMPLAZADO'
  | 'ARCHIVADO';

type FolderState =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDO'
  | 'FALTANTE'
  | 'PENDIENTE_REVISION'
  | 'RECHAZADO'
  | 'BORRADOR';

@Injectable()
export class EmployeeDocumentsService {
  private readonly logger = new Logger(EmployeeDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly requirementsService: EmployeeDocumentRequirementsService,
  ) {}

  /* Derived UI status — folds the expiry window on top of the persisted status.
     Only APPROVED + expiring docs flip to VIGENTE/POR_VENCER/VENCIDO. Copy of
     the Operations deriveStatus (expirationDate→expiryDate, fixed alert days). */
  private deriveStatus(
    status: DocumentRecordStatus,
    expiryDate: Date | null,
    now: Date,
  ): EmployeeDocDerivedStatus {
    if (status === 'APPROVED' && expiryDate) {
      const days = Math.floor((expiryDate.getTime() - now.getTime()) / 86400000);
      if (days < 0) return 'VENCIDO';
      if (days <= DEFAULT_ALERT_DAYS_BEFORE) return 'POR_VENCER';
      return 'VIGENTE';
    }
    if (status === 'APPROVED') return 'APROBADO';
    if (status === 'DRAFT') return 'BORRADOR';
    if (status === 'PENDING_REVIEW') return 'PENDIENTE_REVISION';
    if (status === 'REJECTED') return 'RECHAZADO';
    if (status === 'REPLACED') return 'REEMPLAZADO';
    return 'ARCHIVADO';
  }

  private enrich<T extends { status: DocumentRecordStatus; expiryDate: Date | null }>(
    doc: T,
    now = new Date(),
  ) {
    return { ...doc, derivedStatus: this.deriveStatus(doc.status, doc.expiryDate, now) };
  }

  /* Validates an uploaded file against the size + MIME/extension allow-list.
     Copied verbatim from the Operations engine. */
  private validateFile(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 10 MB.');
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const mimeOk = ALLOWED_MIMETYPES.has(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.has(ext);
    if (!mimeOk && !extOk) {
      throw new BadRequestException(
        'Formato no permitido. Usa PDF, JPG, PNG, WEBP, DOC, DOCX, XLS o XLSX.',
      );
    }
  }

  /* Validates that the employee and document type both belong to the company —
     guards against cross-tenant references via crafted UUIDs. Returns the type's
     expiry metadata for auto-calculation. */
  private async validateRefs(companyId: string, employeeId: string, documentTypeId: string) {
    const [employee, documentType] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true },
      }),
      this.prisma.employeeDocumentType.findFirst({
        where: { id: documentTypeId, companyId },
        select: { id: true, requiresExpiry: true, defaultValidityDays: true },
      }),
    ]);
    if (!employee) throw new BadRequestException('El trabajador no existe en esta empresa.');
    if (!documentType) {
      throw new BadRequestException('El tipo de documento no existe en esta empresa.');
    }
    return { documentType };
  }

  /* Persist a file via MinIO when configured, falling back to a DB blob. Returns
     the (storageKey, blobFallback) pair — exactly one is populated, mirroring
     the Operations filePath/fileData strategy. */
  private async storeFile(
    companyId: string,
    recordId: string,
    file: Express.Multer.File,
  ): Promise<{ storageKey: string | null; blobFallback: Uint8Array<ArrayBuffer> | null }> {
    const safeFileName = file.originalname.replace(/[^\w.-]+/g, '_');
    const storageKey = `rrhh/documents/${companyId}/${recordId}/${safeFileName}`;
    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(DOCUMENTS_BUCKET, storageKey, file.buffer, file.mimetype);
        return { storageKey, blobFallback: null };
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB blob`,
        );
        return { storageKey: null, blobFallback: Uint8Array.from(file.buffer) };
      }
    }
    this.logger.warn('MinIO not available, storing document in DB blob');
    return { storageKey: null, blobFallback: Uint8Array.from(file.buffer) };
  }

  /* Next version for a (employee, documentType) pair — monotonic, never reused. */
  private async nextVersion(
    companyId: string,
    employeeId: string,
    documentTypeId: string,
  ): Promise<number> {
    const latest = await this.prisma.employeeDocument.aggregate({
      where: { companyId, employeeId, documentTypeId },
      _max: { version: true },
    });
    return (latest._max.version ?? 0) + 1;
  }

  /* Resolve the auto-expiry: explicit dto value wins; otherwise derive from the
     type's defaultValidityDays when it requires an expiry and we have an issue
     date to anchor on. */
  private resolveExpiry(
    dtoExpiry: string | undefined,
    issueDate: Date | null,
    documentType: { requiresExpiry: boolean; defaultValidityDays: number | null },
  ): Date | null {
    if (dtoExpiry) return new Date(dtoExpiry);
    if (documentType.requiresExpiry && issueDate && documentType.defaultValidityDays) {
      const exp = new Date(issueDate);
      exp.setDate(exp.getDate() + documentType.defaultValidityDays);
      return exp;
    }
    return null;
  }

  async list(companyId: string, employeeId: string, includeReplaced = false) {
    const where: Prisma.EmployeeDocumentWhereInput = { companyId, employeeId };
    if (!includeReplaced) where.status = { not: 'REPLACED' };
    const rows = await this.prisma.employeeDocument.findMany({
      where,
      include: { documentType: true },
      orderBy: [{ documentTypeId: 'asc' }, { version: 'desc' }],
    });
    const now = new Date();
    return rows.map((r) => this.enrich(r, now));
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      include: {
        documentType: true,
        supersededBy: { select: { id: true, fileName: true, version: true, status: true } },
        supersedes: {
          select: { id: true, fileName: true, version: true, status: true, createdAt: true },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    return this.enrich(row);
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreateEmployeeDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    this.validateFile(file);
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');

    const { documentType } = await this.validateRefs(companyId, dto.employeeId, dto.documentTypeId);

    const status: DocumentRecordStatus = dto.setStatus ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'El estado inicial debe ser DRAFT o PENDING_REVIEW. Otros estados se gestionan en el workflow.',
      );
    }

    /* Refuse silent re-uploads when an APPROVED, non-superseded doc of the same
       type already exists for this employee. The frontend intercepts the 409 to
       offer the supersession flow; forceNewVersion=true bypasses it. */
    const force = dto.forceNewVersion === 'true' || (dto.forceNewVersion as unknown) === true;
    if (!force) {
      const existingApproved = await this.prisma.employeeDocument.findFirst({
        where: {
          companyId,
          employeeId: dto.employeeId,
          documentTypeId: dto.documentTypeId,
          status: 'APPROVED',
          supersededById: null,
        },
        select: { id: true },
      });
      if (existingApproved) {
        throw new ConflictException({
          error: 'DOCUMENT_ALREADY_EXISTS',
          message:
            "Ya existe un documento aprobado de este tipo para este trabajador. Para reemplazarlo, usa la acción 'Reemplazar versión' desde el documento existente.",
          existingDocumentId: existingApproved.id,
        });
      }
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    const expiryDate = this.resolveExpiry(dto.expiryDate, issueDate, documentType);
    const version = await this.nextVersion(companyId, dto.employeeId, dto.documentTypeId);

    const recordId = randomUUID();
    const { storageKey, blobFallback } = await this.storeFile(companyId, recordId, file);

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocument.create({
        data: {
          id: recordId,
          companyId,
          employeeId: dto.employeeId,
          documentTypeId: dto.documentTypeId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
          blobFallback,
          issueDate,
          expiryDate,
          status,
          approvalStatus: 'PENDIENTE',
          version,
          uploadedBy: userId,
          createdBy: userId,
        },
        include: { documentType: true },
      });
    });
    return this.enrich(created);
  }

  /* Supersede an APPROVED document with a new version. The old row becomes
     immutable (status=REPLACED, supersededById set); the new row inherits
     employee+type and bumps version. Both writes happen in one transaction.
     Copy-adapted from the Operations supersedeDocument (assetId→employeeId,
     replacedByDocumentId→supersededById). */
  async supersedeDocument(
    companyId: string,
    userId: string,
    oldDocumentId: string,
    dto: SupersedeEmployeeDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    this.validateFile(file);
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');

    const old = await this.prisma.employeeDocument.findFirst({
      where: { id: oldDocumentId, companyId },
      select: {
        id: true,
        employeeId: true,
        documentTypeId: true,
        status: true,
        supersededById: true,
        version: true,
      },
    });
    if (!old) throw new NotFoundException('Documento no encontrado');
    if (old.status !== 'APPROVED') {
      throw new BadRequestException(
        'Solo se pueden reemplazar documentos APROBADOS. Para otros estados, edita o sube un nuevo documento.',
      );
    }
    if (old.supersededById) {
      throw new BadRequestException('Este documento ya fue reemplazado por una versión más nueva.');
    }

    const { documentType } = await this.validateRefs(companyId, old.employeeId, old.documentTypeId);

    const status: DocumentRecordStatus = dto.setStatus ?? 'DRAFT';
    if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'El estado inicial debe ser DRAFT o PENDING_REVIEW. Otros estados se gestionan en el workflow.',
      );
    }

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
    const expiryDate = this.resolveExpiry(dto.expiryDate, issueDate, documentType);
    const version = await this.nextVersion(companyId, old.employeeId, old.documentTypeId);

    const newRecordId = randomUUID();
    const { storageKey, blobFallback } = await this.storeFile(companyId, newRecordId, file);

    const result = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const newRecord = await tx.employeeDocument.create({
        data: {
          id: newRecordId,
          companyId,
          employeeId: old.employeeId,
          documentTypeId: old.documentTypeId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageKey,
          blobFallback,
          issueDate,
          expiryDate,
          status,
          approvalStatus: 'PENDIENTE',
          version,
          uploadedBy: userId,
          createdBy: userId,
        },
        include: { documentType: true },
      });
      const replaced = await tx.employeeDocument.update({
        where: { id: old.id },
        data: {
          status: 'REPLACED',
          supersededById: newRecord.id,
          statusReason: `Reemplazado por versión v${version}`,
          updatedBy: userId,
        },
        include: { documentType: true },
      });
      return { newRecord, replaced };
    });

    const now = new Date();
    return {
      newDocument: this.enrich(result.newRecord, now),
      replacedDocument: this.enrich(result.replaced, now),
    };
  }

  /* Returns the file buffer + meta for streaming. DB blob wins when present
     (already in memory); otherwise pull from MinIO. */
  async downloadFile(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      select: { fileName: true, mimeType: true, storageKey: true, blobFallback: true },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    if (row.blobFallback) {
      return {
        buffer: Buffer.from(row.blobFallback),
        mimeType: row.mimeType,
        fileName: row.fileName,
      };
    }
    if (row.storageKey) {
      const buffer = await this.storage.downloadFile(DOCUMENTS_BUCKET, row.storageKey);
      return { buffer, mimeType: row.mimeType, fileName: row.fileName };
    }
    throw new NotFoundException('Archivo no disponible.');
  }

  /* Approve a PENDING_REVIEW document. Self-approval is blocked at the service
     layer (uploader≠approver) so the rule holds even if a frontend slips
     through. No asset-blocking / commitment side effects (recon R1). */
  async approve(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, uploadedBy: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Solo se pueden aprobar documentos en estado PENDIENTE_REVISION',
      );
    }
    if (existing.uploadedBy === userId) {
      throw new ForbiddenException('No puedes aprobar un documento que tú mismo cargaste');
    }
    const now = new Date();
    const approved = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocument.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvalStatus: 'APROBADO',
          approvedBy: userId,
          approvedAt: now,
          /* Clear the rejection trail in case this cycled reject→resubmit→approve.
             History is preserved by the audit trigger. */
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          statusReason: null,
          updatedBy: userId,
        },
        include: { documentType: true },
      });
    });
    return this.enrich(approved, now);
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectEmployeeDocumentDto) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, uploadedBy: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Solo se pueden rechazar documentos en estado PENDIENTE_REVISION',
      );
    }
    if (existing.uploadedBy === userId) {
      throw new ForbiddenException('No puedes rechazar un documento que tú mismo cargaste');
    }
    const now = new Date();
    const rejected = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocument.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvalStatus: 'RECHAZADO',
          rejectedBy: userId,
          rejectedAt: now,
          rejectionReason: dto.reason,
          statusReason: dto.reason,
          updatedBy: userId,
        },
        include: { documentType: true },
      });
    });
    return this.enrich(rejected, now);
  }

  /* Resubmit a REJECTED document for review. Restricted to the original
     uploader. */
  async resubmit(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, uploadedBy: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status !== 'REJECTED') {
      throw new BadRequestException(
        'Solo se pueden reenviar a revisión documentos en estado RECHAZADO',
      );
    }
    if (existing.uploadedBy !== userId) {
      throw new ForbiddenException(
        'Solo el usuario que cargó el documento puede reenviarlo a revisión',
      );
    }
    const now = new Date();
    const resubmitted = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocument.update({
        where: { id },
        data: {
          status: 'PENDING_REVIEW',
          approvalStatus: 'PENDIENTE',
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          statusReason: null,
          updatedBy: userId,
        },
        include: { documentType: true },
      });
    });
    return this.enrich(resubmitted, now);
  }

  /* Guarded hard-delete (the table is thin — no isActive soft-delete column).
     APPROVED must be superseded, not deleted; REPLACED is immutable history. */
  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Documento no encontrado');
    if (existing.status === 'APPROVED') {
      throw new ForbiddenException(
        'No se puede eliminar un documento APROBADO. Usa "Reemplazar versión" en su lugar.',
      );
    }
    if (existing.status === 'REPLACED') {
      throw new ForbiddenException(
        'No se puede eliminar un documento reemplazado: forma parte del historial inmutable.',
      );
    }
    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.employeeDocument.delete({ where: { id } });
    });
    return { id, deleted: true };
  }

  /* Per-employee compliance — resolves required docs (employee > jobPosition),
     picks the latest APPROVED non-superseded doc per type, and computes the
     state. REPLACED rows are EXCLUDED from the grouping (immutable history).
     Copy-adapted from the Operations getAssetFolder compliance block. */
  async compliance(companyId: string, employeeId: string) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true, fullName: true, jobPositionId: true },
    });
    if (!employee) throw new NotFoundException('Trabajador no encontrado');

    const [requirements, allDocuments] = await Promise.all([
      this.requirementsService.resolveRequirementsForEmployee(companyId, employeeId),
      this.prisma.employeeDocument.findMany({
        where: { companyId, employeeId },
        include: { documentType: true },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    /* Per documentTypeId pick the row that drives compliance. APPROVED +
       non-superseded wins; otherwise the newest non-REPLACED row so the UI can
       show PENDING_REVIEW/REJECTED instead of "missing". REPLACED is skipped. */
    const latestApprovedByType = new Map<string, (typeof allDocuments)[number]>();
    const latestAnyByType = new Map<string, (typeof allDocuments)[number]>();
    for (const d of allDocuments) {
      if (d.status === 'REPLACED') continue;
      if (!latestAnyByType.has(d.documentTypeId)) latestAnyByType.set(d.documentTypeId, d);
      if (
        d.status === 'APPROVED' &&
        d.supersededById === null &&
        !latestApprovedByType.has(d.documentTypeId)
      ) {
        latestApprovedByType.set(d.documentTypeId, d);
      }
    }

    let totalRequired = 0;
    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    let missing = 0;
    let pendingReview = 0;
    let rejected = 0;

    const requiredDocuments = requirements.map((req) => {
      totalRequired++;
      const approved = latestApprovedByType.get(req.documentTypeId);
      const fallback = latestAnyByType.get(req.documentTypeId);
      const latest = approved ?? fallback ?? null;

      let folderState: FolderState;
      let daysUntilExpiry: number | null = null;
      if (approved) {
        if (approved.expiryDate) {
          daysUntilExpiry = Math.floor(
            (approved.expiryDate.getTime() - today.getTime()) / 86400000,
          );
          if (daysUntilExpiry < 0) {
            folderState = 'VENCIDO';
            expired++;
          } else if (daysUntilExpiry <= DEFAULT_ALERT_DAYS_BEFORE) {
            folderState = 'POR_VENCER';
            expiringSoon++;
          } else {
            folderState = 'VIGENTE';
            valid++;
          }
        } else {
          folderState = 'VIGENTE';
          valid++;
        }
      } else if (fallback) {
        if (fallback.status === 'PENDING_REVIEW') {
          folderState = 'PENDIENTE_REVISION';
          pendingReview++;
        } else if (fallback.status === 'REJECTED') {
          folderState = 'RECHAZADO';
          rejected++;
        } else {
          folderState = fallback.status === 'DRAFT' ? 'BORRADOR' : 'FALTANTE';
          missing++;
        }
      } else {
        folderState = 'FALTANTE';
        missing++;
      }

      return {
        documentType: req.documentType,
        isMandatory: req.isMandatory ?? true,
        appliesToClient: req.appliesToClient,
        appliesToSite: req.appliesToSite,
        resolvedFrom: req.resolvedFrom,
        latestRecord: latest ? this.enrich(latest, now) : null,
        derivedStatus: folderState,
        daysUntilExpiry,
      };
    });

    /* Uploaded docs whose type isn't in the requirements matrix (ad-hoc certs,
       attachments). Only the latest non-REPLACED per type. */
    const requiredTypeIds = new Set(requirements.map((r) => r.documentTypeId));
    const additionalDocuments = Array.from(latestAnyByType.values())
      .filter((d) => !requiredTypeIds.has(d.documentTypeId))
      .map((d) => this.enrich(d, now));

    const compliancePercentage =
      totalRequired === 0 ? 100 : Math.round(((valid + expiringSoon) / totalRequired) * 1000) / 10;

    return {
      employee: { id: employee.id, fullName: employee.fullName },
      compliance: {
        totalRequired,
        valid,
        expiringSoon,
        expired,
        missing,
        pendingReview,
        rejected,
        compliancePercentage,
      },
      requiredDocuments,
      additionalDocuments,
      generatedAt: now.toISOString(),
    };
  }
}
