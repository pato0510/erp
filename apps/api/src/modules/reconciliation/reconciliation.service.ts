import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReconciliationStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReconciliationEngine } from './reconciliation.engine';
import { ManualMatchDto } from './dto/manual-match.dto';
import { paginate } from '@erp/utils';

interface FilterOptions {
  status?: ReconciliationStatus;
  fiscalPeriodId?: string;
  matchType?: string;
  page?: number;
  limit?: number;
}

const MATCH_INCLUDE = {
  externalMovement: {
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      type: true,
      bankConnectionId: true,
    },
  },
  taxDocument: {
    select: {
      id: true,
      folio: true,
      type: true,
      direction: true,
      issueDate: true,
      issuerName: true,
      receiverName: true,
      totalAmount: true,
    },
  },
  movement: {
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      type: true,
      status: true,
    },
  },
} as const;

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ReconciliationEngine,
  ) {}

  async runMatching(companyId: string, _userId: string, fiscalPeriodId?: string) {
    const summary = await this.engine.runFullMatching(companyId, fiscalPeriodId);
    return summary;
  }

  async getMatches(companyId: string, filters: FilterOptions) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ReconciliationMatchWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
    if (filters.matchType) where.matchType = filters.matchType;

    const [rows, total] = await Promise.all([
      this.prisma.reconciliationMatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { confidenceScore: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.reconciliationMatch.count({ where }),
    ]);

    const data = await this.hydrate(rows);
    return paginate(data, total, page, limit);
  }

  async getWorkbenchData(companyId: string, fiscalPeriodId?: string) {
    const periodFilter = fiscalPeriodId ? { fiscalPeriodId } : {};

    const [
      totalBankMovements,
      totalTaxDocuments,
      totalMovements,
      autoMatched,
      suggested,
      pending,
      confirmed,
      pendingBankMovements,
      pendingTaxDocuments,
      suggestionsRaw,
    ] = await Promise.all([
      this.prisma.externalBankMovement.count({ where: { companyId } }),
      this.prisma.taxDocument.count({ where: { companyId, ...periodFilter } }),
      this.prisma.movement.count({ where: { companyId, ...periodFilter } }),
      this.prisma.reconciliationMatch.count({
        where: { companyId, status: 'AUTO_MATCHED', ...periodFilter },
      }),
      this.prisma.reconciliationMatch.count({
        where: { companyId, status: 'SUGGESTED', ...periodFilter },
      }),
      this.prisma.externalBankMovement.count({
        where: { companyId, isReconciled: false },
      }),
      this.prisma.reconciliationMatch.count({
        where: { companyId, status: 'CONFIRMED', ...periodFilter },
      }),
      this.prisma.externalBankMovement.findMany({
        where: { companyId, isReconciled: false },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      this.prisma.taxDocument.findMany({
        where: { companyId, isReconciled: false, ...periodFilter },
        orderBy: { issueDate: 'desc' },
        take: 50,
      }),
      this.prisma.reconciliationMatch.findMany({
        where: { companyId, status: 'SUGGESTED', ...periodFilter },
        orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ]);

    const suggestions = await this.hydrate(suggestionsRaw);

    return {
      stats: {
        totalBankMovements,
        totalTaxDocuments,
        totalMovements,
        autoMatched,
        suggested,
        pending,
        confirmed,
      },
      pendingBankMovements,
      pendingTaxDocuments,
      suggestions,
    };
  }

  async getKpis(companyId: string, fiscalPeriodId?: string) {
    const periodFilter = fiscalPeriodId ? { fiscalPeriodId } : {};

    const [totalBank, reconciledBank, pending, suggestedCount, discrepancyAgg] = await Promise.all([
      this.prisma.externalBankMovement.count({ where: { companyId } }),
      this.prisma.externalBankMovement.count({
        where: { companyId, isReconciled: true },
      }),
      this.prisma.externalBankMovement.count({
        where: { companyId, isReconciled: false },
      }),
      this.prisma.reconciliationMatch.count({
        where: { companyId, status: 'SUGGESTED', ...periodFilter },
      }),
      this.prisma.reconciliationMatch.aggregate({
        where: {
          companyId,
          ...periodFilter,
          status: { in: ['SUGGESTED', 'AUTO_MATCHED', 'CONFIRMED', 'MANUAL'] },
        },
        _sum: { amountDifference: true },
      }),
    ]);

    const reconciledPercentage = totalBank > 0 ? Math.round((reconciledBank / totalBank) * 100) : 0;

    return {
      reconciledPercentage,
      pendingCount: pending,
      suggestedCount,
      totalDiscrepancyAmount: Number(discrepancyAgg._sum.amountDifference ?? 0),
      totalBankMovements: totalBank,
      reconciledBankMovements: reconciledBank,
    };
  }

  async confirmMatch(id: string, companyId: string, userId: string) {
    const match = await this.requireMatch(id, companyId);
    if (match.status === 'CONFIRMED') return match;

    await this.prisma.$transaction(async (tx) => {
      await tx.reconciliationMatch.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedBy: userId,
          confirmedAt: new Date(),
        },
      });

      if (match.externalMovementId) {
        await tx.externalBankMovement.update({
          where: { id: match.externalMovementId },
          data: { isReconciled: true },
        });
      }
      if (match.taxDocumentId) {
        await tx.taxDocument.update({
          where: { id: match.taxDocumentId },
          data: { isReconciled: true },
        });
      }
      if (match.movementId) {
        await tx.movement.update({
          where: { id: match.movementId },
          data: { status: 'RECONCILED' },
        });
      }
    });

    return this.hydrate([{ ...match, status: 'CONFIRMED' as ReconciliationStatus }]).then(
      (rows) => rows[0],
    );
  }

  async rejectMatch(id: string, companyId: string, userId: string, notes?: string) {
    const match = await this.requireMatch(id, companyId);
    if (match.status === 'REJECTED') return match;

    await this.prisma.$transaction(async (tx) => {
      await tx.reconciliationMatch.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedBy: userId,
          rejectedAt: new Date(),
          notes: notes ?? match.notes ?? null,
        },
      });

      // Only unmark reconciled flags if this match is the thing that set them.
      // Safest: if a prior AUTO_MATCHED is being rejected, revert flags.
      if (match.status === 'AUTO_MATCHED' || match.status === 'SUGGESTED') {
        if (match.externalMovementId) {
          await tx.externalBankMovement.update({
            where: { id: match.externalMovementId },
            data: { isReconciled: false },
          });
        }
        if (match.taxDocumentId) {
          await tx.taxDocument.update({
            where: { id: match.taxDocumentId },
            data: { isReconciled: false },
          });
        }
        if (match.movementId) {
          await tx.movement.update({
            where: { id: match.movementId },
            data: { status: 'CONFIRMED' },
          });
        }
      }
    });

    return this.hydrate([{ ...match, status: 'REJECTED' as ReconciliationStatus }]).then(
      (rows) => rows[0],
    );
  }

  async createManualMatch(companyId: string, userId: string, dto: ManualMatchDto) {
    const refs = [dto.externalMovementId, dto.taxDocumentId, dto.movementId].filter(Boolean);
    if (refs.length < 2) {
      throw new BadRequestException(
        'La conciliación manual requiere al menos dos referencias (bancaria, tributaria o movimiento)',
      );
    }

    // Validate every referenced entity belongs to this company.
    if (dto.externalMovementId) {
      const bank = await this.prisma.externalBankMovement.findFirst({
        where: { id: dto.externalMovementId, companyId },
      });
      if (!bank) throw new NotFoundException('Movimiento bancario no encontrado');
    }
    if (dto.taxDocumentId) {
      const doc = await this.prisma.taxDocument.findFirst({
        where: { id: dto.taxDocumentId, companyId },
      });
      if (!doc) throw new NotFoundException('Documento tributario no encontrado');
    }
    if (dto.movementId) {
      const mov = await this.prisma.movement.findFirst({
        where: { id: dto.movementId, companyId },
      });
      if (!mov) throw new NotFoundException('Movimiento no encontrado');
    }

    const fiscalPeriodId = await this.resolveFiscalPeriodForManual(companyId, dto);

    const created = await this.prisma.$transaction(async (tx) => {
      const match = await tx.reconciliationMatch.create({
        data: {
          companyId,
          fiscalPeriodId,
          status: 'MANUAL',
          confidenceScore: 1.0,
          matchType: 'manual',
          externalMovementId: dto.externalMovementId ?? null,
          taxDocumentId: dto.taxDocumentId ?? null,
          movementId: dto.movementId ?? null,
          notes: dto.notes ?? null,
          confirmedBy: userId,
          confirmedAt: new Date(),
        },
      });

      if (dto.externalMovementId) {
        await tx.externalBankMovement.update({
          where: { id: dto.externalMovementId },
          data: { isReconciled: true },
        });
      }
      if (dto.taxDocumentId) {
        await tx.taxDocument.update({
          where: { id: dto.taxDocumentId },
          data: { isReconciled: true },
        });
      }
      if (dto.movementId) {
        await tx.movement.update({
          where: { id: dto.movementId },
          data: { status: 'RECONCILED' },
        });
      }

      return match;
    });

    return this.hydrate([created]).then((rows) => rows[0]);
  }

  // ───────────────────────── helpers ─────────────────────────

  private async requireMatch(id: string, companyId: string) {
    const match = await this.prisma.reconciliationMatch.findFirst({
      where: { id, companyId },
    });
    if (!match) throw new NotFoundException('Match no encontrado');
    return match;
  }

  private async resolveFiscalPeriodForManual(
    companyId: string,
    dto: ManualMatchDto,
  ): Promise<string | null> {
    // Prefer the movement's fiscalPeriodId, then the tax document's.
    if (dto.movementId) {
      const mov = await this.prisma.movement.findUnique({
        where: { id: dto.movementId },
        select: { fiscalPeriodId: true, companyId: true },
      });
      if (mov && mov.companyId === companyId) return mov.fiscalPeriodId;
    }
    if (dto.taxDocumentId) {
      const doc = await this.prisma.taxDocument.findUnique({
        where: { id: dto.taxDocumentId },
        select: { fiscalPeriodId: true, companyId: true },
      });
      if (doc && doc.companyId === companyId) return doc.fiscalPeriodId;
    }
    return null;
  }

  private async hydrate<
    T extends {
      externalMovementId: string | null;
      taxDocumentId: string | null;
      movementId: string | null;
    },
  >(matches: T[]) {
    if (matches.length === 0) return [];

    const bankIds = matches.map((m) => m.externalMovementId).filter((x): x is string => !!x);
    const docIds = matches.map((m) => m.taxDocumentId).filter((x): x is string => !!x);
    const movIds = matches.map((m) => m.movementId).filter((x): x is string => !!x);

    const [banks, docs, movs] = await Promise.all([
      bankIds.length > 0
        ? this.prisma.externalBankMovement.findMany({
            where: { id: { in: bankIds } },
            select: MATCH_INCLUDE.externalMovement.select,
          })
        : Promise.resolve([]),
      docIds.length > 0
        ? this.prisma.taxDocument.findMany({
            where: { id: { in: docIds } },
            select: MATCH_INCLUDE.taxDocument.select,
          })
        : Promise.resolve([]),
      movIds.length > 0
        ? this.prisma.movement.findMany({
            where: { id: { in: movIds } },
            select: MATCH_INCLUDE.movement.select,
          })
        : Promise.resolve([]),
    ]);

    const bankMap = new Map(banks.map((b) => [b.id, b]));
    const docMap = new Map(docs.map((d) => [d.id, d]));
    const movMap = new Map(movs.map((m) => [m.id, m]));

    return matches.map((m) => ({
      ...m,
      externalMovement: m.externalMovementId ? (bankMap.get(m.externalMovementId) ?? null) : null,
      taxDocument: m.taxDocumentId ? (docMap.get(m.taxDocumentId) ?? null) : null,
      movement: m.movementId ? (movMap.get(m.movementId) ?? null) : null,
    }));
  }
}
