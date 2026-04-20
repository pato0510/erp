import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { paginate } from '@erp/utils';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { FilterMovementDto } from './dto/filter-movement.dto';

const MOVEMENT_INCLUDES = {
  category: { select: { id: true, name: true, type: true, color: true } },
  counterparty: { select: { id: true, name: true, type: true } },
  costCenter: { select: { id: true, name: true, code: true } },
  fiscalPeriod: { select: { id: true, name: true, year: true, month: true } },
};

@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterMovementDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MovementWhereInput = { companyId };

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;
    if (filters.costCenterId) where.costCenterId = filters.costCenterId;
    if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
    }

    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.movement.findMany({
        where,
        include: MOVEMENT_INCLUDES,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.movement.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const movement = await this.prisma.movement.findFirst({
      where: { id, companyId },
      include: MOVEMENT_INCLUDES,
    });
    if (!movement) throw new NotFoundException('Movement not found');
    return movement;
  }

  async create(companyId: string, userId: string, dto: CreateMovementDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.movement.create({
        data: {
          companyId,
          fiscalPeriodId: dto.fiscalPeriodId,
          categoryId: dto.categoryId,
          counterpartyId: dto.counterpartyId,
          costCenterId: dto.costCenterId,
          type: dto.type,
          amount: dto.amount,
          currency: dto.currency || 'CLP',
          date: new Date(dto.date),
          description: dto.description,
          reference: dto.reference,
          notes: dto.notes,
          createdBy: userId,
        },
        include: MOVEMENT_INCLUDES,
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateMovementDto) {
    const movement = await this.findOne(id, companyId);

    if (movement.status !== MovementStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT movements can be edited');
    }
    await this.assertPeriodOpen(movement.fiscalPeriodId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.movement.update({
        where: { id },
        data: {
          ...dto,
          date: dto.date ? new Date(dto.date) : undefined,
          updatedBy: userId,
        },
        include: MOVEMENT_INCLUDES,
      });
    });
  }

  async confirm(id: string, companyId: string, userId: string) {
    const movement = await this.findOne(id, companyId);

    if (movement.status !== MovementStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT movements can be confirmed');
    }
    await this.assertPeriodOpen(movement.fiscalPeriodId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.movement.update({
        where: { id },
        data: {
          status: MovementStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedBy: userId,
          updatedBy: userId,
        },
        include: MOVEMENT_INCLUDES,
      });
    });
  }

  async cancel(id: string, companyId: string, userId: string, reason?: string) {
    const movement = await this.findOne(id, companyId);

    if (movement.status === MovementStatus.CANCELLED) {
      throw new BadRequestException('Movement is already cancelled');
    }
    if (movement.status === MovementStatus.RECONCILED) {
      throw new BadRequestException('Reconciled movements cannot be cancelled');
    }
    await this.assertPeriodOpen(movement.fiscalPeriodId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.movement.update({
        where: { id },
        data: {
          status: MovementStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: userId,
          updatedBy: userId,
          notes: reason ? `${movement.notes || ''}\nCancelled: ${reason}`.trim() : movement.notes,
        },
        include: MOVEMENT_INCLUDES,
      });
    });
  }

  async getSummary(companyId: string, fiscalPeriodId: string) {
    const [incomeResult, expenseResult] = await Promise.all([
      this.prisma.movement.aggregate({
        where: {
          companyId,
          fiscalPeriodId,
          type: 'INCOME',
          status: MovementStatus.CONFIRMED,
        },
        _sum: { amount: true },
      }),
      this.prisma.movement.aggregate({
        where: {
          companyId,
          fiscalPeriodId,
          type: 'EXPENSE',
          status: MovementStatus.CONFIRMED,
        },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome = Number(incomeResult._sum.amount || 0);
    const totalExpense = Number(expenseResult._sum.amount || 0);

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      fiscalPeriodId,
    };
  }

  private async assertPeriodOpen(fiscalPeriodId: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({
      where: { id: fiscalPeriodId },
      select: { status: true, name: true },
    });
    if (period?.status === 'CLOSED') {
      throw new BadRequestException(
        `El período "${period.name}" está cerrado y los movimientos están bloqueados. ` +
          'Reábrelo antes de modificar cualquier movimiento.',
      );
    }
  }
}
