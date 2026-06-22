import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CrmLeadPriority, CrmLeadSource, CrmLeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

/**
 * CRM Leads (top of funnel). sourceCampaignId references a Marketing
 * MarketingCampaign by id (plain column — no FK), resolved by manual lookup and
 * batch-mapped in findAll. Converting a qualified lead creates a CrmOpportunity
 * (carrying sourceCampaignId + serviceId + convertedFromLeadId) and flips the
 * lead status to CONVERTIDO.
 */
@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private today(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async assertCampaign(companyId: string, campaignId: string) {
    const c = await this.prisma.marketingCampaign.findFirst({
      where: { id: campaignId, companyId },
      select: { id: true },
    });
    if (!c) throw new BadRequestException('Campaña de origen no encontrada');
  }

  private serialize(l: {
    id: string;
    contactName: string;
    company: string;
    position: string | null;
    phone: string | null;
    email: string | null;
    serviceInterest: string | null;
    source: CrmLeadSource;
    sourceCampaignId: string | null;
    status: CrmLeadStatus;
    ownerName: string;
    priority: CrmLeadPriority;
    discardReason: string | null;
    createdDate: Date;
    nextAction: string | null;
  }) {
    return {
      id: l.id,
      contactName: l.contactName,
      company: l.company,
      position: l.position,
      phone: l.phone,
      email: l.email,
      serviceInterest: l.serviceInterest,
      source: l.source,
      sourceCampaignId: l.sourceCampaignId,
      status: l.status,
      ownerName: l.ownerName,
      priority: l.priority,
      discardReason: l.discardReason,
      createdDate: l.createdDate,
      nextAction: l.nextAction,
    };
  }

  /** List leads with optional status / source / priority / owner filters. */
  async findAll(
    companyId: string,
    filters: { status?: CrmLeadStatus; source?: CrmLeadSource; priority?: CrmLeadPriority; owner?: string },
  ) {
    const leads = await this.prisma.crmLead.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.owner ? { ownerName: filters.owner } : {}),
      },
      orderBy: [{ createdDate: 'desc' }, { createdAt: 'desc' }],
    });

    const campaignIds = [
      ...new Set(leads.map((l) => l.sourceCampaignId).filter((v): v is string => !!v)),
    ];
    const campaigns = campaignIds.length
      ? await this.prisma.marketingCampaign.findMany({
          where: { companyId, id: { in: campaignIds } },
          select: { id: true, name: true },
        })
      : [];
    const campName = new Map(campaigns.map((c) => [c.id, c.name]));

    return leads.map((l) => ({
      ...this.serialize(l),
      sourceCampaignName: l.sourceCampaignId ? campName.get(l.sourceCampaignId) ?? null : null,
    }));
  }

  async findOne(id: string, companyId: string) {
    const lead = await this.prisma.crmLead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Lead no encontrado');

    const [campaign, activities] = await Promise.all([
      lead.sourceCampaignId
        ? this.prisma.marketingCampaign.findFirst({
            where: { id: lead.sourceCampaignId, companyId },
            select: { id: true, name: true, channel: true },
          })
        : Promise.resolve(null),
      this.prisma.crmActivity.findMany({
        where: { companyId, leadId: id },
        orderBy: { date: 'desc' },
      }),
    ]);

    return {
      ...this.serialize(lead),
      sourceCampaignName: campaign?.name ?? null,
      sourceCampaign: campaign,
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        content: a.content,
        date: a.date,
        dueDate: a.dueDate,
        done: a.done,
      })),
    };
  }

  async create(companyId: string, dto: CreateLeadDto) {
    if (dto.sourceCampaignId) await this.assertCampaign(companyId, dto.sourceCampaignId);

    const created = await this.prisma.crmLead.create({
      data: {
        companyId,
        contactName: dto.contactName,
        company: dto.company,
        position: dto.position ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        serviceInterest: dto.serviceInterest ?? null,
        source: dto.source,
        sourceCampaignId: dto.sourceCampaignId ?? null,
        status: dto.status ?? 'NUEVO',
        ownerName: dto.ownerName,
        priority: dto.priority ?? 'MEDIA',
        discardReason: dto.discardReason ?? null,
        createdDate: dto.createdDate ? new Date(dto.createdDate) : this.today(),
        nextAction: dto.nextAction ?? null,
      },
    });
    return this.findOne(created.id, companyId);
  }

  async update(id: string, companyId: string, dto: UpdateLeadDto) {
    const existing = await this.prisma.crmLead.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Lead no encontrado');
    if (dto.sourceCampaignId) await this.assertCampaign(companyId, dto.sourceCampaignId);

    await this.prisma.crmLead.update({
      where: { id },
      data: {
        contactName: dto.contactName ?? undefined,
        company: dto.company ?? undefined,
        position: dto.position ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ?? undefined,
        serviceInterest: dto.serviceInterest ?? undefined,
        source: dto.source ?? undefined,
        sourceCampaignId: dto.sourceCampaignId ?? undefined,
        status: dto.status ?? undefined,
        ownerName: dto.ownerName ?? undefined,
        priority: dto.priority ?? undefined,
        discardReason: dto.discardReason ?? undefined,
        createdDate: dto.createdDate ? new Date(dto.createdDate) : undefined,
        nextAction: dto.nextAction ?? undefined,
      },
    });
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.crmLead.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Lead no encontrado');
    await this.prisma.crmLead.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Converts a qualified lead into a CrmOpportunity. The opportunity title comes
   * from the lead's serviceInterest / company; stageId defaults to the first
   * stage by order; ownerName falls back to the lead's owner; sourceCampaignId is
   * carried over and convertedFromLeadId is stamped. The lead is set to
   * CONVERTIDO. Returns the new opportunity (full findOne-shaped row).
   */
  async convert(id: string, companyId: string, dto: ConvertLeadDto) {
    const lead = await this.prisma.crmLead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    if (lead.status === 'CONVERTIDO') {
      throw new BadRequestException('El lead ya fue convertido');
    }

    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, companyId },
      select: { id: true },
    });
    if (!counterparty) throw new BadRequestException('Cliente (counterparty) no encontrado');

    if (dto.serviceId) {
      const service = await this.prisma.serviceCatalog.findFirst({
        where: { id: dto.serviceId, companyId },
        select: { id: true },
      });
      if (!service) throw new BadRequestException('Servicio no encontrado');
    }

    // Stage: explicit, else the first stage by order.
    let stageId = dto.stageId;
    if (stageId) {
      const stage = await this.prisma.crmStage.findFirst({ where: { id: stageId, companyId } });
      if (!stage) throw new BadRequestException('Etapa no encontrada');
    } else {
      const firstStage = await this.prisma.crmStage.findFirst({
        where: { companyId },
        orderBy: { order: 'asc' },
      });
      if (!firstStage) throw new BadRequestException('No hay etapas configuradas en el pipeline');
      stageId = firstStage.id;
    }

    const title =
      lead.serviceInterest && lead.serviceInterest.trim().length > 0
        ? `${lead.serviceInterest} — ${lead.company}`
        : `Oportunidad — ${lead.company}`;

    const amount = new Prisma.Decimal(dto.amount ?? 0);

    const opp = await this.prisma.crmOpportunity.create({
      data: {
        companyId,
        title,
        counterpartyId: dto.counterpartyId,
        amount,
        probability: 10,
        ownerName: dto.ownerName ?? lead.ownerName,
        stageId,
        sourceCampaignId: lead.sourceCampaignId,
        serviceId: dto.serviceId ?? null,
        convertedFromLeadId: lead.id,
        tags: [],
      },
    });

    await this.prisma.crmLead.update({
      where: { id: lead.id },
      data: { status: 'CONVERTIDO' },
    });

    // Return the new opportunity in the OpportunitiesService.findOne shape.
    return this.findOpportunity(opp.id, companyId);
  }

  /** Lightweight opportunity read used by convert() (avoids a circular service dep). */
  private async findOpportunity(oppId: string, companyId: string) {
    const o = await this.prisma.crmOpportunity.findFirst({
      where: { id: oppId, companyId },
      include: { stage: { select: { name: true, isWon: true, isLost: true, order: true } } },
    });
    if (!o) throw new NotFoundException('Oportunidad no encontrada');

    const [counterparty, service] = await Promise.all([
      this.prisma.counterparty.findFirst({
        where: { id: o.counterpartyId, companyId },
        select: { id: true, name: true },
      }),
      o.serviceId
        ? this.prisma.serviceCatalog.findFirst({
            where: { id: o.serviceId, companyId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: o.id,
      title: o.title,
      counterpartyId: o.counterpartyId,
      clientName: counterparty?.name ?? null,
      amount: Number(o.amount),
      probability: o.probability,
      expectedCloseDate: o.expectedCloseDate,
      ownerName: o.ownerName,
      stageId: o.stageId,
      stageName: o.stage.name,
      stageIsWon: o.stage.isWon,
      stageIsLost: o.stage.isLost,
      stageOrder: o.stage.order,
      sourceCampaignId: o.sourceCampaignId,
      serviceId: o.serviceId,
      serviceName: service?.name ?? null,
      convertedFromLeadId: o.convertedFromLeadId,
      tags: o.tags,
    };
  }
}
