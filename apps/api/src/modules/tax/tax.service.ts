import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentDirection, DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SiiProviderFactory } from './providers/sii-provider.factory';
import { TaxDocumentResult } from './providers/sii-provider.interface';
import { paginate } from '@erp/utils';

const DEFAULT_PROVIDER = 'mock-sii';

const EMPTY_SUMMARY = {
  emitidos: { count: 0, netTotal: 0, taxTotal: 0, total: 0 },
  recibidos: { count: 0, netTotal: 0, taxTotal: 0, total: 0 },
  balance: 0,
  pendingReconciliation: 0,
  lastSync: { emitidos: null as Date | null, recibidos: null as Date | null },
};

export interface TaxFilterOptions {
  direction?: DocumentDirection;
  type?: DocumentType;
  fiscalPeriodId?: string;
  isReconciled?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class TaxService {
  private readonly logger = new Logger(TaxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: SiiProviderFactory,
  ) {}

  async syncDocuments(
    companyId: string,
    _userId: string,
    fiscalPeriodId: string,
    direction: DocumentDirection,
    providerName: string = DEFAULT_PROVIDER,
  ) {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id: fiscalPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Fiscal period not found');

    const provider = this.providerFactory.getProvider(providerName);

    const syncRun = await this.prisma.taxSyncRun.create({
      data: {
        companyId,
        fiscalPeriodId,
        provider: providerName,
        direction,
        status: 'RUNNING',
      },
    });

    try {
      const siiPeriod = { year: period.year, month: period.month };
      const documents =
        direction === 'EMITIDO'
          ? await provider.getEmitidos(null, siiPeriod)
          : await provider.getRecibidos(null, siiPeriod);

      let synced = 0;
      let skipped = 0;
      const errors: { folio: number; message: string }[] = [];

      for (const doc of documents) {
        try {
          const result = await this.upsertDocument(companyId, fiscalPeriodId, doc);
          if (result === 'created') synced++;
          else skipped++;
        } catch (err) {
          errors.push({
            folio: doc.folio,
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      await this.prisma.taxSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          documentsSynced: synced,
        },
      });

      return { synced, skipped, errors, syncRunId: syncRun.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.taxSyncRun.update({
        where: { id: syncRun.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      throw err;
    }
  }

  async syncAll(companyId: string, userId: string, fiscalPeriodId: string) {
    const emitidos = await this.syncDocuments(companyId, userId, fiscalPeriodId, 'EMITIDO');
    const recibidos = await this.syncDocuments(companyId, userId, fiscalPeriodId, 'RECIBIDO');
    return {
      emitidos,
      recibidos,
      totalSynced: emitidos.synced + recibidos.synced,
      totalSkipped: emitidos.skipped + recibidos.skipped,
    };
  }

  async findDocuments(companyId: string, filters: TaxFilterOptions) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.TaxDocumentWhereInput = { companyId };
    if (filters.direction) where.direction = filters.direction;
    if (filters.type) where.type = filters.type;
    if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
    if (filters.isReconciled !== undefined) where.isReconciled = filters.isReconciled;
    if (filters.dateFrom || filters.dateTo) {
      where.issueDate = {};
      if (filters.dateFrom) where.issueDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.issueDate.lte = new Date(filters.dateTo);
    }
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { issuerName: { contains: q, mode: 'insensitive' } },
        { receiverName: { contains: q, mode: 'insensitive' } },
        { issuerRut: { contains: q, mode: 'insensitive' } },
        { receiverRut: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.taxDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ issueDate: 'desc' }, { folio: 'desc' }],
      }),
      this.prisma.taxDocument.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async getDocument(id: string, companyId: string) {
    const doc = await this.prisma.taxDocument.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Tax document not found');
    return doc;
  }

  async getSummary(companyId: string, fiscalPeriodId?: string) {
    // If a specific period was requested, verify it belongs to this company.
    // A stale/invalid id shouldn't take down the dashboard — we degrade to the
    // company-wide summary instead.
    let effectivePeriodId = fiscalPeriodId;
    if (effectivePeriodId) {
      const period = await this.prisma.fiscalPeriod
        .findFirst({
          where: { id: effectivePeriodId, companyId },
          select: { id: true },
        })
        .catch(() => null);
      if (!period) {
        this.logger.warn(
          `getSummary: fiscalPeriodId ${effectivePeriodId} not found for company ${companyId}; returning company-wide summary`,
        );
        effectivePeriodId = undefined;
      }
    }

    const baseWhere: Prisma.TaxDocumentWhereInput = { companyId };
    if (effectivePeriodId) baseWhere.fiscalPeriodId = effectivePeriodId;

    try {
      const [emitidosAgg, recibidosAgg, pendingCount, lastEmitidoSync, lastRecibidoSync] =
        await Promise.all([
          this.prisma.taxDocument.aggregate({
            where: { ...baseWhere, direction: 'EMITIDO' },
            _count: true,
            _sum: { netAmount: true, taxAmount: true, totalAmount: true },
          }),
          this.prisma.taxDocument.aggregate({
            where: { ...baseWhere, direction: 'RECIBIDO' },
            _count: true,
            _sum: { netAmount: true, taxAmount: true, totalAmount: true },
          }),
          this.prisma.taxDocument.count({ where: { ...baseWhere, isReconciled: false } }),
          this.prisma.taxSyncRun.findFirst({
            where: { companyId, direction: 'EMITIDO', status: 'SUCCESS' },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          }),
          this.prisma.taxSyncRun.findFirst({
            where: { companyId, direction: 'RECIBIDO', status: 'SUCCESS' },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          }),
        ]);

      const emitidosTotal = Number(emitidosAgg._sum.totalAmount ?? 0);
      const recibidosTotal = Number(recibidosAgg._sum.totalAmount ?? 0);

      return {
        emitidos: {
          count: emitidosAgg._count ?? 0,
          netTotal: Number(emitidosAgg._sum.netAmount ?? 0),
          taxTotal: Number(emitidosAgg._sum.taxAmount ?? 0),
          total: emitidosTotal,
        },
        recibidos: {
          count: recibidosAgg._count ?? 0,
          netTotal: Number(recibidosAgg._sum.netAmount ?? 0),
          taxTotal: Number(recibidosAgg._sum.taxAmount ?? 0),
          total: recibidosTotal,
        },
        balance: emitidosTotal - recibidosTotal,
        pendingReconciliation: pendingCount,
        lastSync: {
          emitidos: lastEmitidoSync?.completedAt ?? null,
          recibidos: lastRecibidoSync?.completedAt ?? null,
        },
      };
    } catch (err) {
      this.logger.error(
        `getSummary failed for company ${companyId}: ${err instanceof Error ? err.message : err}`,
      );
      // Return a safe empty summary rather than crashing the caller (dashboard).
      return { ...EMPTY_SUMMARY };
    }
  }

  private async upsertDocument(
    companyId: string,
    fiscalPeriodId: string,
    doc: TaxDocumentResult,
  ): Promise<'created' | 'updated'> {
    // Unique on (companyId, type, folio, direction) gives us idempotency.
    const existing = await this.prisma.taxDocument.findUnique({
      where: {
        companyId_type_folio_direction: {
          companyId,
          type: doc.type,
          folio: doc.folio,
          direction: doc.direction,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return 'updated';
    }

    await this.prisma.taxDocument.create({
      data: {
        companyId,
        fiscalPeriodId,
        type: doc.type,
        direction: doc.direction,
        folio: doc.folio,
        issuerRut: doc.issuerRut,
        issuerName: doc.issuerName,
        receiverRut: doc.receiverRut,
        receiverName: doc.receiverName,
        issueDate: doc.issueDate,
        netAmount: doc.netAmount,
        taxAmount: doc.taxAmount,
        totalAmount: doc.totalAmount,
        status: doc.status,
        externalId: doc.externalId,
        metadata: (doc.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
    return 'created';
  }
}
