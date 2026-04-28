import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import {
  VEHICLE_DEFAULT_DOCUMENT_CODES,
  type VehicleDefaultDocumentCode,
} from '../document-types/document-types.constants';
import { CreateAssetTypeDto } from './dto/create-asset-type.dto';
import { UpdateAssetTypeDto } from './dto/update-asset-type.dto';

export interface ApplyVehiclePackResult {
  created: VehicleDefaultDocumentCode[];
  skipped: VehicleDefaultDocumentCode[];
  missingDocumentTypes: VehicleDefaultDocumentCode[];
}

@Injectable()
export class AssetTypesService {
  private readonly logger = new Logger(AssetTypesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Annotates a single AssetType with `vehiclePackApplied` (true if all four
     required Chilean vehicle DocumentRequirements link to this type already).
     Always false for non-VEHICLE categories. */
  private async withVehiclePackStatus<T extends { id: string; category: string }>(
    companyId: string,
    type: T,
  ): Promise<T & { vehiclePackApplied: boolean }> {
    if (type.category !== 'VEHICLE') {
      return { ...type, vehiclePackApplied: false };
    }
    const linkedCount = await this.prisma.documentRequirement.count({
      where: {
        companyId,
        assetTypeId: type.id,
        documentType: { code: { in: VEHICLE_DEFAULT_DOCUMENT_CODES as unknown as string[] } },
      },
    });
    return { ...type, vehiclePackApplied: linkedCount >= VEHICLE_DEFAULT_DOCUMENT_CODES.length };
  }

  async findAll(companyId: string) {
    const rows = await this.prisma.assetType.findMany({
      where: { companyId, isActive: true },
      include: { subtypes: { where: { isActive: true }, orderBy: { name: 'asc' } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return Promise.all(rows.map((r) => this.withVehiclePackStatus(companyId, r)));
  }

  async findOne(id: string, companyId: string) {
    const t = await this.prisma.assetType.findFirst({
      where: { id, companyId },
      include: { subtypes: { orderBy: { name: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Tipo de activo no encontrado');
    return this.withVehiclePackStatus(companyId, t);
  }

  async create(companyId: string, userId: string, dto: CreateAssetTypeDto) {
    const { applyVehiclePack, ...createData } = dto;
    let created;
    try {
      created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetType.create({ data: { ...createData, companyId } });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de activo con ese nombre en esta empresa.',
        );
      }
      throw err;
    }

    /* Auto-apply the Chilean vehicle pack when category=VEHICLE unless the
       caller explicitly opted out (applyVehiclePack=false). Failures here are
       non-fatal: the type was created successfully, and the user can still
       trigger the pack manually from the configuration screen — we just log. */
    let vehiclePackResult: ApplyVehiclePackResult | null = null;
    if (created.category === 'VEHICLE' && applyVehiclePack !== false) {
      try {
        vehiclePackResult = await this.applyVehicleDefaultRequirements(
          companyId,
          created.id,
          userId,
        );
      } catch (err) {
        this.logger.warn(
          `Auto-apply vehicle pack failed for type ${created.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      ...(await this.withVehiclePackStatus(companyId, created)),
      vehiclePackResult,
    };
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateAssetTypeDto) {
    await this.findOne(id, companyId);
    /* applyVehiclePack is a create-time toggle only; ignore it on update. */
    const { applyVehiclePack: _ignored, ...updateData } = dto;
    void _ignored;
    try {
      const updated = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetType.update({ where: { id }, data: updateData });
      });
      return this.withVehiclePackStatus(companyId, updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un tipo de activo con ese nombre en esta empresa.',
        );
      }
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    const usage = await this.prisma.operationalAsset.count({
      where: { assetTypeId: id, companyId },
    });
    /* Soft-delete when in use to preserve referential context. Hard delete if
       no asset still points to it. */
    if (usage > 0) {
      return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.assetType.update({ where: { id }, data: { isActive: false } });
      });
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.assetType.delete({ where: { id } });
    });
  }

  /* Public entrypoint for the apply-vehicle-defaults endpoint — validates the
     target AssetType exists in the company and is VEHICLE-category before
     delegating to the helper. */
  async applyVehicleDefaultsByTypeId(
    companyId: string,
    assetTypeId: string,
    userId: string,
  ): Promise<ApplyVehiclePackResult> {
    const type = await this.prisma.assetType.findFirst({
      where: { id: assetTypeId, companyId },
      select: { id: true, category: true },
    });
    if (!type) throw new NotFoundException('Tipo de activo no encontrado');
    if (type.category !== 'VEHICLE') {
      throw new BadRequestException(
        'Solo los tipos de activo con categoría VEHICLE pueden recibir el pack documental.',
      );
    }
    return this.applyVehicleDefaultRequirements(companyId, assetTypeId, userId);
  }

  /* Idempotent: looks up each of the 4 Chilean vehicle document types and
     creates a DocumentRequirement linking it to the AssetType. Codes whose
     DocumentType doesn't exist yet are reported as "missing" so the UI can
     prompt the user to run seed-defaults. Existing requirements are skipped
     silently. */
  async applyVehicleDefaultRequirements(
    companyId: string,
    assetTypeId: string,
    userId: string,
  ): Promise<ApplyVehiclePackResult> {
    const created: VehicleDefaultDocumentCode[] = [];
    const skipped: VehicleDefaultDocumentCode[] = [];
    const missingDocumentTypes: VehicleDefaultDocumentCode[] = [];

    for (const code of VEHICLE_DEFAULT_DOCUMENT_CODES) {
      const docType = await this.prisma.operationalDocumentType.findFirst({
        where: { companyId, code },
        select: { id: true },
      });
      if (!docType) {
        this.logger.warn(`Tipo de documento ${code} no existe. Ejecuta seed-defaults primero.`);
        missingDocumentTypes.push(code);
        continue;
      }

      const existing = await this.prisma.documentRequirement.findFirst({
        where: {
          companyId,
          documentTypeId: docType.id,
          assetTypeId,
        },
        select: { id: true },
      });
      if (existing) {
        skipped.push(code);
        continue;
      }

      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        await tx.documentRequirement.create({
          data: {
            companyId,
            createdBy: userId,
            documentTypeId: docType.id,
            assetTypeId,
            assetSubtypeId: null,
            assetId: null,
            isMandatory: true,
            notes: 'Documento legal obligatorio para vehículos en Chile',
          },
        });
      });
      created.push(code);
    }

    return { created, skipped, missingDocumentTypes };
  }
}
