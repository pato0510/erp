import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CategoryType,
  CounterpartyType,
  DocumentDirection,
  DocumentType,
  MovementSource,
  MovementStatus,
  MovementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RlsService } from '../common/rls/rls.service';
import { DEFAULT_SII_PROVIDER, SiiProviderFactory } from './providers/sii-provider.factory';
import { TaxDocumentResult } from './providers/sii-provider.interface';
import { CategoryRulesService } from '../catalogs/category-rules.service';
import { paginate } from '@erp/utils';

const DEFAULT_PROVIDER = DEFAULT_SII_PROVIDER;

const SALES_INCOME_CATEGORY_NAME = 'Ingresos por Ventas';
const UNCATEGORIZED_CATEGORY_NAME = 'Productos no categorizados';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  FACTURA_ELECTRONICA: 'Factura',
  BOLETA_ELECTRONICA: 'Boleta',
  NOTA_CREDITO: 'Nota de Crédito',
  NOTA_DEBITO: 'Nota de Débito',
  LIQUIDACION_FACTURA: 'Liquidación',
  FACTURA_NO_AFECTA: 'Factura no Afecta',
};

interface DefaultCategoryIds {
  salesIncome: string;
  uncategorizedIncome: string;
  uncategorizedExpense: string;
}

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
    private readonly categoryRulesService: CategoryRulesService,
    private readonly rlsService: RlsService,
  ) {}

  async syncDocuments(
    companyId: string,
    userId: string,
    fiscalPeriodId: string,
    direction: DocumentDirection,
    providerName: string = DEFAULT_PROVIDER,
  ) {
    this.logger.log(
      `syncDocuments start company=${companyId} fiscalPeriodId=${fiscalPeriodId} direction=${direction} provider=${providerName}`,
    );

    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id: fiscalPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Fiscal period not found');

    const provider = this.providerFactory.getProvider(providerName);

    /* HARDEN-004A — scope 1 of 4: the run row gets its OWN committed
       transaction, before the loop, so it exists even if everything after it
       fails and the catch block below has a row to mark FAILED. */
    const syncRun = await this.rlsService.executeWithRls(companyId, userId, async (tx) =>
      tx.taxSyncRun.create({
        data: {
          companyId,
          fiscalPeriodId,
          provider: providerName,
          direction,
          status: 'RUNNING',
        },
      }),
    );

    try {
      const siiPeriod = { year: period.year, month: period.month };
      // Credentials currently come from env vars (SII_RUT/SII_PASSWORD). Once
      // we persist them per-company on SiiConnection, swap this block for a
      // DB lookup — the provider interface accepts `unknown`, so no signature
      // change is needed here.
      const credentials = {
        rut: process.env.SII_RUT,
        password: process.env.SII_PASSWORD,
      };
      const documents =
        direction === 'EMITIDO'
          ? await provider.getEmitidos(credentials, siiPeriod)
          : await provider.getRecibidos(credentials, siiPeriod);

      // Lazy: only do the work if there are documents to import.
      const defaultCategories = documents.length
        ? await this.ensureDefaultCategories(companyId, userId)
        : null;

      let synced = 0;
      let skipped = 0;
      let movementsCreated = 0;
      const errors: { folio: number; message: string }[] = [];

      for (const doc of documents) {
        try {
          /* HARDEN-004A — scope 3 of 4: TWO transactions PER DOCUMENT, one for
             the document and one for its movement. They are deliberately NOT
             merged.
             WHY THEY MUST STAY SEPARATE (director ruling, 2026-08-05): a
             tax_document with no movement is a FIRST-CLASS designed state —
             isReconciled:false feeds the pendingReconciliation counter that
             getSummary returns and the UI renders. Sharing one transaction
             would roll the document insert back when its movement failed, and
             the invoice would vanish from the product entirely instead of
             showing up as unreconciled. Do not "simplify" these into one.
             The sync also stays RESILIENT PER DOCUMENT (founder decision,
             2026-08-05): either transaction failing pushes to errors[] and the
             loop continues, with earlier documents already committed.
             Deliberately NOT one transaction around the whole loop either —
             that would change the failure semantics and hold a pooled
             connection for the length of the run. */
          const { id: taxDocId, created } = await this.rlsService.executeWithRls(
            companyId,
            userId,
            async (tx) => this.upsertDocument(tx, companyId, fiscalPeriodId, doc),
          );
          if (created) synced++;
          else skipped++;

          if (defaultCategories) {
            /* The duplicate-movement fix lives HERE, and never depended on
               sharing a transaction with the document insert: movement.create
               and the taxDocument.update that links them are both inside
               createMovementFromDocument, so this one scope makes them atomic.
               Previously they were two unrelated statements — a failure of the
               second left an ORPHAN movement whose document still had a null
               movementId, so the idempotency guard would not fire and the next
               run created a DUPLICATE financial record. */
            const movementCreated = await this.rlsService.executeWithRls(
              companyId,
              userId,
              async (tx) =>
                this.createMovementFromDocument(
                  tx,
                  companyId,
                  userId,
                  taxDocId,
                  fiscalPeriodId,
                  defaultCategories,
                ),
            );
            if (movementCreated) movementsCreated++;
          }
        } catch (err) {
          errors.push({
            folio: doc.folio,
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      /* HARDEN-004A — scope 4a of 4: the SUCCESS update, on its own. */
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        await tx.taxSyncRun.update({
          where: { id: syncRun.id },
          data: {
            status: 'SUCCESS',
            completedAt: new Date(),
            documentsSynced: synced,
          },
        });
      });

      return { synced, skipped, movementsCreated, errors, syncRunId: syncRun.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `syncDocuments failed company=${companyId} period=${fiscalPeriodId} direction=${direction}: ${message}`,
      );
      /* HARDEN-004A — scope 4b of 4: the FAILED update opens its OWN
         transaction rather than reusing anything from the try block, so it
         still works when the run itself failed. */
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        await tx.taxSyncRun.update({
          where: { id: syncRun.id },
          data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
        });
      });
      return {
        synced: 0,
        skipped: 0,
        movementsCreated: 0,
        errors: [{ folio: 0, message }],
        syncRunId: syncRun.id,
      };
    }
  }

  async testConnection() {
    const baseApi = this.providerFactory.getBaseApiProvider();
    return baseApi.validateConnection({
      rut: process.env.SII_RUT,
      password: process.env.SII_PASSWORD,
    });
  }

  async syncAll(companyId: string, userId: string, fiscalPeriodId: string) {
    const emitidos = await this.syncDocuments(companyId, userId, fiscalPeriodId, 'EMITIDO');
    const recibidos = await this.syncDocuments(companyId, userId, fiscalPeriodId, 'RECIBIDO');
    return {
      emitidos,
      recibidos,
      totalSynced: emitidos.synced + recibidos.synced,
      totalSkipped: emitidos.skipped + recibidos.skipped,
      totalMovementsCreated: emitidos.movementsCreated + recibidos.movementsCreated,
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

  /**
   * Tax documents whose linked movement still uses the default
   * "Productos no categorizados" category. Powers the
   * "pending categorization" frontend section.
   */
  async findPendingCategorization(companyId: string) {
    const defaults = await this.prisma.category.findMany({
      where: { companyId, name: UNCATEGORIZED_CATEGORY_NAME },
      select: { id: true },
    });
    const defaultIds = defaults.map((c) => c.id);
    if (defaultIds.length === 0) return [];

    const linkedMovements = await this.prisma.movement.findMany({
      where: {
        companyId,
        categoryId: { in: defaultIds },
        source: MovementSource.TAX_SYNC,
      },
      select: { id: true, type: true, categoryId: true },
    });
    if (linkedMovements.length === 0) return [];

    const movementById = new Map(linkedMovements.map((m) => [m.id, m]));
    const movementIds = linkedMovements.map((m) => m.id);

    const docs = await this.prisma.taxDocument.findMany({
      where: { companyId, movementId: { in: movementIds } },
      orderBy: { issueDate: 'desc' },
    });

    return docs.map((d) => {
      const movement = d.movementId ? movementById.get(d.movementId) : undefined;
      return {
        id: d.id,
        type: d.type,
        direction: d.direction,
        folio: d.folio,
        issuerName: d.issuerName,
        issuerRut: d.issuerRut,
        receiverName: d.receiverName,
        receiverRut: d.receiverRut,
        issueDate: d.issueDate,
        totalAmount: d.totalAmount,
        movementId: d.movementId,
        movementType: movement?.type ?? null,
        currentCategoryId: movement?.categoryId ?? null,
      };
    });
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

  /* HARDEN-004A — `tx` is threaded in explicitly: a `this.prisma` call inside an
     executeWithRls callback escapes the transaction onto another pooled
     connection and carries NO GUC, which is the exact bug this ticket removes.
     The idempotency read below now runs on the same GUC-carrying connection as
     the insert that follows it, so both see one consistent view. */
  private async upsertDocument(
    tx: Prisma.TransactionClient,
    companyId: string,
    fiscalPeriodId: string,
    doc: TaxDocumentResult,
  ): Promise<{ id: string; created: boolean }> {
    // Unique on (companyId, type, folio, direction) gives us idempotency.
    const existing = await tx.taxDocument.findUnique({
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
      return { id: existing.id, created: false };
    }

    const newDoc = await tx.taxDocument.create({
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
      select: { id: true },
    });
    return { id: newDoc.id, created: true };
  }

  /**
   * Upserts the three default categories used by SII auto-import:
   *  - "Ingresos por Ventas" (INCOME) for EMITIDO documents
   *  - "Productos no categorizados" (INCOME and EXPENSE) for fallback
   * Idempotent via @@unique([companyId, name, type]).
   */
  async ensureDefaultCategories(companyId: string, userId: string): Promise<DefaultCategoryIds> {
    const seeds: { name: string; type: CategoryType; color: string }[] = [
      { name: SALES_INCOME_CATEGORY_NAME, type: CategoryType.INCOME, color: '#2563EB' },
      { name: UNCATEGORIZED_CATEGORY_NAME, type: CategoryType.EXPENSE, color: '#94A3B8' },
      { name: UNCATEGORIZED_CATEGORY_NAME, type: CategoryType.INCOME, color: '#94A3B8' },
    ];

    /* HARDEN-004A — scope 2 of 4: its own transaction, opened here because this
       runs exactly once, before the document loop. `userId` is no longer
       ignored: executeWithRls turns it into audit.user_id, so the audit trigger
       attributes these category rows to the person who ran the sync.
       The three upserts run SEQUENTIALLY on `tx` — an interactive transaction is
       one connection, so the previous Promise.all would have interleaved
       statements on it. */
    const upserted = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const rows: { id: string; name: string; type: CategoryType }[] = [];
      for (const s of seeds) {
        rows.push(
          await tx.category.upsert({
            where: {
              companyId_name_type: { companyId, name: s.name, type: s.type },
            },
            create: { companyId, name: s.name, type: s.type, color: s.color },
            update: {},
            select: { id: true, name: true, type: true },
          }),
        );
      }
      return rows;
    });

    const find = (name: string, type: CategoryType) =>
      upserted.find((c) => c.name === name && c.type === type)!.id;

    return {
      salesIncome: find(SALES_INCOME_CATEGORY_NAME, CategoryType.INCOME),
      uncategorizedExpense: find(UNCATEGORIZED_CATEGORY_NAME, CategoryType.EXPENSE),
      uncategorizedIncome: find(UNCATEGORIZED_CATEGORY_NAME, CategoryType.INCOME),
    };
  }

  /**
   * Resolves the category for an imported tax document. First consults the
   * CategoryRule engine (RUT match, then keyword match); if no rule fires,
   * falls back to the spec defaults (sales-income for EMITIDO,
   * uncategorized-expense for RECIBIDO).
   */
  async applyCategoryRules(
    tx: Prisma.TransactionClient,
    direction: DocumentDirection,
    defaults: DefaultCategoryIds,
    companyId: string,
    rut: string,
    razonSocial: string,
  ): Promise<string> {
    const movementType =
      direction === DocumentDirection.EMITIDO ? MovementType.INCOME : MovementType.EXPENSE;

    /* HARDEN-004A — `tx` is forwarded so the rules lookup runs on the
       GUC-carrying connection. Without it the read would see zero rules under a
       live policy and every document would silently fall through to the default
       category — miscategorisation, not an error. */
    const ruleMatch = await this.categoryRulesService.applyRules(
      companyId,
      rut,
      razonSocial,
      movementType,
      tx,
    );
    if (ruleMatch) return ruleMatch;

    return direction === DocumentDirection.EMITIDO
      ? defaults.salesIncome
      : defaults.uncategorizedExpense;
  }

  /* HARDEN-004A — `_userId` KEEPS its underscore on purpose. This helper never
     opens a transaction of its own: it runs inside the per-document scope the
     caller opened, and that call is what set audit.user_id. So the value is
     genuinely unused HERE, unlike in ensureDefaultCategories where it now feeds
     executeWithRls directly. Kept in the signature so the call site stays
     readable and so a future refactor that gives this helper its own scope has
     the value already threaded. */
  async findOrCreateCounterparty(
    tx: Prisma.TransactionClient,
    companyId: string,
    _userId: string,
    rut: string,
    name: string,
    direction: DocumentDirection,
  ): Promise<string> {
    const existing = await tx.counterparty.findUnique({
      where: { companyId_taxId: { companyId, taxId: rut } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.counterparty.create({
      data: {
        companyId,
        name,
        taxId: rut,
        type: direction === 'EMITIDO' ? CounterpartyType.CLIENT : CounterpartyType.SUPPLIER,
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Creates a Movement from a TaxDocument and links them via taxDoc.movementId.
   * Idempotent: if movementId is already set, returns false without creating
   * a duplicate. Returns true when a new movement was created.
   */
  async createMovementFromDocument(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    taxDocId: string,
    fiscalPeriodId: string,
    defaults: DefaultCategoryIds,
  ): Promise<boolean> {
    const taxDoc = await tx.taxDocument.findUnique({
      where: { id: taxDocId },
      select: {
        id: true,
        type: true,
        direction: true,
        folio: true,
        issuerRut: true,
        issuerName: true,
        receiverRut: true,
        receiverName: true,
        issueDate: true,
        totalAmount: true,
        externalId: true,
        movementId: true,
      },
    });
    if (!taxDoc) return false;
    if (taxDoc.movementId) return false; // idempotency: already linked

    const isIncome = taxDoc.direction === DocumentDirection.EMITIDO;
    const counterpartyRut = isIncome ? taxDoc.receiverRut : taxDoc.issuerRut;
    const counterpartyName = isIncome ? taxDoc.receiverName : taxDoc.issuerName;

    const counterpartyId = await this.findOrCreateCounterparty(
      tx,
      companyId,
      userId,
      counterpartyRut,
      counterpartyName,
      taxDoc.direction,
    );

    const categoryId = await this.applyCategoryRules(
      tx,
      taxDoc.direction,
      defaults,
      companyId,
      counterpartyRut,
      counterpartyName,
    );

    const typeLabel = DOCUMENT_TYPE_LABELS[taxDoc.type] ?? taxDoc.type;
    const description = `${typeLabel} #${taxDoc.folio} - ${counterpartyName}`;

    const movement = await tx.movement.create({
      data: {
        companyId,
        fiscalPeriodId,
        categoryId,
        counterpartyId,
        type: isIncome ? MovementType.INCOME : MovementType.EXPENSE,
        status: MovementStatus.CONFIRMED,
        source: MovementSource.TAX_SYNC,
        amount: taxDoc.totalAmount,
        date: taxDoc.issueDate,
        description,
        reference: taxDoc.externalId ?? undefined,
        notes: 'Importado desde SII automáticamente',
        createdBy: userId,
        confirmedAt: new Date(),
        confirmedBy: userId,
      },
      select: { id: true },
    });

    await tx.taxDocument.update({
      where: { id: taxDoc.id },
      data: { movementId: movement.id, isReconciled: true },
    });

    return true;
  }
}
