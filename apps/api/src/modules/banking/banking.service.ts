import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { BankProviderFactory } from './providers/provider.factory';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { paginate } from '@erp/utils';

@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: BankProviderFactory,
  ) {}

  async createConnection(companyId: string, dto: CreateConnectionDto) {
    const provider = this.providerFactory.getProvider(dto.provider);
    const isValid = await provider.validateConnection(null);

    return this.prisma.bankConnection.create({
      data: {
        companyId,
        bankAccountId: dto.bankAccountId,
        provider: dto.provider,
        providerAccountId: dto.providerAccountId,
        status: isValid ? 'ACTIVE' : 'ERROR',
        lastErrorMessage: isValid ? null : 'Connection validation failed',
      },
      include: { bankAccount: { select: { name: true, type: true } } },
    });
  }

  async syncBalance(connectionId: string, companyId: string) {
    const conn = await this.getConnection(connectionId, companyId);
    const provider = this.providerFactory.getProvider(conn.provider);

    const syncRun = await this.prisma.bankSyncRun.create({
      data: {
        companyId,
        bankConnectionId: connectionId,
        provider: conn.provider,
        status: 'RUNNING',
      },
    });

    try {
      const result = await provider.getAccountBalance(conn.providerCredentials);

      // Find current period
      const now = new Date();
      const period = await this.prisma.fiscalPeriod.findFirst({
        where: { companyId, year: now.getFullYear(), month: now.getMonth() + 1 },
      });

      if (period) {
        await this.prisma.accountBalance.upsert({
          where: {
            bankAccountId_fiscalPeriodId: {
              bankAccountId: conn.bankAccountId,
              fiscalPeriodId: period.id,
            },
          },
          update: { openingBalance: result.balance },
          create: {
            companyId,
            bankAccountId: conn.bankAccountId,
            fiscalPeriodId: period.id,
            openingBalance: result.balance,
            setBy: companyId,
          },
        });
      }

      await this.prisma.bankSyncRun.update({
        where: { id: syncRun.id },
        data: { status: 'SUCCESS', completedAt: new Date(), balancesSynced: 1 },
      });

      await this.prisma.bankConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date(), status: 'ACTIVE', lastErrorMessage: null },
      });

      return { balance: result.balance, currency: result.currency, syncRunId: syncRun.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.bankSyncRun.update({
        where: { id: syncRun.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      await this.prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: 'ERROR', lastErrorMessage: message },
      });
      throw err;
    }
  }

  async syncMovements(connectionId: string, companyId: string, from: Date, to: Date) {
    const conn = await this.getConnection(connectionId, companyId);
    const provider = this.providerFactory.getProvider(conn.provider);

    const syncRun = await this.prisma.bankSyncRun.create({
      data: {
        companyId,
        bankConnectionId: connectionId,
        provider: conn.provider,
        status: 'RUNNING',
      },
    });

    try {
      const movements = await provider.getMovements(conn.providerCredentials, from, to);
      let synced = 0;
      let skipped = 0;

      for (const m of movements) {
        try {
          await this.prisma.externalBankMovement.upsert({
            where: {
              bankConnectionId_externalId: {
                bankConnectionId: connectionId,
                externalId: m.externalId,
              },
            },
            update: {},
            create: {
              companyId,
              bankConnectionId: connectionId,
              externalId: m.externalId,
              date: m.date,
              description: m.description,
              amount: m.amount,
              currency: m.currency,
              type: m.type,
              balance: m.balance,
              metadata: m.metadata as Prisma.InputJsonValue,
            },
          });
          synced++;
        } catch {
          skipped++;
        }
      }

      await this.prisma.bankSyncRun.update({
        where: { id: syncRun.id },
        data: { status: 'SUCCESS', completedAt: new Date(), movementsSynced: synced },
      });

      await this.prisma.bankConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date(), status: 'ACTIVE', lastErrorMessage: null },
      });

      return { synced, skipped, total: movements.length, syncRunId: syncRun.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.bankSyncRun.update({
        where: { id: syncRun.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      throw err;
    }
  }

  async getConnections(companyId: string) {
    return this.prisma.bankConnection.findMany({
      where: { companyId, isActive: true },
      include: { bankAccount: { select: { name: true, type: true, bankName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConnection(id: string, companyId: string) {
    const conn = await this.prisma.bankConnection.findFirst({ where: { id, companyId } });
    if (!conn) throw new NotFoundException('Bank connection not found');
    return conn;
  }

  async getSyncHistory(connectionId: string, companyId: string) {
    await this.getConnection(connectionId, companyId);
    return this.prisma.bankSyncRun.findMany({
      where: { bankConnectionId: connectionId, companyId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }

  async getExternalMovements(
    connectionId: string,
    companyId: string,
    filters: {
      page?: number;
      limit?: number;
      isReconciled?: boolean;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    await this.getConnection(connectionId, companyId);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ExternalBankMovementWhereInput = {
      bankConnectionId: connectionId,
      companyId,
    };
    if (filters.isReconciled !== undefined) where.isReconciled = filters.isReconciled;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.externalBankMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.externalBankMovement.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }
}
