import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(a: {
    id: string;
    type: string;
    content: string;
    date: Date;
    dueDate: Date | null;
    done: boolean;
    counterpartyId: string | null;
    opportunityId: string | null;
    leadId: string | null;
  }) {
    return {
      id: a.id,
      type: a.type,
      content: a.content,
      date: a.date,
      dueDate: a.dueDate,
      done: a.done,
      counterpartyId: a.counterpartyId,
      opportunityId: a.opportunityId,
      leadId: a.leadId,
    };
  }

  /** Optional filters: opportunityId, counterpartyId and/or leadId. */
  async findAll(
    companyId: string,
    filters: { opportunityId?: string; counterpartyId?: string; leadId?: string },
  ) {
    const activities = await this.prisma.crmActivity.findMany({
      where: {
        companyId,
        ...(filters.opportunityId ? { opportunityId: filters.opportunityId } : {}),
        ...(filters.counterpartyId ? { counterpartyId: filters.counterpartyId } : {}),
        ...(filters.leadId ? { leadId: filters.leadId } : {}),
      },
      orderBy: { date: 'desc' },
    });
    return activities.map((a) => this.map(a));
  }

  async create(companyId: string, dto: CreateActivityDto) {
    if (dto.opportunityId) {
      const opp = await this.prisma.crmOpportunity.findFirst({
        where: { id: dto.opportunityId, companyId },
        select: { id: true },
      });
      if (!opp) throw new BadRequestException('Oportunidad no encontrada');
    }
    if (dto.counterpartyId) {
      const cp = await this.prisma.counterparty.findFirst({
        where: { id: dto.counterpartyId, companyId },
        select: { id: true },
      });
      if (!cp) throw new BadRequestException('Cliente (counterparty) no encontrado');
    }
    if (dto.leadId) {
      const lead = await this.prisma.crmLead.findFirst({
        where: { id: dto.leadId, companyId },
        select: { id: true },
      });
      if (!lead) throw new BadRequestException('Lead no encontrado');
    }

    const created = await this.prisma.crmActivity.create({
      data: {
        companyId,
        counterpartyId: dto.counterpartyId ?? null,
        opportunityId: dto.opportunityId ?? null,
        leadId: dto.leadId ?? null,
        type: dto.type,
        content: dto.content,
        date: new Date(dto.date),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        done: dto.done ?? false,
      },
    });
    return this.map(created);
  }

  async update(id: string, companyId: string, dto: UpdateActivityDto) {
    const existing = await this.prisma.crmActivity.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Actividad no encontrada');

    const updated = await this.prisma.crmActivity.update({
      where: { id },
      data: {
        type: dto.type ?? undefined,
        content: dto.content ?? undefined,
        date: dto.date ? new Date(dto.date) : undefined,
        dueDate: dto.dueDate !== undefined ? new Date(dto.dueDate) : undefined,
        done: dto.done ?? undefined,
      },
    });
    return this.map(updated);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.crmActivity.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Actividad no encontrada');
    await this.prisma.crmActivity.delete({ where: { id } });
    return { id, deleted: true };
  }
}
