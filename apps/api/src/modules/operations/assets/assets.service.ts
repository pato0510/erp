import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';
import { AssetBlockingService } from '../alerts/asset-blocking.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { FilterAssetsDto } from './dto/filter-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

const ASSETS_BUCKET = process.env.OPERATIONS_BUCKET || 'excelsia-documents';
const PHOTO_ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
    private readonly blockingService: AssetBlockingService,
  ) {}

  /* Validates that the related entities (assetType, assetSubtype, location,
     parent) belong to this company before linking them to a new/updated asset.
     Avoids leaking refs across tenants via crafted UUIDs. */
  private async validateRelations(
    companyId: string,
    refs: {
      assetTypeId?: string;
      assetSubtypeId?: string | null;
      locationId?: string | null;
      parentAssetId?: string | null;
    },
    excludeAssetId?: string,
  ) {
    if (refs.assetTypeId) {
      const t = await this.prisma.assetType.findFirst({
        where: { id: refs.assetTypeId, companyId },
        select: { id: true },
      });
      if (!t) throw new BadRequestException('El tipo de activo no existe en esta empresa.');
    }
    if (refs.assetSubtypeId) {
      const s = await this.prisma.assetSubtype.findFirst({
        where: { id: refs.assetSubtypeId, assetType: { companyId } },
        select: { id: true, assetTypeId: true },
      });
      if (!s) throw new BadRequestException('El subtipo no existe en esta empresa.');
      if (refs.assetTypeId && s.assetTypeId !== refs.assetTypeId) {
        throw new BadRequestException('El subtipo no corresponde al tipo seleccionado.');
      }
    }
    if (refs.locationId) {
      const l = await this.prisma.location.findFirst({
        where: { id: refs.locationId, companyId },
        select: { id: true },
      });
      if (!l) throw new BadRequestException('La ubicación no existe en esta empresa.');
    }
    if (refs.parentAssetId) {
      if (excludeAssetId && refs.parentAssetId === excludeAssetId) {
        throw new BadRequestException('Un activo no puede ser su propio padre.');
      }
      const p = await this.prisma.operationalAsset.findFirst({
        where: { id: refs.parentAssetId, companyId },
        select: { id: true },
      });
      if (!p) throw new BadRequestException('El activo padre no existe en esta empresa.');
    }
  }

  /* Selectable shape used by list/detail queries — explicitly excludes
     `photoData` (Bytes) so we never ship binary blobs in JSON responses.
     `hasPhoto` is computed from `photoMimeType` which is set whenever a
     photo exists regardless of storage backend. */
  private readonly assetSelect = {
    id: true,
    companyId: true,
    assetTypeId: true,
    assetSubtypeId: true,
    locationId: true,
    parentAssetId: true,
    code: true,
    name: true,
    description: true,
    serialNumber: true,
    manufacturer: true,
    model: true,
    acquisitionDate: true,
    acquisitionCost: true,
    status: true,
    statusReason: true,
    statusChangedAt: true,
    photoPath: true,
    photoMimeType: true,
    dynamicAttributes: true,
    tags: true,
    assignedToUserId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    /* OPS-035 — QR token + scan stats. The token itself is mostly
       used by the frontend to build the public URL and detect
       generation state; downloads happen through dedicated
       endpoints. */
    qrToken: true,
    qrGeneratedAt: true,
    qrLastScannedAt: true,
    qrScanCount: true,
  } satisfies Prisma.OperationalAssetSelect;

  private withHasPhoto<T extends { photoMimeType: string | null; photoPath: string | null }>(
    asset: T,
  ): T & { hasPhoto: boolean } {
    return { ...asset, hasPhoto: !!(asset.photoMimeType || asset.photoPath) };
  }

  async findAll(companyId: string, filters: FilterAssetsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.OperationalAssetWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };
    if (filters.assetTypeId) where.assetTypeId = filters.assetTypeId;
    if (filters.assetSubtypeId) where.assetSubtypeId = filters.assetSubtypeId;
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.status) where.status = filters.status;
    if (filters.parentAssetId) where.parentAssetId = filters.parentAssetId;
    if (filters.assignedToUserId) where.assignedToUserId = filters.assignedToUserId;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { serialNumber: { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.operationalAsset.findMany({
        where,
        select: {
          ...this.assetSelect,
          assetType: { select: { id: true, name: true, category: true, icon: true, color: true } },
          assetSubtype: { select: { id: true, name: true } },
          location: { select: { id: true, name: true, code: true } },
          parent: { select: { id: true, code: true, name: true } },
          _count: { select: { children: true } },
        },
        orderBy: [{ code: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.operationalAsset.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.withHasPhoto(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, companyId: string) {
    const row = await this.prisma.operationalAsset.findFirst({
      where: { id, companyId },
      select: {
        ...this.assetSelect,
        assetType: true,
        assetSubtype: true,
        location: true,
        parent: { select: { id: true, code: true, name: true, status: true } },
        children: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            isActive: true,
            photoPath: true,
            photoMimeType: true,
          },
          orderBy: { code: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Activo no encontrado');

    /* OperationalAsset stores assignedToUserId / createdBy as bare UUIDs (no
       Prisma relation), so we fetch the user records separately. Both lookups
       run in parallel; either may be null if the user was deleted. */
    const userIds = Array.from(
      new Set([row.assignedToUserId, row.createdBy].filter((v): v is string => !!v)),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const childrenWithPhoto = row.children.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      status: c.status,
      isActive: c.isActive,
      hasPhoto: !!(c.photoMimeType || c.photoPath),
    }));

    return {
      ...this.withHasPhoto(row),
      children: childrenWithPhoto,
      assignedUser: row.assignedToUserId ? (userById.get(row.assignedToUserId) ?? null) : null,
      createdByUser: userById.get(row.createdBy) ?? null,
    };
  }

  async create(companyId: string, userId: string, dto: CreateAssetDto) {
    await this.validateRelations(companyId, dto);

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const created = await tx.operationalAsset.create({
          data: {
            companyId,
            createdBy: userId,
            assetTypeId: dto.assetTypeId,
            assetSubtypeId: dto.assetSubtypeId ?? null,
            locationId: dto.locationId ?? null,
            parentAssetId: dto.parentAssetId ?? null,
            code: dto.code,
            name: dto.name,
            description: dto.description,
            serialNumber: dto.serialNumber,
            manufacturer: dto.manufacturer,
            model: dto.model,
            acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : null,
            acquisitionCost: dto.acquisitionCost ?? null,
            status: dto.status ?? 'OPERATIONAL',
            statusReason: dto.statusReason,
            statusChangedAt: dto.status ? new Date() : null,
            dynamicAttributes: (dto.dynamicAttributes as Prisma.InputJsonValue | undefined) ?? {},
            tags: dto.tags ?? [],
            assignedToUserId: dto.assignedToUserId ?? null,
          },
          select: this.assetSelect,
        });
        return this.withHasPhoto(created);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          `Ya existe un activo con el código "${dto.code}" en esta empresa.`,
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAssetDto) {
    const existing = await this.findOne(id, companyId);
    await this.validateRelations(
      companyId,
      {
        assetTypeId: dto.assetTypeId ?? existing.assetTypeId,
        assetSubtypeId: dto.assetSubtypeId,
        locationId: dto.locationId,
        parentAssetId: dto.parentAssetId,
      },
      id,
    );

    const statusChanged = dto.status && dto.status !== existing.status;
    const previousStatus = existing.status;

    try {
      let updated;
      try {
        updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
          const u = await tx.operationalAsset.update({
            where: { id },
            data: {
              ...(dto.assetTypeId !== undefined ? { assetTypeId: dto.assetTypeId } : {}),
              ...(dto.assetSubtypeId !== undefined
                ? { assetSubtypeId: dto.assetSubtypeId ?? null }
                : {}),
              ...(dto.locationId !== undefined ? { locationId: dto.locationId ?? null } : {}),
              ...(dto.parentAssetId !== undefined
                ? { parentAssetId: dto.parentAssetId ?? null }
                : {}),
              ...(dto.code !== undefined ? { code: dto.code } : {}),
              ...(dto.name !== undefined ? { name: dto.name } : {}),
              ...(dto.description !== undefined ? { description: dto.description } : {}),
              ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
              ...(dto.manufacturer !== undefined ? { manufacturer: dto.manufacturer } : {}),
              ...(dto.model !== undefined ? { model: dto.model } : {}),
              ...(dto.acquisitionDate !== undefined
                ? { acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : null }
                : {}),
              ...(dto.acquisitionCost !== undefined
                ? { acquisitionCost: dto.acquisitionCost ?? null }
                : {}),
              ...(dto.status !== undefined ? { status: dto.status } : {}),
              ...(dto.statusReason !== undefined ? { statusReason: dto.statusReason } : {}),
              ...(statusChanged ? { statusChangedAt: new Date() } : {}),
              ...(dto.dynamicAttributes !== undefined
                ? { dynamicAttributes: dto.dynamicAttributes as Prisma.InputJsonValue }
                : {}),
              ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
              ...(dto.assignedToUserId !== undefined
                ? { assignedToUserId: dto.assignedToUserId ?? null }
                : {}),
            },
            select: this.assetSelect,
          });
          return this.withHasPhoto(u);
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new BadRequestException('Ya existe un activo con ese código en esta empresa.');
        }
        throw err;
      }

      /* OPS-020 — record the manual transition AND, when the user
         tries to manually leave BLOCKED_DOCUMENTAL, immediately
         re-evaluate. If the gap is still there the asset gets flipped
         back; we surface a `reblocked: true` flag so the frontend can
         tell the user. */
      if (statusChanged && dto.status) {
        try {
          await this.blockingService.logManualChange(
            companyId,
            userId,
            id,
            previousStatus,
            dto.status,
            dto.statusReason ?? null,
          );
        } catch (err) {
          this.logger.warn(
            `Manual status change audit failed: ${err instanceof Error ? err.message : err}`,
          );
        }

        const leftBlock =
          previousStatus === 'BLOCKED_DOCUMENTAL' &&
          (dto.status === 'OPERATIONAL' || dto.status === 'WITH_OBSERVATIONS');
        if (leftBlock) {
          try {
            const result = await this.blockingService.processBlocking(companyId, id, userId);
            if (result.action === 'BLOCKED') {
              const refreshed = await this.findOne(id, companyId);
              return {
                ...refreshed,
                reblocked: true,
                reblockReason: result.reason,
              };
            }
          } catch (err) {
            this.logger.warn(
              `Re-block evaluation after manual unblock failed: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }
      }

      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Ya existe un activo con ese código en esta empresa.');
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);

    const childCount = await this.prisma.operationalAsset.count({
      where: { parentAssetId: id, companyId, isActive: true },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        'Este activo tiene activos hijos. Primero reasigna o elimina sus hijos.',
      );
    }

    /* Soft-delete by default — preserves audit history and downstream references
       (documents, permits, etc. — to be added in later tickets). */
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.operationalAsset.update({
        where: { id },
        data: { isActive: false },
        select: this.assetSelect,
      });
    });
  }

  async uploadPhoto(
    assetId: string,
    companyId: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo de imagen.');
    if (file.size > PHOTO_MAX_BYTES) {
      throw new BadRequestException('La imagen excede el límite de 2 MB.');
    }
    if (!PHOTO_ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException('Formato no permitido. Use JPG, PNG o WEBP.');
    }
    await this.findOne(assetId, companyId);

    const key = `operations/assets/${assetId}/photo`;

    /* Prefer MinIO/S3 when configured. On any storage failure, fall back to
       the DB blob (same pattern as SII certificate). */
    let storedPath: string | null = null;
    let storedData: Uint8Array<ArrayBuffer> | null = null;

    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(ASSETS_BUCKET, key, file.buffer, file.mimetype);
        storedPath = key;
      } catch (err) {
        this.logger.warn(
          `MinIO upload failed (${err instanceof Error ? err.message : err}); falling back to DB`,
        );
        storedData = Uint8Array.from(file.buffer);
      }
    } else {
      this.logger.warn('MinIO not available, storing asset photo in DB');
      storedData = Uint8Array.from(file.buffer);
    }

    await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.operationalAsset.update({
        where: { id: assetId },
        data: {
          photoPath: storedPath,
          photoData: storedData,
          photoMimeType: file.mimetype,
        },
      });
    });

    return { success: true, hasPhoto: true, mimeType: file.mimetype };
  }

  async deletePhoto(assetId: string, companyId: string, userId: string) {
    await this.findOne(assetId, companyId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.operationalAsset.update({
        where: { id: assetId },
        data: { photoPath: null, photoData: null, photoMimeType: null },
      });
      return { success: true };
    });
  }

  async getPhoto(
    assetId: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { photoPath: true, photoData: true, photoMimeType: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    if (!asset.photoMimeType && !asset.photoPath) {
      throw new NotFoundException('Este activo no tiene foto.');
    }
    const mimeType = asset.photoMimeType ?? 'application/octet-stream';

    /* DB fallback wins if both are populated — the bytes are immediately
       available, no network hop needed. */
    if (asset.photoData) {
      return { buffer: Buffer.from(asset.photoData), mimeType };
    }
    if (asset.photoPath) {
      const buffer = await this.storage.downloadFile(ASSETS_BUCKET, asset.photoPath);
      return { buffer, mimeType };
    }
    throw new NotFoundException('Foto no disponible.');
  }
}
