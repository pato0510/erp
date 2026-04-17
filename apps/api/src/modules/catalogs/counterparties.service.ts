import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { paginate } from '@erp/utils';
import { CreateCounterpartyDto } from './dto/create-counterparty.dto';
import { UpdateCounterpartyDto } from './dto/update-counterparty.dto';
import { FilterCounterpartyDto } from './dto/filter-counterparty.dto';

@Injectable()
export class CounterpartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  async findAll(companyId: string, filters: FilterCounterpartyDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CounterpartyWhereInput = {
      companyId,
      isActive: filters.isActive ?? true,
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { taxId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.counterparty.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.counterparty.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id, companyId },
    });
    if (!counterparty) throw new NotFoundException('Counterparty not found');
    return counterparty;
  }

  async create(companyId: string, userId: string, dto: CreateCounterpartyDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.counterparty.create({
        data: { ...dto, companyId },
      });
    });
  }

  async update(id: string, companyId: string, userId: string, dto: UpdateCounterpartyDto) {
    await this.findOne(id, companyId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.counterparty.update({
        where: { id },
        data: dto,
      });
    });
  }

  async deactivate(id: string, companyId: string, userId: string) {
    await this.findOne(id, companyId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.counterparty.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }

  async search(companyId: string, query: string) {
    return this.prisma.counterparty.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { taxId: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { name: 'asc' },
    });
  }
}
