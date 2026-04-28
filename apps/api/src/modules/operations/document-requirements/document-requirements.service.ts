import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateDocumentRequirementDto } from './dto/create-document-requirement.dto';
import { FilterDocumentRequirementsDto } from './dto/filter-document-requirements.dto';
import { UpdateDocumentRequirementDto } from './dto/update-document-requirement.dto';

type Specificity = 1 | 2 | 3;

@Injectable()
export class DocumentRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Validates that exactly one of assetTypeId / assetSubtypeId / assetId is
     set on the payload. The DB also enforces this via a CHECK constraint, but
     catching it at the app layer gives a friendlier error message. */
  private validateSingleTarget(payload: {
    assetTypeId?: string | null;
    assetSubtypeId?: string | null;
    assetId?: string | null;
  }) {
    const targets = [payload.assetTypeId, payload.assetSubtypeId, payload.assetId].filter(
      (t) => t !== undefined && t !== null && t !== '',
    );
    if (targets.length !== 1) {
      throw new BadRequestException(
        'Debe especificar exactamente uno de: assetTypeId, assetSubtypeId o assetId.',
      );
    }
  }

  async findAll(companyId: string, filters: FilterDocumentRequirementsDto) {
    const where: Prisma.DocumentRequirementWhereInput = { companyId };
    if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;
    if (filters.assetTypeId) where.assetTypeId = filters.assetTypeId;
    if (filters.assetSubtypeId) where.assetSubtypeId = filters.assetSubtypeId;
    if (filters.assetId) where.assetId = filters.assetId;

    return this.prisma.documentRequirement.findMany({
      where,
      include: { documentType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const req = await this.prisma.documentRequirement.findFirst({
      where: { id, companyId },
      include: { documentType: true },
    });
    if (!req) throw new NotFoundException('Document requirement not found');
    return req;
  }

  async create(companyId: string, userId: string, dto: CreateDocumentRequirementDto) {
    this.validateSingleTarget(dto);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.documentRequirement.create({
          data: {
            companyId,
            createdBy: userId,
            documentTypeId: dto.documentTypeId,
            assetTypeId: dto.assetTypeId ?? null,
            assetSubtypeId: dto.assetSubtypeId ?? null,
            assetId: dto.assetId ?? null,
            isMandatory: dto.isMandatory ?? true,
            notes: dto.notes,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException(
          'Referencia inválida: el tipo de documento o el activo destino no existe.',
        );
      }
      throw err;
    }
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateDocumentRequirementDto) {
    const existing = await this.findOne(id, companyId);

    /* If the payload touches any of the target fields, validate that the merged
       set still has exactly one target. Untouched fields default to current. */
    const touchesTarget =
      dto.assetTypeId !== undefined ||
      dto.assetSubtypeId !== undefined ||
      dto.assetId !== undefined;
    if (touchesTarget) {
      this.validateSingleTarget({
        assetTypeId: dto.assetTypeId ?? existing.assetTypeId ?? null,
        assetSubtypeId: dto.assetSubtypeId ?? existing.assetSubtypeId ?? null,
        assetId: dto.assetId ?? existing.assetId ?? null,
      });
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.documentRequirement.update({
        where: { id },
        data: dto,
      });
    });
  }

  async remove(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.documentRequirement.delete({ where: { id } });
    });
  }

  /* Matrix resolution engine. Returns the set of document requirements that
     apply to a given asset, with the most specific scope winning when the same
     `documentTypeId` appears at multiple levels:

       specificity:  asset(3) > subtype(2) > type(1)

     Used by the alerts engine and the asset detail UI to answer
     "what documents does this asset need?". */
  async resolveRequirementsForAsset(companyId: string, assetId: string) {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { id: true, assetTypeId: true, assetSubtypeId: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    const orClauses: Prisma.DocumentRequirementWhereInput[] = [
      { assetId: asset.id },
      { assetTypeId: asset.assetTypeId },
    ];
    if (asset.assetSubtypeId) {
      orClauses.push({ assetSubtypeId: asset.assetSubtypeId });
    }

    const candidates = await this.prisma.documentRequirement.findMany({
      where: {
        companyId,
        OR: orClauses,
      },
      include: { documentType: true },
    });

    const bestByDocType = new Map<
      string,
      { specificity: Specificity; req: (typeof candidates)[number] }
    >();

    for (const req of candidates) {
      const specificity: Specificity = req.assetId ? 3 : req.assetSubtypeId ? 2 : 1;
      const current = bestByDocType.get(req.documentTypeId);
      if (!current || specificity > current.specificity) {
        bestByDocType.set(req.documentTypeId, { specificity, req });
      }
    }

    return Array.from(bestByDocType.values()).map(({ req, specificity }) => ({
      ...req,
      resolvedFrom: specificity === 3 ? 'asset' : specificity === 2 ? 'subtype' : 'type',
    }));
  }
}
