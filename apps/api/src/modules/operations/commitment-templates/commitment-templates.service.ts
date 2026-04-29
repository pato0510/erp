import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import {
  CreateCommitmentTemplateDto,
  FilterCommitmentTemplatesDto,
  UpdateCommitmentTemplateDto,
} from './dto/commitment-template.dto';

export interface CommitmentEstimate {
  amount: number;
  categoryId: string;
  description: string;
  daysBeforeExpiration: number;
  currency: string;
  /* Where the number came from. `template` is the canonical path;
     `history` is the fallback that averages the most recent paid
     movement metadata when no template exists. */
  source: 'template' | 'history';
}

const HISTORY_LOOKBACK_DAYS = 365;

/* OPS-033 — CRUD + estimation helpers for the cost-template
   library. Templates are the bridge between an Operations event
   ("the SOAP for asset AABB12 expires in 30 days") and a Finance
   commitment ("create a $50.000 PENDING expense due that day"). */
@Injectable()
export class CommitmentTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterCommitmentTemplatesDto = {}) {
    const where: Prisma.CommitmentTemplateWhereInput = { companyId };
    if (filters.scope === 'documents') where.documentTypeId = { not: null };
    if (filters.scope === 'permits') where.permitTypeId = { not: null };
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    return this.prisma.commitmentTemplate.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        category: { select: { id: true, name: true, type: true, color: true } },
      },
    });
  }

  async findOne(companyId: string, id: string) {
    const row = await this.prisma.commitmentTemplate.findFirst({
      where: { id, companyId },
      include: {
        category: { select: { id: true, name: true, type: true, color: true } },
      },
    });
    if (!row) throw new NotFoundException('Plantilla no encontrada.');
    return row;
  }

  async create(companyId: string, userId: string, dto: CreateCommitmentTemplateDto) {
    this.assertExactlyOneTarget(dto.documentTypeId, dto.permitTypeId);
    await this.assertReferences(companyId, dto.categoryId, dto.documentTypeId, dto.permitTypeId);
    const amount = this.parseAmount(dto.estimatedAmount);
    try {
      return await this.rlsService.executeWithRls(companyId, userId, (tx) =>
        tx.commitmentTemplate.create({
          data: {
            companyId,
            documentTypeId: dto.documentTypeId ?? null,
            permitTypeId: dto.permitTypeId ?? null,
            categoryId: dto.categoryId,
            description: dto.description.trim(),
            estimatedAmount: new Prisma.Decimal(amount),
            currency: (dto.currency ?? 'CLP').toUpperCase(),
            daysBeforeExpiration: dto.daysBeforeExpiration ?? 30,
            isActive: dto.isActive ?? true,
            createdBy: userId,
          },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe una plantilla activa para este tipo en la empresa.');
      }
      throw err;
    }
  }

  async update(companyId: string, userId: string, id: string, dto: UpdateCommitmentTemplateDto) {
    await this.findOne(companyId, id);
    if (dto.categoryId) {
      await this.assertReferences(companyId, dto.categoryId);
    }
    const data: Prisma.CommitmentTemplateUpdateInput = {};
    if (dto.categoryId) data.category = { connect: { id: dto.categoryId } };
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.estimatedAmount !== undefined) {
      data.estimatedAmount = new Prisma.Decimal(this.parseAmount(dto.estimatedAmount));
    }
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();
    if (dto.daysBeforeExpiration !== undefined) {
      data.daysBeforeExpiration = dto.daysBeforeExpiration;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.commitmentTemplate.update({ where: { id }, data }),
    );
  }

  async remove(companyId: string, userId: string, id: string) {
    await this.findOne(companyId, id);
    /* Hard delete is fine here — the auto-fulfillment hooks key off
       the source columns on Commitment, not the template id, so
       deleting a template doesn't orphan any cashflow rows. */
    return this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.commitmentTemplate.delete({ where: { id } }),
    );
  }

  /* Look up the cost estimate for a document renewal. The
     listener calls this once per event; we resolve in three steps:
     (1) active template → (2) inactive template (informational
     only) → (3) movement history fallback. Returns null when none
     yields a usable amount. */
  async estimateForDocument(
    companyId: string,
    documentTypeId: string,
  ): Promise<CommitmentEstimate | null> {
    const template = await this.prisma.commitmentTemplate.findFirst({
      where: { companyId, documentTypeId, isActive: true },
      include: { category: { select: { id: true, name: true } } },
    });
    if (template) {
      return this.toEstimate(template, 'template');
    }
    return this.estimateFromHistory(companyId, { documentTypeId });
  }

  async estimateForPermit(
    companyId: string,
    permitTypeId: string,
  ): Promise<CommitmentEstimate | null> {
    const template = await this.prisma.commitmentTemplate.findFirst({
      where: { companyId, permitTypeId, isActive: true },
      include: { category: { select: { id: true, name: true } } },
    });
    if (template) {
      return this.toEstimate(template, 'template');
    }
    return this.estimateFromHistory(companyId, { permitTypeId });
  }

  /* History fallback — averages the recent CONFIRMED expense
     movements whose metadata.documentTypeId / permitTypeId matches.
     We need a categoryId for the resulting commitment, so we keep
     the most-frequent category from the matched movements. Returns
     null when no matches. */
  private async estimateFromHistory(
    companyId: string,
    match: { documentTypeId?: string; permitTypeId?: string },
  ): Promise<CommitmentEstimate | null> {
    const sinceMs = Date.now() - HISTORY_LOOKBACK_DAYS * 86_400_000;
    const since = new Date(sinceMs);
    const key = match.documentTypeId ? 'documentTypeId' : 'permitTypeId';
    const matchValue = match.documentTypeId ?? match.permitTypeId;
    if (!matchValue) return null;
    const movements = await this.prisma.movement.findMany({
      where: {
        companyId,
        type: 'EXPENSE',
        status: 'CONFIRMED',
        date: { gte: since },
        metadata: { path: [key], equals: matchValue },
      },
      select: { amount: true, categoryId: true, description: true },
    });
    if (movements.length === 0) return null;
    const total = movements.reduce((s, m) => s + Number(m.amount), 0);
    const avg = Math.round(total / movements.length);
    /* Most-frequent categoryId — falls back to the first non-null. */
    const counts = new Map<string, number>();
    for (const m of movements) {
      if (!m.categoryId) continue;
      counts.set(m.categoryId, (counts.get(m.categoryId) ?? 0) + 1);
    }
    let categoryId: string | null = null;
    let best = 0;
    for (const [cat, n] of counts) {
      if (n > best) {
        best = n;
        categoryId = cat;
      }
    }
    if (!categoryId) return null;
    return {
      amount: avg,
      categoryId,
      description: 'Estimación basada en gastos previos',
      daysBeforeExpiration: 30,
      currency: 'CLP',
      source: 'history',
    };
  }

  private toEstimate(
    template: {
      categoryId: string;
      description: string;
      estimatedAmount: Prisma.Decimal;
      currency: string;
      daysBeforeExpiration: number;
    },
    source: 'template' | 'history',
  ): CommitmentEstimate {
    return {
      amount: Number(template.estimatedAmount),
      categoryId: template.categoryId,
      description: template.description,
      daysBeforeExpiration: template.daysBeforeExpiration,
      currency: template.currency,
      source,
    };
  }

  private assertExactlyOneTarget(documentTypeId?: string, permitTypeId?: string) {
    const set = [documentTypeId, permitTypeId].filter(Boolean).length;
    if (set !== 1) {
      throw new BadRequestException('Define exactamente uno: documentTypeId o permitTypeId.');
    }
  }

  private async assertReferences(
    companyId: string,
    categoryId: string,
    documentTypeId?: string,
    permitTypeId?: string,
  ) {
    const [category, docType, permitType] = await Promise.all([
      this.prisma.category.findFirst({
        where: { id: categoryId, companyId },
        select: { id: true, type: true },
      }),
      documentTypeId
        ? this.prisma.operationalDocumentType.findFirst({
            where: { id: documentTypeId, companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
      permitTypeId
        ? this.prisma.permitType.findFirst({
            where: { id: permitTypeId, companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!category) {
      throw new BadRequestException('La categoría financiera no existe en esta empresa.');
    }
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException(
        'La categoría debe ser de tipo EXPENSE — los compromisos de renovación son egresos.',
      );
    }
    if (documentTypeId && !docType) {
      throw new BadRequestException('El tipo de documento no existe en esta empresa.');
    }
    if (permitTypeId && !permitType) {
      throw new BadRequestException('El tipo de permiso no existe en esta empresa.');
    }
  }

  private parseAmount(input: number | string): number {
    const n = typeof input === 'number' ? input : Number(input);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('estimatedAmount debe ser un número positivo.');
    }
    return n;
  }
}
