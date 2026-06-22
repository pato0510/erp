import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarItemStatus, CalendarItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCalendarItemDto } from './dto/create-calendar-item.dto';
import { UpdateCalendarItemDto } from './dto/update-calendar-item.dto';
import { RescheduleCalendarItemDto } from './dto/reschedule-calendar-item.dto';

/** Filters accepted by GET /marketing/calendar-items. */
export interface CalendarItemFilters {
  type?: CalendarItemType;
  channel?: string;
  owner?: string;
  status?: CalendarItemStatus;
  serviceId?: string;
  from?: string;
  to?: string;
}

type CalendarItemWithCampaign = Prisma.CalendarItemGetPayload<{
  include: { campaign: { select: { id: true; name: true } } };
}>;

@Injectable()
export class CalendarItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Shapes a row → API response (flattened campaignId + campaignName). */
  private serialize(item: CalendarItemWithCampaign) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      date: item.date,
      endDate: item.endDate,
      channel: item.channel,
      status: item.status,
      ownerName: item.ownerName,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      targetSegment: item.targetSegment,
      zone: item.zone,
      campaignId: item.campaignId,
      campaignName: item.campaign?.name ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  async findAll(companyId: string, filters: CalendarItemFilters = {}) {
    const where: Prisma.CalendarItemWhereInput = { companyId };

    if (filters.type) where.type = filters.type;
    if (filters.channel) where.channel = filters.channel;
    if (filters.owner) where.ownerName = filters.owner;
    if (filters.status) where.status = filters.status;
    if (filters.serviceId) where.serviceId = filters.serviceId;

    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }

    const items = await this.prisma.calendarItem.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return items.map((i) => this.serialize(i));
  }

  async findOne(id: string, companyId: string) {
    const item = await this.prisma.calendarItem.findFirst({
      where: { id, companyId },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('Ítem de calendario no encontrado');
    return this.serialize(item);
  }

  /** Validates that a referenced campaign belongs to this company. */
  private async assertCampaign(campaignId: string, companyId: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id: campaignId, companyId },
      select: { id: true },
    });
    if (!campaign)
      throw new BadRequestException('Campaña no encontrada para esta empresa.');
  }

  async create(companyId: string, dto: CreateCalendarItemDto) {
    if (dto.campaignId) await this.assertCampaign(dto.campaignId, companyId);

    const item = await this.prisma.calendarItem.create({
      data: {
        companyId,
        type: dto.type,
        title: dto.title,
        date: new Date(dto.date),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        channel: dto.channel ?? null,
        status: dto.status ?? undefined,
        ownerName: dto.ownerName ?? null,
        serviceId: dto.serviceId ?? null,
        serviceName: dto.serviceName ?? null,
        targetSegment: dto.targetSegment ?? null,
        zone: dto.zone ?? null,
        campaignId: dto.campaignId ?? null,
      },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return this.serialize(item);
  }

  async update(id: string, companyId: string, dto: UpdateCalendarItemDto) {
    await this.findOne(id, companyId);
    if (dto.campaignId) await this.assertCampaign(dto.campaignId, companyId);

    const item = await this.prisma.calendarItem.update({
      where: { id },
      data: {
        type: dto.type ?? undefined,
        title: dto.title ?? undefined,
        date: dto.date ? new Date(dto.date) : undefined,
        // null clears the endDate; undefined leaves it untouched.
        endDate:
          dto.endDate === undefined
            ? undefined
            : dto.endDate === null
              ? null
              : new Date(dto.endDate),
        channel: dto.channel ?? undefined,
        status: dto.status ?? undefined,
        ownerName: dto.ownerName ?? undefined,
        serviceId: dto.serviceId ?? undefined,
        serviceName: dto.serviceName ?? undefined,
        targetSegment: dto.targetSegment ?? undefined,
        zone: dto.zone ?? undefined,
        // null detaches from a campaign; undefined leaves it untouched.
        campaignId: dto.campaignId === undefined ? undefined : dto.campaignId,
      },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return this.serialize(item);
  }

  /** Drag-and-drop reschedule: sets a new date (+ optional endDate). */
  async reschedule(
    id: string,
    companyId: string,
    dto: RescheduleCalendarItemDto,
  ) {
    await this.findOne(id, companyId);
    const item = await this.prisma.calendarItem.update({
      where: { id },
      data: {
        date: new Date(dto.date),
        endDate:
          dto.endDate === undefined
            ? undefined
            : dto.endDate === null
              ? null
              : new Date(dto.endDate),
      },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return this.serialize(item);
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.calendarItem.delete({ where: { id } });
    return { id, deleted: true };
  }
}
