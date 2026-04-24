import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PeriodStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto';
import { UpdatePeriodStatusDto } from './dto/update-period-status.dto';

const CHILEAN_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const VALID_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  OPEN: [PeriodStatus.IN_REVIEW],
  IN_REVIEW: [PeriodStatus.CLOSED],
  CLOSED: [PeriodStatus.OPEN],
};

@Injectable()
export class FiscalPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, year?: number, status?: PeriodStatus) {
    return this.prisma.fiscalPeriod.findMany({
      where: {
        companyId,
        ...(year ? { year } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id, companyId },
    });
    if (!period) throw new NotFoundException('Fiscal period not found');
    return period;
  }

  async findCurrent(companyId: string) {
    const now = new Date();
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        companyId,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      },
    });
    if (!period) throw new NotFoundException('No fiscal period found for current month');
    return period;
  }

  async create(companyId: string, userId: string, dto: CreateFiscalPeriodDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.fiscalPeriod.create({
        data: {
          companyId,
          name: dto.name,
          year: dto.year,
          month: dto.month,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
        },
      });
    });
  }

  async getPeriodsStatus(companyId: string, year: number) {
    const existingPeriods = await this.prisma.fiscalPeriod.findMany({
      where: { companyId, year },
      select: { month: true },
    });
    const existingMonths = new Set(existingPeriods.map((p) => p.month));
    const missing: number[] = [];
    for (let month = 1; month <= 12; month++) {
      if (!existingMonths.has(month)) missing.push(month);
    }
    return {
      total: 12,
      existing: existingPeriods.length,
      missing,
    };
  }

  async generatePeriods(companyId: string, userId: string, year: number) {
    const created: string[] = [];

    for (let month = 1; month <= 12; month++) {
      const existing = await this.prisma.fiscalPeriod.findFirst({
        where: { companyId, year, month },
      });
      if (existing) continue;

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // last day of month

      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        return tx.fiscalPeriod.create({
          data: {
            companyId,
            name: `${CHILEAN_MONTHS[month - 1]} ${year}`,
            year,
            month,
            startDate,
            endDate,
          },
        });
      });

      created.push(`${CHILEAN_MONTHS[month - 1]} ${year}`);
    }

    return { created: created.length, periods: created };
  }

  async updateStatus(id: string, companyId: string, userId: string, dto: UpdatePeriodStatusDto) {
    const period = await this.findOne(id, companyId);

    const allowed = VALID_TRANSITIONS[period.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${period.status} → ${dto.status}. ` +
          `Allowed: ${allowed.join(', ')}`,
      );
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.fiscalPeriod.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes ?? period.notes,
          ...(dto.status === PeriodStatus.CLOSED ? { closedAt: new Date(), closedBy: userId } : {}),
          ...(dto.status === PeriodStatus.OPEN ? { closedAt: null, closedBy: null } : {}),
        },
      });
    });
  }
}
