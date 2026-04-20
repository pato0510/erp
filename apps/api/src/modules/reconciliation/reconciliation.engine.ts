import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentDirection,
  ExternalBankMovement,
  Movement,
  Prisma,
  TaxDocument,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

const AMOUNT_TOLERANCE = 1; // ±$1 for exact matching (rounding)
const EXACT_BANK_MOVEMENT_DAYS = 3;
const EXACT_BANK_TAX_DAYS = 5;
const EXACT_TAX_MOVEMENT_DAYS = 5;
const FUZZY_DAYS = 10;
const FUZZY_MAX_DIFF_PCT = 0.05;

type MatchType = 'exact_amount' | 'amount_with_tax' | 'fuzzy_date_amount' | 'manual';

interface EngineSummary {
  exactMatches: number;
  suggestions: number;
  unmatchedBank: number;
  unmatchedTax: number;
  unmatchedMovement: number;
}

@Injectable()
export class ReconciliationEngine {
  private readonly logger = new Logger(ReconciliationEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  async runFullMatching(companyId: string, fiscalPeriodId?: string): Promise<EngineSummary> {
    const exact = await this.runExactMatching(companyId, fiscalPeriodId);
    const heuristic = await this.runHeuristicMatching(companyId, fiscalPeriodId);

    // Unmatched counts after running both passes.
    const [unmatchedBank, unmatchedTax, unmatchedMovement] = await Promise.all([
      this.prisma.externalBankMovement.count({
        where: { companyId, isReconciled: false },
      }),
      this.prisma.taxDocument.count({
        where: {
          companyId,
          isReconciled: false,
          ...(fiscalPeriodId ? { fiscalPeriodId } : {}),
        },
      }),
      this.prisma.movement.count({
        where: {
          companyId,
          status: { in: ['DRAFT', 'CONFIRMED'] },
          ...(fiscalPeriodId ? { fiscalPeriodId } : {}),
          // "reconciled" movements have status RECONCILED
        },
      }),
    ]);

    return {
      exactMatches: exact,
      suggestions: heuristic,
      unmatchedBank,
      unmatchedTax,
      unmatchedMovement,
    };
  }

  async runExactMatching(companyId: string, fiscalPeriodId?: string): Promise<number> {
    let created = 0;

    // Load candidates up front — matching is O(n*m) but datasets are small
    // per period and this keeps the algorithm readable.
    const [bankMovements, movements, taxDocs] = await Promise.all([
      this.prisma.externalBankMovement.findMany({
        where: { companyId, isReconciled: false },
      }),
      this.prisma.movement.findMany({
        where: {
          companyId,
          status: { in: ['DRAFT', 'CONFIRMED'] },
          ...(fiscalPeriodId ? { fiscalPeriodId } : {}),
        },
      }),
      this.prisma.taxDocument.findMany({
        where: {
          companyId,
          isReconciled: false,
          ...(fiscalPeriodId ? { fiscalPeriodId } : {}),
        },
      }),
    ]);

    const usedMovementIds = new Set<string>();
    const usedTaxDocIds = new Set<string>();

    // Rule 1 — Bank ↔ Movement (amount ±$1, date ±3 days)
    for (const bank of bankMovements) {
      const match = this.findMovementMatch(bank, movements, usedMovementIds);
      if (!match) continue;

      await this.createMatch({
        companyId,
        fiscalPeriodId: match.fiscalPeriodId,
        status: 'AUTO_MATCHED',
        confidenceScore: 1.0,
        matchType: 'exact_amount',
        externalMovementId: bank.id,
        movementId: match.id,
        amountDifference: this.absDiff(bank.amount, match.amount),
      });

      await this.markReconciled({ bankId: bank.id, movementId: match.id });
      usedMovementIds.add(match.id);
      bank.isReconciled = true;
      created++;
    }

    // Rule 2 — Bank ↔ TaxDocument (total or net+tax match, date ±5 days)
    for (const bank of bankMovements) {
      if (bank.isReconciled) continue;
      const match = this.findTaxDocMatchForBank(bank, taxDocs, usedTaxDocIds);
      if (!match) continue;

      await this.createMatch({
        companyId,
        fiscalPeriodId: match.document.fiscalPeriodId ?? fiscalPeriodId ?? null,
        status: 'AUTO_MATCHED',
        confidenceScore: 0.95,
        matchType: match.matchType,
        externalMovementId: bank.id,
        taxDocumentId: match.document.id,
        amountDifference: match.difference,
      });

      await this.markReconciled({ bankId: bank.id, taxDocId: match.document.id });
      usedTaxDocIds.add(match.document.id);
      bank.isReconciled = true;
      match.document.isReconciled = true;
      created++;
    }

    // Rule 3 — TaxDocument ↔ Movement (total ±$1, date ±5 days)
    for (const taxDoc of taxDocs) {
      if (taxDoc.isReconciled) continue;
      const match = this.findMovementMatchForTaxDoc(taxDoc, movements, usedMovementIds);
      if (!match) continue;

      await this.createMatch({
        companyId,
        fiscalPeriodId: taxDoc.fiscalPeriodId ?? match.fiscalPeriodId,
        status: 'AUTO_MATCHED',
        confidenceScore: 0.9,
        matchType: 'exact_amount',
        taxDocumentId: taxDoc.id,
        movementId: match.id,
        amountDifference: this.absDiff(taxDoc.totalAmount, match.amount),
      });

      await this.markReconciled({ taxDocId: taxDoc.id, movementId: match.id });
      usedMovementIds.add(match.id);
      taxDoc.isReconciled = true;
      created++;
    }

    return created;
  }

  async runHeuristicMatching(companyId: string, fiscalPeriodId?: string): Promise<number> {
    // Reload — some items just got reconciled by exact pass.
    const [bankMovements, taxDocs] = await Promise.all([
      this.prisma.externalBankMovement.findMany({
        where: { companyId, isReconciled: false },
      }),
      this.prisma.taxDocument.findMany({
        where: {
          companyId,
          isReconciled: false,
          ...(fiscalPeriodId ? { fiscalPeriodId } : {}),
        },
      }),
    ]);

    // Avoid creating duplicate SUGGESTED pairs across re-runs.
    const existingSuggestedPairs = await this.prisma.reconciliationMatch.findMany({
      where: {
        companyId,
        status: { in: ['SUGGESTED', 'CONFIRMED', 'REJECTED', 'MANUAL'] },
        externalMovementId: { not: null },
        taxDocumentId: { not: null },
      },
      select: { externalMovementId: true, taxDocumentId: true },
    });
    const existingPairKeys = new Set(
      existingSuggestedPairs.map((p) => `${p.externalMovementId}|${p.taxDocumentId}`),
    );

    let created = 0;

    for (const bank of bankMovements) {
      const bankAmt = Math.abs(Number(bank.amount));
      if (bankAmt === 0) continue;

      for (const taxDoc of taxDocs) {
        if (taxDoc.isReconciled) continue;
        const pairKey = `${bank.id}|${taxDoc.id}`;
        if (existingPairKeys.has(pairKey)) continue;

        const daysDiff = this.daysBetween(bank.date, taxDoc.issueDate);
        if (daysDiff > FUZZY_DAYS) continue;

        // Direction sanity: EMITIDO ↔ CREDIT, RECIBIDO ↔ DEBIT.
        if (!this.directionCompatible(bank.type, taxDoc.direction)) continue;

        const docTotal = Number(taxDoc.totalAmount);
        if (docTotal === 0) continue;

        const difference = Math.abs(bankAmt - docTotal);
        const diffPct = difference / docTotal;
        if (diffPct > FUZZY_MAX_DIFF_PCT) continue;

        // Confidence: 0.8 when identical (but exact rule would have caught it),
        // down to 0.5 at 5% diff. Linear interpolation.
        const score = Math.max(0.5, 0.8 - (diffPct / FUZZY_MAX_DIFF_PCT) * 0.3);

        await this.createMatch({
          companyId,
          fiscalPeriodId: taxDoc.fiscalPeriodId ?? fiscalPeriodId ?? null,
          status: 'SUGGESTED',
          confidenceScore: Number(score.toFixed(4)),
          matchType: 'fuzzy_date_amount',
          externalMovementId: bank.id,
          taxDocumentId: taxDoc.id,
          amountDifference: Number(difference.toFixed(2)),
        });

        existingPairKeys.add(pairKey);
        created++;
      }
    }

    return created;
  }

  // ───────────────────────── Rule helpers ─────────────────────────

  private findMovementMatch(
    bank: ExternalBankMovement,
    movements: Movement[],
    usedIds: Set<string>,
  ): Movement | null {
    const bankAmt = Math.abs(Number(bank.amount));
    for (const mov of movements) {
      if (usedIds.has(mov.id)) continue;
      if (!this.movementDirectionMatchesBank(mov.type, bank.type)) continue;
      const movAmt = Math.abs(Number(mov.amount));
      if (Math.abs(bankAmt - movAmt) > AMOUNT_TOLERANCE) continue;
      if (this.daysBetween(bank.date, mov.date) > EXACT_BANK_MOVEMENT_DAYS) continue;
      return mov;
    }
    return null;
  }

  private findTaxDocMatchForBank(
    bank: ExternalBankMovement,
    taxDocs: TaxDocument[],
    usedIds: Set<string>,
  ): { document: TaxDocument; matchType: MatchType; difference: number } | null {
    const bankAmt = Math.abs(Number(bank.amount));
    for (const doc of taxDocs) {
      if (usedIds.has(doc.id) || doc.isReconciled) continue;
      if (!this.directionCompatible(bank.type, doc.direction)) continue;
      if (this.daysBetween(bank.date, doc.issueDate) > EXACT_BANK_TAX_DAYS) continue;

      const total = Number(doc.totalAmount);
      const netPlusTax = Number(doc.netAmount) + Number(doc.taxAmount);

      const diffTotal = Math.abs(bankAmt - total);
      if (diffTotal <= AMOUNT_TOLERANCE) {
        return {
          document: doc,
          matchType: 'exact_amount',
          difference: Number(diffTotal.toFixed(2)),
        };
      }
      const diffNetTax = Math.abs(bankAmt - netPlusTax);
      if (diffNetTax <= AMOUNT_TOLERANCE) {
        return {
          document: doc,
          matchType: 'amount_with_tax',
          difference: Number(diffNetTax.toFixed(2)),
        };
      }
    }
    return null;
  }

  private findMovementMatchForTaxDoc(
    taxDoc: TaxDocument,
    movements: Movement[],
    usedIds: Set<string>,
  ): Movement | null {
    const total = Number(taxDoc.totalAmount);
    for (const mov of movements) {
      if (usedIds.has(mov.id)) continue;
      if (!this.movementDirectionMatchesTaxDoc(mov.type, taxDoc.direction)) continue;
      const movAmt = Math.abs(Number(mov.amount));
      if (Math.abs(total - movAmt) > AMOUNT_TOLERANCE) continue;
      if (this.daysBetween(taxDoc.issueDate, mov.date) > EXACT_TAX_MOVEMENT_DAYS) continue;
      return mov;
    }
    return null;
  }

  // ───────────────────────── Utilities ─────────────────────────

  private directionCompatible(bankType: string, docDirection: DocumentDirection): boolean {
    // EMITIDO (we sold) → incoming money → CREDIT
    // RECIBIDO (we bought) → outgoing money → DEBIT
    if (docDirection === 'EMITIDO') return bankType === 'CREDIT';
    return bankType === 'DEBIT';
  }

  private movementDirectionMatchesBank(movType: string, bankType: string): boolean {
    if (bankType === 'CREDIT') return movType === 'INCOME';
    return movType === 'EXPENSE';
  }

  private movementDirectionMatchesTaxDoc(
    movType: string,
    docDirection: DocumentDirection,
  ): boolean {
    if (docDirection === 'EMITIDO') return movType === 'INCOME';
    return movType === 'EXPENSE';
  }

  private daysBetween(a: Date, b: Date): number {
    const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  private absDiff(a: Prisma.Decimal | number, b: Prisma.Decimal | number): number {
    return Number(Math.abs(Number(a) - Number(b)).toFixed(2));
  }

  private async createMatch(data: {
    companyId: string;
    fiscalPeriodId: string | null;
    status: 'AUTO_MATCHED' | 'SUGGESTED';
    confidenceScore: number;
    matchType: MatchType;
    externalMovementId?: string | null;
    taxDocumentId?: string | null;
    movementId?: string | null;
    amountDifference?: number;
  }) {
    await this.prisma.reconciliationMatch.create({
      data: {
        companyId: data.companyId,
        fiscalPeriodId: data.fiscalPeriodId,
        status: data.status,
        confidenceScore: data.confidenceScore,
        matchType: data.matchType,
        externalMovementId: data.externalMovementId ?? null,
        taxDocumentId: data.taxDocumentId ?? null,
        movementId: data.movementId ?? null,
        amountDifference: data.amountDifference ?? null,
      },
    });
  }

  private async markReconciled(ids: { bankId?: string; taxDocId?: string; movementId?: string }) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (ids.bankId) {
      ops.push(
        this.prisma.externalBankMovement.update({
          where: { id: ids.bankId },
          data: { isReconciled: true },
        }),
      );
    }
    if (ids.taxDocId) {
      ops.push(
        this.prisma.taxDocument.update({
          where: { id: ids.taxDocId },
          data: { isReconciled: true },
        }),
      );
    }
    if (ids.movementId) {
      ops.push(
        this.prisma.movement.update({
          where: { id: ids.movementId },
          data: { status: 'RECONCILED' },
        }),
      );
    }
    await this.prisma.$transaction(ops);
  }
}
