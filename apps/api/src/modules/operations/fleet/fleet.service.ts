import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { FilterVehiclesDto } from './dto/filter-vehicles.dto';
import { UpdateKilometersDto } from './dto/update-kilometers.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Slim selector for list responses — keeps row payloads small. */
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
    assetType: { select: { id: true, name: true, category: true, icon: true, color: true } },
    assetSubtype: { select: { id: true, name: true } },
    location: { select: { id: true, name: true, code: true } },
    parent: { select: { id: true, code: true, name: true } },
  } satisfies Prisma.OperationalAssetSelect;

  /* Detail selector — includes the relations the vehicle 360 view needs
     (location address/coords, subtype specifications, parent status). User
     summaries (assigned/createdBy) are fetched separately because the
     OperationalAsset model stores them as bare UUIDs without Prisma relations. */
  private readonly assetDetailSelect = {
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
    assetType: {
      select: {
        id: true,
        name: true,
        category: true,
        icon: true,
        color: true,
        description: true,
        isActive: true,
      },
    },
    assetSubtype: {
      select: { id: true, name: true, specifications: true, isActive: true },
    },
    location: {
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    },
    parent: { select: { id: true, code: true, name: true, status: true } },
  } satisfies Prisma.OperationalAssetSelect;

  /* Validates that the AssetType, subtype, location and parent all live in the
     caller's company (prevents cross-tenant link via crafted UUID), and that the
     selected AssetType has category=VEHICLE — vehicles must extend a vehicle-
     category asset type, not a generic equipment type. */
  private async validateRelationsForVehicle(
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
        select: { id: true, category: true },
      });
      if (!t) throw new BadRequestException('El tipo de activo no existe en esta empresa.');
      if (t.category !== 'VEHICLE') {
        throw new BadRequestException(
          'El tipo de activo seleccionado no es un vehículo. Categoría requerida: VEHICLE',
        );
      }
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

  /* Reject duplicate licensePlate within the same company. Comparison is
     case-insensitive — the DTO normalizes plates to uppercase but legacy rows
     might still use mixed case. */
  private async assertPlateUnique(
    companyId: string,
    licensePlate: string,
    excludeVehicleId?: string,
  ) {
    const normalized = licensePlate.trim().toUpperCase();
    const existing = await this.prisma.vehicle.findFirst({
      where: {
        licensePlate: { equals: normalized, mode: 'insensitive' },
        asset: { companyId },
        ...(excludeVehicleId ? { id: { not: excludeVehicleId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un vehículo con la patente "${normalized}" en esta empresa.`,
      );
    }
  }

  private withHasPhoto<
    T extends { asset: { photoMimeType: string | null; photoPath: string | null } },
  >(row: T): T & { hasPhoto: boolean } {
    return {
      ...row,
      hasPhoto: !!(row.asset.photoMimeType || row.asset.photoPath),
    };
  }

  async findAll(companyId: string, filters: FilterVehiclesDto) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const assetWhere: Prisma.OperationalAssetWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };
    if (filters.assetTypeId) assetWhere.assetTypeId = filters.assetTypeId;
    if (filters.locationId) assetWhere.locationId = filters.locationId;
    if (filters.status) assetWhere.status = filters.status;

    const where: Prisma.VehicleWhereInput = {
      asset: assetWhere,
    };
    if (filters.fuelType) where.fuelType = filters.fuelType;
    if (filters.yearFrom != null || filters.yearTo != null) {
      where.year = {};
      if (filters.yearFrom != null) where.year.gte = filters.yearFrom;
      if (filters.yearTo != null) where.year.lte = filters.yearTo;
    }
    if (filters.search?.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { licensePlate: { contains: s, mode: 'insensitive' } },
        { vin: { contains: s, mode: 'insensitive' } },
        { asset: { ...assetWhere, code: { contains: s, mode: 'insensitive' } } },
        { asset: { ...assetWhere, name: { contains: s, mode: 'insensitive' } } },
        { asset: { ...assetWhere, model: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        select: {
          id: true,
          assetId: true,
          licensePlate: true,
          vin: true,
          year: true,
          currentKilometers: true,
          lastKmUpdate: true,
          fuelType: true,
          registrationDate: true,
          color: true,
          createdAt: true,
          updatedAt: true,
          asset: { select: this.assetSelect },
        },
        orderBy: { licensePlate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.withHasPhoto(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /* Resolves a vehicle by either its own id OR its asset.id — the controller
     accepts both since the URL the frontend has on hand might be either.
     Uses the rich detail selector and attaches assignedUser/createdByUser the
     same way AssetsService.findOne does. */
  async findOne(id: string, companyId: string) {
    const row = await this.prisma.vehicle.findFirst({
      where: {
        OR: [{ id }, { assetId: id }],
        asset: { companyId },
      },
      select: {
        id: true,
        assetId: true,
        licensePlate: true,
        vin: true,
        year: true,
        currentKilometers: true,
        lastKmUpdate: true,
        fuelType: true,
        registrationDate: true,
        color: true,
        createdAt: true,
        updatedAt: true,
        asset: { select: this.assetDetailSelect },
      },
    });
    if (!row) throw new NotFoundException('Vehículo no encontrado');

    const userIds = Array.from(
      new Set([row.asset.assignedToUserId, row.asset.createdBy].filter((v): v is string => !!v)),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      ...this.withHasPhoto(row),
      asset: {
        ...row.asset,
        assignedUser: row.asset.assignedToUserId
          ? (userById.get(row.asset.assignedToUserId) ?? null)
          : null,
        createdByUser: userById.get(row.asset.createdBy) ?? null,
      },
    };
  }

  async create(companyId: string, userId: string, dto: CreateVehicleDto) {
    await this.validateRelationsForVehicle(companyId, dto);
    await this.assertPlateUnique(companyId, dto.licensePlate);

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        const asset = await tx.operationalAsset.create({
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
        });

        const vehicle = await tx.vehicle.create({
          data: {
            assetId: asset.id,
            licensePlate: dto.licensePlate.toUpperCase(),
            vin: dto.vin ?? null,
            year: dto.year ?? null,
            currentKilometers: dto.currentKilometers ?? 0,
            lastKmUpdate: dto.currentKilometers != null ? new Date() : null,
            fuelType: dto.fuelType,
            registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null,
            color: dto.color ?? null,
          },
          select: {
            id: true,
            assetId: true,
            licensePlate: true,
            vin: true,
            year: true,
            currentKilometers: true,
            lastKmUpdate: true,
            fuelType: true,
            registrationDate: true,
            color: true,
            createdAt: true,
            updatedAt: true,
            asset: { select: this.assetSelect },
          },
        });

        return this.withHasPhoto(vehicle);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          `Ya existe un activo con el código "${dto.code}" o la patente "${dto.licensePlate}" en esta empresa.`,
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateVehicleDto) {
    const existing = await this.findOne(id, companyId);

    await this.validateRelationsForVehicle(
      companyId,
      {
        assetTypeId: dto.assetTypeId ?? existing.asset.assetTypeId,
        assetSubtypeId: dto.assetSubtypeId,
        locationId: dto.locationId,
        parentAssetId: dto.parentAssetId,
      },
      existing.assetId,
    );

    if (dto.licensePlate && dto.licensePlate.toUpperCase() !== existing.licensePlate) {
      await this.assertPlateUnique(companyId, dto.licensePlate, existing.id);
    }

    const statusChanged = dto.status && dto.status !== existing.asset.status;

    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        await tx.operationalAsset.update({
          where: { id: existing.assetId },
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
        });

        /* Track whether we need to bump lastKmUpdate. We only refresh it when
           the kilometers actually change — editing other fields shouldn't reset
           the reading timestamp. */
        const kmChanged =
          dto.currentKilometers != null && dto.currentKilometers !== existing.currentKilometers;

        const vehicle = await tx.vehicle.update({
          where: { id: existing.id },
          data: {
            ...(dto.licensePlate !== undefined
              ? { licensePlate: dto.licensePlate.toUpperCase() }
              : {}),
            ...(dto.vin !== undefined ? { vin: dto.vin ?? null } : {}),
            ...(dto.year !== undefined ? { year: dto.year ?? null } : {}),
            ...(dto.currentKilometers !== undefined
              ? { currentKilometers: dto.currentKilometers }
              : {}),
            ...(kmChanged ? { lastKmUpdate: new Date() } : {}),
            ...(dto.fuelType !== undefined ? { fuelType: dto.fuelType } : {}),
            ...(dto.registrationDate !== undefined
              ? {
                  registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null,
                }
              : {}),
            ...(dto.color !== undefined ? { color: dto.color ?? null } : {}),
          },
          select: {
            id: true,
            assetId: true,
            licensePlate: true,
            vin: true,
            year: true,
            currentKilometers: true,
            lastKmUpdate: true,
            fuelType: true,
            registrationDate: true,
            color: true,
            createdAt: true,
            updatedAt: true,
            asset: { select: this.assetSelect },
          },
        });

        return this.withHasPhoto(vehicle);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un vehículo con ese código o patente en esta empresa.',
        );
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    const existing = await this.findOne(id, companyId);

    /* Same blocking rules as assets: refuse to soft-delete when there are
       active children depending on this vehicle as parent. */
    const childCount = await this.prisma.operationalAsset.count({
      where: { parentAssetId: existing.assetId, companyId, isActive: true },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        'Este vehículo tiene activos hijos. Primero reasigna o elimina sus hijos.',
      );
    }

    /* Soft-delete the underlying asset. The Vehicle row stays — the
       onDelete:Cascade on Vehicle.asset only fires on hard delete. Marking
       the asset inactive is enough to hide the vehicle from listings. */
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.operationalAsset.update({
        where: { id: existing.assetId },
        data: { isActive: false },
      });
      return { success: true, id: existing.id, assetId: existing.assetId };
    });
  }

  async updateKilometers(id: string, companyId: string, userId: string, dto: UpdateKilometersDto) {
    const existing = await this.findOne(id, companyId);

    if (dto.kilometers < existing.currentKilometers && !dto.allowDecrease) {
      throw new BadRequestException(
        `El kilometraje no puede disminuir (actual: ${existing.currentKilometers} km).`,
      );
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const vehicle = await tx.vehicle.update({
        where: { id: existing.id },
        data: {
          currentKilometers: dto.kilometers,
          lastKmUpdate: new Date(),
        },
        select: {
          id: true,
          assetId: true,
          licensePlate: true,
          vin: true,
          year: true,
          currentKilometers: true,
          lastKmUpdate: true,
          fuelType: true,
          registrationDate: true,
          color: true,
          createdAt: true,
          updatedAt: true,
          asset: { select: this.assetSelect },
        },
      });
      return this.withHasPhoto(vehicle);
    });
  }
}
