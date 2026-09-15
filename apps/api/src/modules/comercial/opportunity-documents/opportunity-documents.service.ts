import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppAbility, OpportunityDocumentSubject } from '../../common/casl/casl-ability.factory';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { formatStorageError } from '../../common/storage/storage-error.util';
import { StorageService } from '../../common/storage/storage.service';
import { CreateOpportunityDocumentDto } from './dto/create-opportunity-document.dto';

/* COM-017 — every file constant in ONE place. Same bucket constant as RRHH documents
   (employee-documents.service.ts) — one bucket, one client, no new env vars. */
const DOCUMENTS_BUCKET = process.env.MINIO_BUCKET || 'excelsia-documents';
export const FILE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const FILE_NAME_MAX_LENGTH = 200;
/* Allowlist keyed by EXTENSION: the extension must be on the list, and the declared MIME
   must either match that extension's MIME or be application/octet-stream (browsers —
   notably Windows without Office — label .docx/.xlsx that way); in the octet-stream case
   the STORED MIME is the one derived from the extension. Any other combination is a 400.
   No magic-byte sniffing — no module does it. */
export const ALLOWED_EXTENSION_MIMES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
export const GENERIC_BINARY_MIME = 'application/octet-stream';
const FORMAT_ERROR = 'Formato no permitido. Usa PDF, DOCX, XLSX, PNG o JPG.';

/* COM-017 — files attached to a deal. Same shape as OpportunityNotesService: the
 * opportunity is verified to exist IN THE CALLER'S COMPANY before any read/write (404
 * otherwise); every write runs inside executeWithRls; createdBy comes from the JWT.
 * Storage: the single StorageService client (MinIO local / R2 prod), server-streamed
 * upload AND download (the bytes stream through the API, exactly like RRHH documents —
 * no signed URLs). There is NO DB blob fallback — if
 * storage is unavailable the upload FAILS (503) instead of degrading. Soft delete only:
 * the object is never removed from storage (hard purge is V2). */
@Injectable()
export class OpportunityDocumentsService {
  private readonly logger = new Logger(OpportunityDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
  ) {}

  /** Live documents (deletedAt IS NULL), newest-first. */
  async findAllByOpportunity(companyId: string, opportunityId: string) {
    await this.assertOpportunityInCompany(opportunityId, companyId);
    return this.prisma.opportunityDocument.findMany({
      where: { companyId, opportunityId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /** UPLOAD — validate everything BEFORE touching storage; the author is the JWT user. */
  async create(
    companyId: string,
    userId: string,
    dto: CreateOpportunityDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    await this.assertOpportunityInCompany(dto.opportunityId, companyId);
    const validated = this.validateFile(file);
    const storageKey = await this.storeFile(companyId, dto.opportunityId, validated);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunityDocument.create({
        data: {
          companyId,
          opportunityId: dto.opportunityId,
          kind: dto.kind,
          fileName: validated.fileName,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          storageKey,
          createdBy: userId, // NEVER from input
        },
      });
    });
  }

  /** DOWNLOAD — the bytes, pulled with the same StorageService call RRHH uses
   * (downloadFile) and streamed by the controller. 404 when the row is missing, foreign,
   * or soft-deleted — checked BEFORE touching storage. */
  async downloadFile(
    companyId: string,
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const doc = await this.findLiveDocument(id, companyId);
    const buffer = await this.storage.downloadFile(DOCUMENTS_BUCKET, doc.storageKey);
    return { buffer, mimeType: doc.mimeType, fileName: doc.fileName };
  }

  /** SOFT DELETE — the author, or a caller whose ability carries `manage` on this subject
   * (ADMIN/SUPER_ADMIN via `manage all`). Sets deletedAt; the storage object is kept. */
  async remove(companyId: string, userId: string, id: string, ability: AppAbility) {
    const doc = await this.findLiveDocument(id, companyId);
    const isAuthor = doc.createdBy === userId;
    if (!isAuthor && !ability.can('manage', OpportunityDocumentSubject)) {
      throw new ForbiddenException(
        'Solo quien lo subió o un administrador puede eliminar este documento.',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunityDocument.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }

  /* ── validation ─────────────────────────────────────────────────────────── */

  /** Size, extension allowlist, MIME/extension agreement (octet-stream tolerated),
   * sanitized display name. Returns the MIME to STORE (derived from the extension when
   * the browser sent application/octet-stream). */
  private validateFile(file: Express.Multer.File | undefined): {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
  } {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío.');
    if (file.size > FILE_MAX_BYTES) {
      throw new BadRequestException('El archivo excede el límite de 20 MB.');
    }
    const fileName = sanitizeFileName(file.originalname);
    const ext = extensionOf(fileName);
    const expectedMime = ALLOWED_EXTENSION_MIMES[ext];
    if (!expectedMime) throw new BadRequestException(FORMAT_ERROR);
    const declaredMime = (file.mimetype ?? '').toLowerCase();
    if (declaredMime !== expectedMime && declaredMime !== GENERIC_BINARY_MIME) {
      throw new BadRequestException(
        'La extensión del archivo no coincide con su tipo. ' + FORMAT_ERROR,
      );
    }
    return { fileName, mimeType: expectedMime, sizeBytes: file.size, buffer: file.buffer };
  }

  /* ── storage ────────────────────────────────────────────────────────────── */

  /** companies/<companyId>/opportunities/<opportunityId>/<uuid>-<safeName>. No blob
   * fallback by design: unavailable storage is a 503, never a silent degrade. */
  private async storeFile(
    companyId: string,
    opportunityId: string,
    file: { fileName: string; mimeType: string; buffer: Buffer },
  ): Promise<string> {
    const safeName = file.fileName.replace(/[^\w.-]+/g, '_');
    const storageKey = `companies/${companyId}/opportunities/${opportunityId}/${randomUUID()}-${safeName}`;
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('El almacenamiento de archivos no está disponible.');
    }
    try {
      await this.storage.uploadFile(DOCUMENTS_BUCKET, storageKey, file.buffer, file.mimeType);
    } catch (err) {
      this.logger.error(`MinIO/R2 upload failed [${formatStorageError(err)}]`);
      throw new ServiceUnavailableException('No se pudo guardar el archivo. Intenta de nuevo.');
    }
    return storageKey;
  }

  /* ── lookups ────────────────────────────────────────────────────────────── */

  private async findLiveDocument(id: string, companyId: string) {
    const doc = await this.prisma.opportunityDocument.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return doc;
  }

  private async assertOpportunityInCompany(opportunityId: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
  }
}

/* ── pure helpers (exported for the spec) ─────────────────────────────────── */

/** Display-name sanitizer: drop path segments (keep the last), strip control characters,
 * collapse whitespace, trim, keep the extension, cap the BASE name so the total length
 * is ≤ 200. Throws 400 when nothing usable remains. */
export function sanitizeFileName(raw: string): string {
  const lastSegment = (raw ?? '').split(/[\\/]+/).pop() ?? '';
  // Drop control characters (0x00-0x1f, 0x7f) by code point — no control-char regex.
  const withoutControl = Array.from(lastSegment)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join('');
  const cleaned = withoutControl.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    throw new BadRequestException('El nombre del archivo no es válido.');
  }
  const dot = cleaned.lastIndexOf('.');
  const hasExt = dot > 0 && dot < cleaned.length - 1;
  const base = hasExt ? cleaned.slice(0, dot) : cleaned;
  const ext = hasExt ? cleaned.slice(dot) : '';
  const room = FILE_NAME_MAX_LENGTH - ext.length;
  const trimmedBase = base.length > room ? base.slice(0, Math.max(room, 1)).trimEnd() : base;
  return `${trimmedBase}${ext}`;
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}
