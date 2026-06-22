import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists campaigns with the commercial-brief fields + a small funnel summary
   * (seeded CampaignMetric.leadsGenerated / attributedRevenue when present).
   */
  async findAll(companyId: string) {
    const campaigns = await this.prisma.marketingCampaign.findMany({
      where: { companyId },
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { expenses: true } },
        metric: {
          select: { leadsGenerated: true, attributedRevenue: true },
        },
      },
    });
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      startDate: c.startDate,
      endDate: c.endDate,
      cost: Number(c.cost),
      status: c.status,
      objective: c.objective,
      serviceAssociated: c.serviceAssociated,
      targetSegment: c.targetSegment,
      zone: c.zone,
      ownerName: c.ownerName,
      ctaType: c.ctaType,
      kpiTarget: c.kpiTarget,
      expenseCount: c._count.expenses,
      metric: c.metric
        ? {
            leadsGenerated: c.metric.leadsGenerated,
            attributedRevenue: Number(c.metric.attributedRevenue),
          }
        : null,
    }));
  }

  /**
   * Campaign 360: the full campaign, its tasks, its funnel metric (seeded
   * fields PLUS live CRM counts), its calendar items and a READ-ONLY snapshot of
   * the CRM leads / opportunities that reference this campaign as their source.
   * The CRM reads never mutate Comercial.
   */
  async findOne(id: string, companyId: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, companyId },
      include: {
        metric: true,
        tasks: {
          orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
        },
        calendarItems: {
          orderBy: { date: 'asc' },
          include: { campaign: { select: { id: true, name: true } } },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada');

    // ── LIVE CRM reads (READ-ONLY) by sourceCampaignId ──
    const [leads, opportunities] = await Promise.all([
      this.prisma.crmLead.findMany({
        where: { companyId, sourceCampaignId: id },
        orderBy: { createdDate: 'desc' },
        select: {
          id: true,
          contactName: true,
          company: true,
          status: true,
          source: true,
        },
      }),
      this.prisma.crmOpportunity.findMany({
        where: { companyId, sourceCampaignId: id },
        orderBy: { amount: 'desc' },
        include: { stage: { select: { name: true, isWon: true } } },
      }),
    ]);

    const leadsLive = leads.length;
    const opportunitiesLive = opportunities.length;
    const attributedRevenueLive = opportunities
      .filter((o) => o.stage.isWon)
      .reduce((sum, o) => sum + Number(o.amount), 0);

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        cost: Number(campaign.cost),
        status: campaign.status,
        objective: campaign.objective,
        serviceAssociated: campaign.serviceAssociated,
        targetSegment: campaign.targetSegment,
        zone: campaign.zone,
        ownerName: campaign.ownerName,
        ctaType: campaign.ctaType,
        kpiTarget: campaign.kpiTarget,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      },
      tasks: campaign.tasks.map((t) => ({
        id: t.id,
        campaignId: t.campaignId,
        title: t.title,
        type: t.type,
        dueDate: t.dueDate,
        done: t.done,
        ownerName: t.ownerName,
      })),
      metric: {
        // Seeded / directional snapshot.
        leadsGenerated: campaign.metric?.leadsGenerated ?? 0,
        leadsQualified: campaign.metric?.leadsQualified ?? 0,
        meetingsBooked: campaign.metric?.meetingsBooked ?? 0,
        quotesIssued: campaign.metric?.quotesIssued ?? 0,
        opportunitiesCreated: campaign.metric?.opportunitiesCreated ?? 0,
        salesClosed: campaign.metric?.salesClosed ?? 0,
        costPerLead: Number(campaign.metric?.costPerLead ?? 0),
        attributedRevenue: Number(campaign.metric?.attributedRevenue ?? 0),
        // LIVE overlay read from Comercial (READ-ONLY).
        leadsLive,
        opportunitiesLive,
        attributedRevenueLive: Math.round(attributedRevenueLive),
      },
      calendarItems: campaign.calendarItems.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        date: i.date,
        endDate: i.endDate,
        channel: i.channel,
        status: i.status,
        ownerName: i.ownerName,
        serviceId: i.serviceId,
        serviceName: i.serviceName,
        targetSegment: i.targetSegment,
        zone: i.zone,
        campaignId: i.campaignId,
        campaignName: i.campaign?.name ?? null,
      })),
      crm: {
        leads: leads.map((l) => ({
          id: l.id,
          contactName: l.contactName,
          company: l.company,
          status: l.status,
          source: l.source,
        })),
        opportunities: opportunities.map((o) => ({
          id: o.id,
          title: o.title,
          amount: Number(o.amount),
          stageName: o.stage.name,
          stageIsWon: o.stage.isWon,
        })),
      },
    };
  }

  async create(companyId: string, dto: CreateCampaignDto) {
    return this.prisma.marketingCampaign.create({
      data: {
        companyId,
        name: dto.name,
        channel: dto.channel,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        cost: new Prisma.Decimal(dto.cost),
        status: dto.status ?? undefined,
        objective: dto.objective ?? null,
        serviceAssociated: dto.serviceAssociated ?? null,
        targetSegment: dto.targetSegment ?? null,
        zone: dto.zone ?? null,
        ownerName: dto.ownerName ?? null,
        ctaType: dto.ctaType ?? null,
        kpiTarget: dto.kpiTarget ?? null,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.marketingCampaign.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Campaña no encontrada');

    return this.prisma.marketingCampaign.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        channel: dto.channel ?? undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        cost: dto.cost !== undefined ? new Prisma.Decimal(dto.cost) : undefined,
        status: dto.status ?? undefined,
        objective: dto.objective ?? undefined,
        serviceAssociated: dto.serviceAssociated ?? undefined,
        targetSegment: dto.targetSegment ?? undefined,
        zone: dto.zone ?? undefined,
        ownerName: dto.ownerName ?? undefined,
        ctaType: dto.ctaType ?? undefined,
        kpiTarget: dto.kpiTarget ?? undefined,
      },
    });
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.marketingCampaign.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Campaña no encontrada');
    // Expenses linked to this campaign keep their rows (campaignId → NULL via
    // onDelete: SetNull). Tasks/metric cascade-delete; calendar items detach
    // (campaignId → NULL via onDelete: SetNull).
    await this.prisma.marketingCampaign.delete({ where: { id } });
    return { id, deleted: true };
  }
}
