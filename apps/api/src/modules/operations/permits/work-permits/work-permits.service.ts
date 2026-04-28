import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AlertSeverity, Prisma, WorkPermitCategory, WorkPermitStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { StorageService } from '../../../common/storage/storage.service';
import { NotificationService } from '../../notifications/notification.service';
import { ApprovalActionsService } from '../approvals/approval-actions.service';
import { CreateWorkPermitDto } from './dto/create-work-permit.dto';
import { FilterWorkPermitsDto } from './dto/filter-work-permits.dto';
import { UpdateWorkPermitDto } from './dto/update-work-permit.dto';
import {
  AuthorizeWorkPermitDto,
  CancelWorkPermitDto,
  CloseWorkPermitDto,
  GasMeasurementDto,
  RejectWorkPermitDto,
  SuspendWorkPermitDto,
} from './dto/workflow.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ATTACHMENTS_BUCKET = process.env.SII_CERT_BUCKET || 'excelsia-documents';
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
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
     raw bytes — acceptable for a 10 MB cap × 5 files per permit. */
  fileData?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface GasMeasurementRecord {
  id: string;
  gas: string;
  value: number;
  unit: string;
  measuredAt: string;
  recordedBy: string;
}

@Injectable()
export class WorkPermitsService {
  private readonly logger = new Logger(WorkPermitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
    private readonly approvalActions: ApprovalActionsService,
  ) {}

  /* ---- Read ----------------------------------------------------- */

  async findAll(companyId: string, filters: FilterWorkPermitsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.WorkPermitWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };
    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters.permitTypeId) where.permitTypeId = filters.permitTypeId;
    if (filters.supervisorId) where.supervisorId = filters.supervisorId;
    if (filters.requestedBy) where.requestedBy = filters.requestedBy;
    if (filters.assetId) where.assetId = filters.assetId;
    if (filters.locationId) where.locationId = filters.locationId;

    if (filters.dateFrom || filters.dateTo) {
      const range: Prisma.DateTimeFilter = {};
      if (filters.dateFrom) range.gte = new Date(filters.dateFrom);
      if (filters.dateTo) range.lte = new Date(filters.dateTo);
      where.plannedStart = range;
    }

    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { permitNumber: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { workLocation: { contains: s, mode: 'insensitive' } },
        { permitType: { name: { contains: s, mode: 'insensitive' } } },
        { permitType: { code: { contains: s, mode: 'insensitive' } } },
        { asset: { code: { contains: s, mode: 'insensitive' } } },
        { asset: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.workPermit.findMany({
        where,
        select: this.listSelect(),
        orderBy: [{ plannedStart: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.workPermit.count({ where }),
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
    const row = await this.prisma.workPermit.findFirst({
      where: { id, companyId },
      include: {
        permitType: true,
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            assetType: { select: { id: true, name: true, category: true } },
          },
        },
        location: { select: { id: true, name: true, code: true, address: true } },
      },
    });
    if (!row) throw new NotFoundException('Permiso de trabajo no encontrado.');
    return row;
  }

  async getActiveCount(companyId: string) {
    const [inExecution, pending, closedToday] = await Promise.all([
      this.prisma.workPermit.count({
        where: { companyId, status: 'IN_EXECUTION', isActive: true },
      }),
      this.prisma.workPermit.count({
        where: { companyId, status: 'PENDING_AUTHORIZATION', isActive: true },
      }),
      this.prisma.workPermit.count({
        where: {
          companyId,
          status: 'CLOSED',
          closedAt: { gte: this.startOfToday() },
        },
      }),
    ]);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const totalMonth = await this.prisma.workPermit.count({
      where: { companyId, createdAt: { gte: monthStart } },
    });
    return { inExecution, pending, closedToday, totalMonth };
  }

  async getInExecution(companyId: string) {
    return this.prisma.workPermit.findMany({
      where: { companyId, status: 'IN_EXECUTION', isActive: true },
      select: this.listSelect(),
      orderBy: { plannedEnd: 'asc' },
    });
  }

  /* ---- Create / Update / Delete -------------------------------- */

  async create(companyId: string, userId: string, dto: CreateWorkPermitDto) {
    const permitType = await this.prisma.workPermitType.findFirst({
      where: { id: dto.permitTypeId, companyId, isActive: true },
    });
    if (!permitType) {
      throw new BadRequestException(
        'El tipo de permiso de trabajo no existe o está inactivo en esta empresa.',
      );
    }

    const plannedStart = new Date(dto.plannedStart);
    const plannedEnd = new Date(dto.plannedEnd);
    if (Number.isNaN(plannedStart.getTime()) || Number.isNaN(plannedEnd.getTime())) {
      throw new BadRequestException('Fechas planificadas inválidas.');
    }
    if (plannedStart >= plannedEnd) {
      throw new BadRequestException('La fecha de inicio debe ser anterior a la fecha de término.');
    }
    const durationMs = plannedEnd.getTime() - plannedStart.getTime();
    const maxDurationMs = permitType.maxDurationHours * 3_600_000;
    if (durationMs > maxDurationMs) {
      throw new BadRequestException(
        `La duración planificada (${Math.round(durationMs / 3_600_000)}h) excede el máximo permitido para este tipo (${permitType.maxDurationHours}h).`,
      );
    }

    if (dto.assetId && dto.locationId) {
      throw new BadRequestException('Asocia el permiso a un activo o a una ubicación, no a ambos.');
    }
    if (dto.assetId) {
      const asset = await this.prisma.operationalAsset.findFirst({
        where: { id: dto.assetId, companyId },
        select: { id: true },
      });
      if (!asset) throw new BadRequestException('El activo no existe en esta empresa.');
    }
    if (dto.locationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: dto.locationId, companyId },
        select: { id: true },
      });
      if (!loc) throw new BadRequestException('La ubicación no existe en esta empresa.');
    }

    const supervisor = await this.prisma.user.findFirst({
      where: { id: dto.supervisorId, isActive: true },
      select: { id: true },
    });
    if (!supervisor) {
      throw new BadRequestException('El supervisor designado no existe o está inactivo.');
    }

    const initialStatus: WorkPermitStatus = dto.submitImmediately
      ? 'PENDING_AUTHORIZATION'
      : 'DRAFT';

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const permitNumber = await this.nextPermitNumber(tx, companyId);
      try {
        return await tx.workPermit.create({
          data: {
            id: randomUUID(),
            companyId,
            permitTypeId: dto.permitTypeId,
            permitNumber,
            title: dto.title.trim(),
            description: dto.description.trim(),
            workLocation: dto.workLocation?.trim() ?? null,
            assetId: dto.assetId ?? null,
            locationId: dto.locationId ?? null,
            plannedStart,
            plannedEnd,
            requestedBy: userId,
            supervisorId: dto.supervisorId,
            workTeam: dto.workTeam as unknown as Prisma.InputJsonValue,
            identifiedRisks:
              dto.identifiedRisks && dto.identifiedRisks.length > 0
                ? dto.identifiedRisks
                : permitType.defaultRisks,
            controlMeasures:
              dto.controlMeasures && dto.controlMeasures.length > 0
                ? dto.controlMeasures
                : permitType.defaultControls,
            additionalNotes: dto.additionalNotes ?? null,
            status: initialStatus,
            statusChangedAt: new Date(),
            statusChangedBy: userId,
            attachments: [] as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Conflicto al asignar el número de permiso. Reintenta.');
        }
        throw err;
      }
    });

    if (initialStatus === 'PENDING_AUTHORIZATION') {
      /* OPS-026 — multi-step engine: initializeApprovalChain creates
         the per-step PermitApproval rows and notifies step 1
         approvers. Falls back to a synthetic 1-step chain when the
         permit type has no approval template configured. */
      await this.approvalActions.initializeApprovalChain(
        companyId,
        userId,
        created.id,
        'work-permit',
      );
    }
    return this.findOne(created.id, companyId);
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateWorkPermitDto) {
    const existing = await this.prisma.workPermit.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        requestedBy: true,
        plannedStart: true,
        plannedEnd: true,
        permitType: { select: { maxDurationHours: true } },
      },
    });
    if (!existing) throw new NotFoundException('Permiso de trabajo no encontrado.');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo los permisos en estado BORRADOR pueden editarse libremente.',
      );
    }
    if (existing.requestedBy !== userId) {
      const role = await this.userRoleInCompany(userId, companyId);
      if (!role || !['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
        throw new ForbiddenException(
          'Solo el solicitante o un administrador pueden editar este permiso.',
        );
      }
    }

    const data: Prisma.WorkPermitUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.workLocation !== undefined) data.workLocation = dto.workLocation?.trim() ?? null;
    if (dto.assetId !== undefined) {
      data.asset = dto.assetId ? { connect: { id: dto.assetId } } : { disconnect: true };
    }
    if (dto.locationId !== undefined) {
      data.location = dto.locationId ? { connect: { id: dto.locationId } } : { disconnect: true };
    }
    let nextStart = existing.plannedStart;
    let nextEnd = existing.plannedEnd;
    if (dto.plannedStart !== undefined) nextStart = new Date(dto.plannedStart);
    if (dto.plannedEnd !== undefined) nextEnd = new Date(dto.plannedEnd);
    if (dto.plannedStart !== undefined || dto.plannedEnd !== undefined) {
      if (nextStart >= nextEnd) {
        throw new BadRequestException('La fecha de inicio debe ser anterior a la de término.');
      }
      const durationH = (nextEnd.getTime() - nextStart.getTime()) / 3_600_000;
      if (durationH > existing.permitType.maxDurationHours) {
        throw new BadRequestException(
          `La duración excede el máximo permitido (${existing.permitType.maxDurationHours}h).`,
        );
      }
      data.plannedStart = nextStart;
      data.plannedEnd = nextEnd;
    }
    if (dto.supervisorId !== undefined) {
      data.supervisorId = dto.supervisorId;
    }
    if (dto.workTeam !== undefined) {
      data.workTeam = dto.workTeam as unknown as Prisma.InputJsonValue;
    }
    if (dto.identifiedRisks !== undefined) data.identifiedRisks = dto.identifiedRisks;
    if (dto.controlMeasures !== undefined) data.controlMeasures = dto.controlMeasures;
    if (dto.additionalNotes !== undefined) data.additionalNotes = dto.additionalNotes ?? null;

    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({ where: { id }, data }),
    );
    return this.findOne(id, companyId);
  }

  /* ---- Workflow ------------------------------------------------- */

  async submitForAuthorization(id: string, companyId: string, userId: string) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'DRAFT') {
      throw new BadRequestException('Solo se puede enviar a autorización un permiso en BORRADOR.');
    }
    if (permit.requestedBy !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException(
        'Solo el solicitante o un administrador pueden enviar el permiso a autorización.',
      );
    }
    await this.transitionStatus(companyId, userId, id, 'PENDING_AUTHORIZATION', null);
    /* OPS-026 — replaces the OPS-025 single-shot notification with
       the multi-step chain initialiser. Falls back to a synthetic
       1-step chain when no template is configured. */
    await this.approvalActions.initializeApprovalChain(companyId, userId, id, 'work-permit');
    return this.findOne(id, companyId);
  }

  /* OPS-026 — thin wrapper. The single-step "authorize" verb now
     advances the multi-step chain by one. The engine does role +
     separation-of-duties checks; we only fail-fast on team-member
     attempting to self-authorise (a defensive guard preserved from
     OPS-025 because it would otherwise leak through the fallback
     1-step chain that doesn't restrict supervisors). */
  async authorize(id: string, companyId: string, userId: string, dto: AuthorizeWorkPermitDto) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'PENDING_AUTHORIZATION') {
      throw new BadRequestException('El permiso no está pendiente de autorización.');
    }
    const teamMembers = (permit.workTeam ?? []) as unknown as Array<{ userId?: string }>;
    if (teamMembers.some((m) => m.userId === userId)) {
      throw new ForbiddenException('Un integrante del equipo de trabajo no puede autorizar.');
    }
    await this.approvalActions.approveStep(
      companyId,
      userId,
      id,
      'work-permit',
      { stepOrder: permit.currentApprovalStep, notes: dto.authorizationNotes },
      { ip: null, userAgent: null },
    );
    /* The engine sets authorizationNotes on the matching PermitApproval
       row, but legacy fields on WorkPermit (authorizationNotes column)
       used by OPS-025 still expect a value. Sync the latest approval
       notes back so the detail page shows the same string. */
    if (dto.authorizationNotes) {
      await this.rlsService.executeWithRls(companyId, userId, (tx) =>
        tx.workPermit.update({
          where: { id },
          data: { authorizationNotes: dto.authorizationNotes?.trim() ?? null },
        }),
      );
    }
    return this.findOne(id, companyId);
  }

  async reject(id: string, companyId: string, userId: string, dto: RejectWorkPermitDto) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'PENDING_AUTHORIZATION') {
      throw new BadRequestException('El permiso no está pendiente de autorización.');
    }
    await this.approvalActions.rejectStep(
      companyId,
      userId,
      id,
      'work-permit',
      { stepOrder: permit.currentApprovalStep, notes: dto.reason },
      { ip: null, userAgent: null },
    );
    return this.findOne(id, companyId);
  }

  async start(id: string, companyId: string, userId: string) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'AUTHORIZED') {
      throw new BadRequestException('Solo se puede iniciar un permiso AUTORIZADO.');
    }
    if (
      permit.supervisorId !== userId &&
      permit.requestedBy !== userId &&
      !(await this.isAdminOrManager(userId, companyId))
    ) {
      throw new ForbiddenException(
        'Solo el supervisor, solicitante o un administrador pueden iniciar el trabajo.',
      );
    }

    const now = new Date();
    if (now < permit.plannedStart) {
      const minutesEarly = Math.round((permit.plannedStart.getTime() - now.getTime()) / 60000);
      if (minutesEarly > 30) {
        throw new BadRequestException(
          `El trabajo está programado para iniciar en ${minutesEarly} minutos. Espera hasta esa hora.`,
        );
      }
    }
    if (now > permit.plannedEnd) {
      throw new BadRequestException(
        'La ventana planificada ya cerró. Reprograma el permiso o crea uno nuevo.',
      );
    }

    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({
        where: { id },
        data: {
          status: 'IN_EXECUTION',
          statusChangedAt: now,
          statusChangedBy: userId,
          actualStart: now,
        },
      }),
    );
    await this.notifyEvent(companyId, id, 'WORK_PERMIT_STARTED', {
      title: `Permiso iniciado: ${permit.permitNumber}`,
      message: `Se inició la ejecución de "${permit.title}".`,
      severity: 'INFO',
      audience: this.uniqueIds([permit.supervisorId, permit.requestedBy]),
    });
    return this.findOne(id, companyId);
  }

  async suspend(id: string, companyId: string, userId: string, dto: SuspendWorkPermitDto) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'IN_EXECUTION') {
      throw new BadRequestException('Solo se puede suspender un permiso EN EJECUCIÓN.');
    }
    if (permit.supervisorId !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo el supervisor o un administrador puede suspender.');
    }

    await this.transitionStatus(companyId, userId, id, 'SUSPENDED', dto.reason.trim());
    return this.findOne(id, companyId);
  }

  async resume(id: string, companyId: string, userId: string) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'SUSPENDED') {
      throw new BadRequestException('Solo se puede reanudar un permiso SUSPENDIDO.');
    }
    if (permit.supervisorId !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException('Solo el supervisor o un administrador puede reanudar.');
    }
    if (new Date() > permit.plannedEnd) {
      throw new BadRequestException(
        'La ventana planificada ya cerró. Cierra el permiso o crea uno nuevo.',
      );
    }
    await this.transitionStatus(companyId, userId, id, 'IN_EXECUTION', null);
    return this.findOne(id, companyId);
  }

  async close(id: string, companyId: string, userId: string, dto: CloseWorkPermitDto) {
    const permit = await this.findOne(id, companyId);
    if (permit.status !== 'IN_EXECUTION' && permit.status !== 'SUSPENDED') {
      throw new BadRequestException('Solo se puede cerrar un permiso EN EJECUCIÓN o SUSPENDIDO.');
    }
    if (permit.supervisorId !== userId && !(await this.isAdminOrManager(userId, companyId))) {
      throw new ForbiddenException(
        'Solo el supervisor o un administrador puede cerrar el permiso.',
      );
    }
    if (dto.incidentsReported && !dto.incidentDescription?.trim()) {
      throw new BadRequestException('Describe el incidente reportado.');
    }
    const now = new Date();
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({
        where: { id },
        data: {
          status: 'CLOSED',
          statusChangedAt: now,
          statusChangedBy: userId,
          actualEnd: now,
          closedBy: userId,
          closedAt: now,
          closureNotes: dto.closureNotes.trim(),
          incidentsReported: dto.incidentsReported,
          incidentDescription: dto.incidentsReported
            ? (dto.incidentDescription?.trim() ?? null)
            : null,
        },
      }),
    );
    await this.notifyEvent(companyId, id, 'WORK_PERMIT_CLOSED', {
      title: `Permiso cerrado: ${permit.permitNumber}`,
      message: dto.incidentsReported
        ? `Cerrado con incidentes reportados.`
        : 'Cerrado sin incidentes.',
      severity: dto.incidentsReported ? 'WARNING' : 'INFO',
      audience: this.uniqueIds([permit.supervisorId, permit.requestedBy]),
    });
    return this.findOne(id, companyId);
  }

  async cancel(id: string, companyId: string, userId: string, dto: CancelWorkPermitDto) {
    const permit = await this.findOne(id, companyId);
    if (
      !(['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED'] as WorkPermitStatus[]).includes(
        permit.status,
      )
    ) {
      throw new BadRequestException(
        'Solo se puede cancelar un permiso BORRADOR, PENDIENTE o AUTORIZADO.',
      );
    }
    if (
      permit.requestedBy !== userId &&
      permit.supervisorId !== userId &&
      !(await this.isAdminOrManager(userId, companyId))
    ) {
      throw new ForbiddenException('No tienes permisos para cancelar este permiso.');
    }
    await this.transitionStatus(companyId, userId, id, 'CANCELLED', dto.reason.trim());
    return this.findOne(id, companyId);
  }

  /* ---- Gas measurements ---------------------------------------- */

  async addGasMeasurement(id: string, companyId: string, userId: string, dto: GasMeasurementDto) {
    const permit = await this.findOne(id, companyId);
    if (permit.permitType.category !== ('CONFINED_SPACE' as WorkPermitCategory)) {
      throw new BadRequestException(
        'Las mediciones de gases sólo aplican a permisos de Espacio Confinado.',
      );
    }
    if (
      !(
        ['DRAFT', 'PENDING_AUTHORIZATION', 'AUTHORIZED', 'IN_EXECUTION'] as WorkPermitStatus[]
      ).includes(permit.status)
    ) {
      throw new BadRequestException(
        'No se pueden registrar mediciones en un permiso cerrado, cancelado o expirado.',
      );
    }
    const existing = (permit.gasMeasurements ?? []) as unknown as GasMeasurementRecord[];
    const measurement: GasMeasurementRecord = {
      id: randomUUID(),
      gas: dto.gas.trim(),
      value: dto.value,
      unit: dto.unit.trim(),
      measuredAt: new Date(dto.measuredAt).toISOString(),
      recordedBy: userId,
    };
    const next = [...existing, measurement];
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({
        where: { id },
        data: { gasMeasurements: next as unknown as Prisma.InputJsonValue },
      }),
    );
    return measurement;
  }

  /* ---- Attachments --------------------------------------------- */

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

    const permit = await this.findOne(id, companyId);
    const attachments = (permit.attachments ?? []) as unknown as AttachmentRecord[];
    if (attachments.length >= MAX_ATTACHMENTS) {
      throw new BadRequestException(`Máximo ${MAX_ATTACHMENTS} adjuntos por permiso.`);
    }

    const attachmentId = randomUUID();
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_');
    let filePath: string | null = null;
    let fileData: string | null = null;
    if (this.storage.isConfigured()) {
      const key = `operations/work-permits/${id}/${attachmentId}-${safeName}`;
      try {
        await this.storage.uploadFile(ATTACHMENTS_BUCKET, key, file.buffer, file.mimetype);
        filePath = key;
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to base64 blob.`,
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
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    };
    const next = [...attachments, record];
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({
        where: { id },
        data: { attachments: next as unknown as Prisma.InputJsonValue },
      }),
    );
    /* fileData is heavy and only needed on download; strip before
       returning so the client doesn't pay the round-trip cost. */
    return { ...record, fileData: undefined };
  }

  async getAttachment(id: string, companyId: string, attachmentIndex: number) {
    const permit = await this.findOne(id, companyId);
    const list = (permit.attachments ?? []) as unknown as AttachmentRecord[];
    const att = list[attachmentIndex];
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

  async deleteAttachment(id: string, companyId: string, userId: string, attachmentIndex: number) {
    const permit = await this.findOne(id, companyId);
    const list = [...((permit.attachments ?? []) as unknown as AttachmentRecord[])];
    if (attachmentIndex < 0 || attachmentIndex >= list.length) {
      throw new NotFoundException('Adjunto no encontrado.');
    }
    if (
      permit.requestedBy !== userId &&
      permit.supervisorId !== userId &&
      !(await this.isAdminOrManager(userId, companyId))
    ) {
      throw new ForbiddenException('No tienes permisos para eliminar adjuntos.');
    }
    list.splice(attachmentIndex, 1);
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({
        where: { id },
        data: { attachments: list as unknown as Prisma.InputJsonValue },
      }),
    );
    return { removed: attachmentIndex };
  }

  /* ---- Cron — auto-expire ------------------------------------- */

  /* Walks every company and flips AUTHORIZED/IN_EXECUTION rows whose
     plannedEnd is in the past to EXPIRED, so stale permits don't keep
     blocking dashboards or contributing to KPIs. The status engine
     elsewhere reads `status` directly, so re-running this job is
     cheap (no work for already-EXPIRED rows). */
  async processAllCompaniesExpired() {
    const now = new Date();
    const candidates = await this.prisma.workPermit.findMany({
      where: {
        status: { in: ['AUTHORIZED', 'IN_EXECUTION'] },
        actualEnd: null,
        plannedEnd: { lt: now },
      },
      select: {
        id: true,
        companyId: true,
        permitNumber: true,
        title: true,
        supervisorId: true,
        requestedBy: true,
      },
    });
    if (candidates.length === 0) return { expired: 0 };
    let expired = 0;
    for (const c of candidates) {
      try {
        await this.rlsService.executeWithRls(c.companyId, null, (tx) =>
          tx.workPermit.update({
            where: { id: c.id },
            data: {
              status: 'EXPIRED',
              statusChangedAt: now,
              statusReason: 'Vencimiento automático: la ventana planificada ya cerró.',
            },
          }),
        );
        await this.notifyEvent(c.companyId, c.id, 'WORK_PERMIT_EXPIRED', {
          title: `Permiso expirado: ${c.permitNumber}`,
          message: `"${c.title}" expiró sin cierre. Revisa estado y registra ejecución si corresponde.`,
          severity: 'WARNING',
          audience: this.uniqueIds([c.supervisorId, c.requestedBy]),
        });
        expired++;
      } catch (err) {
        this.logger.warn(
          `Failed to auto-expire work permit ${c.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { expired };
  }

  /* ---- Helpers -------------------------------------------------- */

  private listSelect() {
    return {
      id: true,
      permitNumber: true,
      title: true,
      description: true,
      workLocation: true,
      assetId: true,
      locationId: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      requestedBy: true,
      supervisorId: true,
      authorizedBy: true,
      authorizedAt: true,
      closedBy: true,
      closedAt: true,
      status: true,
      statusReason: true,
      incidentsReported: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      permitType: {
        select: {
          id: true,
          name: true,
          code: true,
          category: true,
          color: true,
          icon: true,
          maxDurationHours: true,
          requiresGasMeasurement: true,
          requiresIsolation: true,
        },
      },
      asset: { select: { id: true, code: true, name: true } },
      location: { select: { id: true, name: true, code: true } },
    } satisfies Prisma.WorkPermitSelect;
  }

  private startOfToday(): Date {
    const t = new Date();
    t.setUTCHours(0, 0, 0, 0);
    return t;
  }

  private uniqueIds(ids: Array<string | null | undefined>): string[] {
    const set = new Set<string>();
    for (const id of ids) {
      if (id) set.add(id);
    }
    return [...set];
  }

  private async transitionStatus(
    companyId: string,
    userId: string,
    id: string,
    next: WorkPermitStatus,
    reason: string | null,
  ) {
    const now = new Date();
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.workPermit.update({
        where: { id },
        data: {
          status: next,
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: userId,
        },
      }),
    );
  }

  private async nextPermitNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `PT-${year}-`;
    const last = await tx.workPermit.findFirst({
      where: { companyId, permitNumber: { startsWith: prefix } },
      orderBy: { permitNumber: 'desc' },
      select: { permitNumber: true },
    });
    const lastSeq = last ? Number.parseInt(last.permitNumber.split('-').pop() ?? '0', 10) || 0 : 0;
    const nextSeq = lastSeq + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  private async userRoleInCompany(userId: string, companyId: string): Promise<string | null> {
    const m = await this.prisma.membership.findFirst({
      where: { userId, companyId, isActive: true },
      select: { role: true },
    });
    return m?.role ?? null;
  }

  private async isAdminOrManager(userId: string, companyId: string): Promise<boolean> {
    const role = await this.userRoleInCompany(userId, companyId);
    return role !== null && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role);
  }

  /* ---- Notifications ------------------------------------------- */

  private async notifyAuthorizationRequired(
    companyId: string,
    permitId: string,
    requiredRoles: string[],
  ) {
    const roles = requiredRoles.length > 0 ? requiredRoles : ['MANAGER', 'ADMIN'];
    const memberships = await this.prisma.membership.findMany({
      where: {
        companyId,
        isActive: true,
        role: {
          in: roles.filter(
            (r): r is 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'ANALYST' | 'VIEWER' =>
              ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'VIEWER'].includes(r),
          ),
        },
      },
      select: { userId: true },
    });
    const userIds = [...new Set(memberships.map((m) => m.userId))];
    if (userIds.length === 0) return;
    const permit = await this.prisma.workPermit.findFirst({
      where: { id: permitId, companyId },
      select: { permitNumber: true, title: true },
    });
    if (!permit) return;
    await this.notifications.createGeneric(companyId, {
      userIds,
      sourceType: 'WORK_PERMIT_AUTHORIZATION',
      title: `Autorización requerida: ${permit.permitNumber}`,
      message: `${permit.title} requiere autorización para iniciar.`,
      severity: 'WARNING' as AlertSeverity,
      linkPath: `/operaciones/permisos/trabajo/${permitId}`,
      icon: 'ShieldAlert',
    });
  }

  private async notifyEvent(
    companyId: string,
    permitId: string,
    sourceType:
      | 'WORK_PERMIT_AUTHORIZED'
      | 'WORK_PERMIT_REJECTED'
      | 'WORK_PERMIT_STARTED'
      | 'WORK_PERMIT_CLOSED'
      | 'WORK_PERMIT_EXPIRED',
    args: { title: string; message: string; severity: AlertSeverity; audience: string[] },
  ) {
    if (args.audience.length === 0) return;
    await this.notifications.createGeneric(companyId, {
      userIds: args.audience,
      sourceType,
      title: args.title,
      message: args.message,
      severity: args.severity,
      linkPath: `/operaciones/permisos/trabajo/${permitId}`,
      icon: 'Wrench',
    });
  }
}
