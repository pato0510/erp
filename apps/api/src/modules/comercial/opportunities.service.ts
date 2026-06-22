import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

/**
 * CRM opportunities. counterpartyId (→ Finance Counterparty) and
 * sourceCampaignId (→ Marketing MarketingCampaign) are PLAIN columns with no
 * Prisma relations, so display names are resolved by manual lookups and
 * batch-mapped in findAll.
 *
 * SIMULATED FINANZAS COMMITMENT: moving an opportunity INTO a won stage sets
 * generatedCommitmentAmount = amount and generatedCommitmentDate =
 * expectedCloseDate ?? today. Moving OUT of a won stage clears both. NO real
 * Finance Commitment row is created and NO domain event is fired.
 */
@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private today(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private serialize(opp: {
    amount: Prisma.Decimal;
    generatedCommitmentAmount: Prisma.Decimal | null;
  }) {
    return {
      amount: Number(opp.amount),
      generatedCommitmentAmount:
        opp.generatedCommitmentAmount === null ? null : Number(opp.generatedCommitmentAmount),
    };
  }

  /** Validates the counterparty belongs to the company (read-only check). */
  private async assertCounterparty(companyId: string, counterpartyId: string) {
    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, companyId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException('Cliente (counterparty) no encontrado');
  }

  /** Validates the source campaign belongs to the company (read-only check). */
  private async assertCampaign(companyId: string, campaignId: string) {
    const c = await this.prisma.marketingCampaign.findFirst({
      where: { id: campaignId, companyId },
      select: { id: true },
    });
    if (!c) throw new BadRequestException('Campaña de origen no encontrada');
  }

  /** Validates the service belongs to the company (read-only check). */
  private async assertService(companyId: string, serviceId: string) {
    const s = await this.prisma.serviceCatalog.findFirst({
      where: { id: serviceId, companyId },
      select: { id: true },
    });
    if (!s) throw new BadRequestException('Servicio no encontrado');
  }

  async findAll(companyId: string) {
    const opps = await this.prisma.crmOpportunity.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { stage: { select: { name: true, isWon: true, order: true } } },
    });

    // Batch-resolve plain-column references (no relations) in three queries.
    const counterpartyIds = [...new Set(opps.map((o) => o.counterpartyId))];
    const campaignIds = [
      ...new Set(opps.map((o) => o.sourceCampaignId).filter((v): v is string => !!v)),
    ];
    const serviceIds = [
      ...new Set(opps.map((o) => o.serviceId).filter((v): v is string => !!v)),
    ];

    const [counterparties, campaigns, services] = await Promise.all([
      counterpartyIds.length
        ? this.prisma.counterparty.findMany({
            where: { companyId, id: { in: counterpartyIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      campaignIds.length
        ? this.prisma.marketingCampaign.findMany({
            where: { companyId, id: { in: campaignIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      serviceIds.length
        ? this.prisma.serviceCatalog.findMany({
            where: { companyId, id: { in: serviceIds } },
            select: { id: true, name: true, category: true },
          })
        : Promise.resolve([]),
    ]);

    const cpName = new Map(counterparties.map((c) => [c.id, c.name]));
    const campName = new Map(campaigns.map((c) => [c.id, c.name]));
    const svcName = new Map(services.map((s) => [s.id, s.name]));
    const svcCategory = new Map(services.map((s) => [s.id, s.category]));

    return opps.map((o) => ({
      id: o.id,
      title: o.title,
      counterpartyId: o.counterpartyId,
      clientName: cpName.get(o.counterpartyId) ?? null,
      ...this.serialize(o),
      probability: o.probability,
      expectedCloseDate: o.expectedCloseDate,
      ownerName: o.ownerName,
      stageId: o.stageId,
      stageName: o.stage.name,
      stageIsWon: o.stage.isWon,
      stageOrder: o.stage.order,
      sourceCampaignId: o.sourceCampaignId,
      sourceCampaignName: o.sourceCampaignId ? campName.get(o.sourceCampaignId) ?? null : null,
      serviceId: o.serviceId,
      serviceName: o.serviceId ? svcName.get(o.serviceId) ?? null : null,
      serviceCategory: o.serviceId ? svcCategory.get(o.serviceId) ?? null : null,
      needDetected: o.needDetected,
      serviceZone: o.serviceZone,
      requiresVisit: o.requiresVisit,
      requiresDrone: o.requiresDrone,
      requiresCertifiedStaff: o.requiresCertifiedStaff,
      lossReason: o.lossReason,
      convertedFromLeadId: o.convertedFromLeadId,
      tags: o.tags,
      generatedCommitmentDate: o.generatedCommitmentDate,
    }));
  }

  async findOne(id: string, companyId: string) {
    const o = await this.prisma.crmOpportunity.findFirst({
      where: { id, companyId },
      include: {
        stage: { select: { name: true, isWon: true, isLost: true, order: true } },
        activities: { orderBy: { date: 'desc' } },
      },
    });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');

    const [counterparty, campaign, service] = await Promise.all([
      this.prisma.counterparty.findFirst({
        where: { id: o.counterpartyId, companyId },
        select: { id: true, name: true, taxId: true, email: true, phone: true },
      }),
      o.sourceCampaignId
        ? this.prisma.marketingCampaign.findFirst({
            where: { id: o.sourceCampaignId, companyId },
            select: { id: true, name: true, channel: true },
          })
        : Promise.resolve(null),
      o.serviceId
        ? this.prisma.serviceCatalog.findFirst({
            where: { id: o.serviceId, companyId },
            select: { id: true, name: true, category: true, billingUnit: true, basePrice: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: o.id,
      title: o.title,
      counterpartyId: o.counterpartyId,
      clientName: counterparty?.name ?? null,
      client: counterparty,
      ...this.serialize(o),
      probability: o.probability,
      expectedCloseDate: o.expectedCloseDate,
      ownerName: o.ownerName,
      stageId: o.stageId,
      stageName: o.stage.name,
      stageIsWon: o.stage.isWon,
      stageIsLost: o.stage.isLost,
      stageOrder: o.stage.order,
      sourceCampaignId: o.sourceCampaignId,
      sourceCampaignName: campaign?.name ?? null,
      sourceCampaign: campaign,
      serviceId: o.serviceId,
      serviceName: service?.name ?? null,
      service: service
        ? {
            id: service.id,
            name: service.name,
            category: service.category,
            billingUnit: service.billingUnit,
            basePrice: Number(service.basePrice),
          }
        : null,
      needDetected: o.needDetected,
      serviceZone: o.serviceZone,
      requiresVisit: o.requiresVisit,
      requiresDrone: o.requiresDrone,
      requiresCertifiedStaff: o.requiresCertifiedStaff,
      lossReason: o.lossReason,
      convertedFromLeadId: o.convertedFromLeadId,
      tags: o.tags,
      generatedCommitmentDate: o.generatedCommitmentDate,
      activities: o.activities.map((a) => ({
        id: a.id,
        type: a.type,
        content: a.content,
        date: a.date,
        dueDate: a.dueDate,
        done: a.done,
        counterpartyId: a.counterpartyId,
        leadId: a.leadId,
      })),
    };
  }

  async create(companyId: string, dto: CreateOpportunityDto) {
    await this.assertCounterparty(companyId, dto.counterpartyId);
    if (dto.sourceCampaignId) await this.assertCampaign(companyId, dto.sourceCampaignId);
    if (dto.serviceId) await this.assertService(companyId, dto.serviceId);

    const stage = await this.prisma.crmStage.findFirst({
      where: { id: dto.stageId, companyId },
    });
    if (!stage) throw new BadRequestException('Etapa no encontrada');

    // If the opportunity is created directly in a won stage, set the simulated
    // commitment fields immediately.
    const isWon = stage.isWon;
    const expected = dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null;
    const amount = new Prisma.Decimal(dto.amount);

    const created = await this.prisma.crmOpportunity.create({
      data: {
        companyId,
        title: dto.title,
        counterpartyId: dto.counterpartyId,
        amount,
        probability: dto.probability,
        expectedCloseDate: expected,
        ownerName: dto.ownerName,
        stageId: dto.stageId,
        sourceCampaignId: dto.sourceCampaignId ?? null,
        serviceId: dto.serviceId ?? null,
        needDetected: dto.needDetected ?? null,
        serviceZone: dto.serviceZone ?? null,
        requiresVisit: dto.requiresVisit ?? false,
        requiresDrone: dto.requiresDrone ?? false,
        requiresCertifiedStaff: dto.requiresCertifiedStaff ?? false,
        lossReason: dto.lossReason ?? null,
        tags: dto.tags ?? [],
        generatedCommitmentAmount: isWon ? amount : null,
        generatedCommitmentDate: isWon ? expected ?? this.today() : null,
      },
    });
    return this.findOne(created.id, companyId);
  }

  async update(id: string, companyId: string, dto: UpdateOpportunityDto) {
    const existing = await this.prisma.crmOpportunity.findFirst({
      where: { id, companyId },
      include: { stage: { select: { isWon: true } } },
    });
    if (!existing) throw new NotFoundException('Oportunidad no encontrada');

    if (dto.counterpartyId) await this.assertCounterparty(companyId, dto.counterpartyId);
    if (dto.sourceCampaignId) await this.assertCampaign(companyId, dto.sourceCampaignId);
    if (dto.serviceId) await this.assertService(companyId, dto.serviceId);

    const newAmount = dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined;

    // If the opportunity sits in a won stage, keep the simulated commitment in
    // sync when amount / expectedCloseDate change.
    const commitmentPatch: Prisma.CrmOpportunityUpdateInput = {};
    if (existing.stage.isWon) {
      if (newAmount !== undefined) commitmentPatch.generatedCommitmentAmount = newAmount;
      if (dto.expectedCloseDate !== undefined) {
        commitmentPatch.generatedCommitmentDate = dto.expectedCloseDate
          ? new Date(dto.expectedCloseDate)
          : this.today();
      }
    }

    await this.prisma.crmOpportunity.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        counterpartyId: dto.counterpartyId ?? undefined,
        amount: newAmount,
        probability: dto.probability ?? undefined,
        expectedCloseDate:
          dto.expectedCloseDate !== undefined ? new Date(dto.expectedCloseDate) : undefined,
        ownerName: dto.ownerName ?? undefined,
        sourceCampaignId: dto.sourceCampaignId ?? undefined,
        serviceId: dto.serviceId ?? undefined,
        needDetected: dto.needDetected ?? undefined,
        serviceZone: dto.serviceZone ?? undefined,
        requiresVisit: dto.requiresVisit ?? undefined,
        requiresDrone: dto.requiresDrone ?? undefined,
        requiresCertifiedStaff: dto.requiresCertifiedStaff ?? undefined,
        lossReason: dto.lossReason ?? undefined,
        tags: dto.tags ?? undefined,
        ...commitmentPatch,
      },
    });
    return this.findOne(id, companyId);
  }

  /**
   * Moves the opportunity to a new stage and reconciles the SIMULATED Finanzas
   * commitment fields:
   *   • target stage isWon  → set generatedCommitmentAmount = amount,
   *     generatedCommitmentDate = expectedCloseDate ?? today.
   *   • leaving a won stage → clear both.
   */
  async moveStage(id: string, companyId: string, stageId: string) {
    const opp = await this.prisma.crmOpportunity.findFirst({
      where: { id, companyId },
      include: { stage: { select: { isWon: true } } },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');

    const target = await this.prisma.crmStage.findFirst({ where: { id: stageId, companyId } });
    if (!target) throw new BadRequestException('Etapa destino no encontrada');

    let generatedCommitmentAmount: Prisma.Decimal | null = opp.generatedCommitmentAmount;
    let generatedCommitmentDate: Date | null = opp.generatedCommitmentDate;

    if (target.isWon) {
      // Entering (or staying in) a won stage — set the simulated commitment.
      generatedCommitmentAmount = opp.amount;
      generatedCommitmentDate = opp.expectedCloseDate ?? this.today();
    } else if (opp.stage.isWon) {
      // Leaving a won stage — clear the simulated commitment.
      generatedCommitmentAmount = null;
      generatedCommitmentDate = null;
    }

    await this.prisma.crmOpportunity.update({
      where: { id },
      data: { stageId, generatedCommitmentAmount, generatedCommitmentDate },
    });
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.crmOpportunity.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Oportunidad no encontrada');
    // Activities linked to this opportunity keep their rows (opportunityId →
    // NULL via onDelete: SetNull).
    await this.prisma.crmOpportunity.delete({ where: { id } });
    return { id, deleted: true };
  }
}
