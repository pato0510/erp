import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCampaignTaskDto } from './dto/create-campaign-task.dto';
import { UpdateCampaignTaskDto } from './dto/update-campaign-task.dto';

@Injectable()
export class CampaignTasksService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(task: {
    id: string;
    campaignId: string;
    title: string;
    type: string;
    dueDate: Date | null;
    done: boolean;
    ownerName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: task.id,
      campaignId: task.campaignId,
      title: task.title,
      type: task.type,
      dueDate: task.dueDate,
      done: task.done,
      ownerName: task.ownerName,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  /** Lists tasks; optionally scoped to one campaign (campaignId query param). */
  async findAll(companyId: string, campaignId?: string) {
    const where: Prisma.CampaignTaskWhereInput = { companyId };
    if (campaignId) where.campaignId = campaignId;

    const tasks = await this.prisma.campaignTask.findMany({
      where,
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    return tasks.map((t) => this.serialize(t));
  }

  async create(companyId: string, dto: CreateCampaignTaskDto) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id: dto.campaignId, companyId },
      select: { id: true },
    });
    if (!campaign)
      throw new BadRequestException('Campaña no encontrada para esta empresa.');

    const task = await this.prisma.campaignTask.create({
      data: {
        companyId,
        campaignId: dto.campaignId,
        title: dto.title,
        type: dto.type,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        done: dto.done ?? undefined,
        ownerName: dto.ownerName ?? null,
      },
    });
    return this.serialize(task);
  }

  async update(id: string, companyId: string, dto: UpdateCampaignTaskDto) {
    const existing = await this.prisma.campaignTask.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Tarea no encontrada');

    const task = await this.prisma.campaignTask.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        type: dto.type ?? undefined,
        dueDate:
          dto.dueDate === undefined
            ? undefined
            : dto.dueDate === null
              ? null
              : new Date(dto.dueDate),
        done: dto.done ?? undefined,
        ownerName: dto.ownerName ?? undefined,
      },
    });
    return this.serialize(task);
  }

  async remove(id: string, companyId: string) {
    const existing = await this.prisma.campaignTask.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Tarea no encontrada');
    await this.prisma.campaignTask.delete({ where: { id } });
    return { id, deleted: true };
  }
}
