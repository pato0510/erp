import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { ChangeServiceOrderStatusDto } from './dto/change-service-order-status.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';

/* COM-013a — a frozen scope line copied from the accepted quote. */
export interface ServiceOrderScopeLine {
  serviceName: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
}

/* COM-013a — the input the COM-013b handoff handler passes to createFromHandoff. Every
   field is pre-resolved from the won opportunity + accepted quote (denormalized client,
   frozen scope, amounts, soft provenance ids). No DTO/validation pipe — this is a
   server-side seam, not an HTTP body. */
export interface CreateServiceOrderInput {
  clientName: string;
  counterpartyId?: string | null;
  title: string;
  description?: string | null;
  scopeLines: ServiceOrderScopeLine[];
  netAmount: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  currency?: string;
  ownerId?: string | null;
  sourceOpportunityId?: string | null;
  sourceQuoteId?: string | null;
  createdBy?: string | null; // null/system when the handler creates it
  notes?: string | null;
}

const TERMINAL_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.COMPLETADA,
  ServiceOrderStatus.CANCELADA,
];
/* The status machine: RECIBIDA → EN_EJECUCION → COMPLETADA; CANCELADA reachable from any
   non-terminal state; COMPLETADA/CANCELADA terminal. */
const ALLOWED_TRANSITIONS: Partial<Record<ServiceOrderStatus, ServiceOrderStatus[]>> = {
  [ServiceOrderStatus.RECIBIDA]: [ServiceOrderStatus.EN_EJECUCION, ServiceOrderStatus.CANCELADA],
  [ServiceOrderStatus.EN_EJECUCION]: [ServiceOrderStatus.COMPLETADA, ServiceOrderStatus.CANCELADA],
};

interface ListFilters {
  status?: ServiceOrderStatus;
  search?: string;
}

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** List — filter by status + a simple search over orderNumber/clientName/title. */
  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.ServiceOrderWhereInput = { companyId };
    if (filters.status) where.status = filters.status;
    const s = filters.search?.trim();
    if (s) {
      where.OR = [
        { orderNumber: { contains: s, mode: 'insensitive' } },
        { clientName: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.serviceOrder.findMany({ where, orderBy: [{ createdAt: 'desc' }] });
  }

  async findOne(id: string, companyId: string) {
    const order = await this.prisma.serviceOrder.findFirst({ where: { id, companyId } });
    if (!order) throw new NotFoundException('Orden de servicio no encontrada');
    return order;
  }

  /** COM-013a — the INTERNAL creation seam the COM-013b handoff handler calls. It assigns
   * the per-company orderNumber and inserts the frozen snapshot inside executeWithRls.
   * It is NOT wired to any user-facing endpoint. IDEMPOTENCY CHOICE: this method does NOT
   * guard on sourceOpportunityId (single responsibility: insert). COM-013b owns the final
   * idempotency guard — it calls findBySourceOpportunity() first (fast via the
   * (companyId, sourceOpportunityId) index), then createFromHandoff only if absent. */
  async createFromHandoff(companyId: string, input: CreateServiceOrderInput) {
    const netAmount = new Prisma.Decimal(input.netAmount);
    const taxAmount = new Prisma.Decimal(input.taxAmount);
    const totalAmount = new Prisma.Decimal(input.totalAmount);

    return this.rlsService.executeWithRls(companyId, input.createdBy ?? null, async (tx) => {
      const orderNumber = await this.nextOrderNumber(tx, companyId);
      return tx.serviceOrder.create({
        data: {
          companyId,
          orderNumber,
          status: ServiceOrderStatus.RECIBIDA,
          clientName: input.clientName,
          counterpartyId: input.counterpartyId ?? null,
          title: input.title,
          description: input.description ?? null,
          scopeLines: input.scopeLines as unknown as Prisma.InputJsonValue,
          netAmount,
          taxAmount,
          totalAmount,
          currency: input.currency ?? 'CLP',
          ownerId: input.ownerId ?? null,
          sourceOpportunityId: input.sourceOpportunityId ?? null,
          sourceQuoteId: input.sourceQuoteId ?? null,
          notes: input.notes ?? null,
          createdBy: input.createdBy ?? null,
        },
      });
    });
  }

  /** COM-013b idempotency seam — the handoff handler checks this before createFromHandoff
   * so a re-emitted 'opportunity.won' event does not mint a second order. */
  async findBySourceOpportunity(companyId: string, sourceOpportunityId: string) {
    return this.prisma.serviceOrder.findFirst({ where: { companyId, sourceOpportunityId } });
  }

  /** General-field update (title/description/notes). Stage/status edits are REJECTED
   * here — they go through changeStatus so the machine is the only path. */
  async update(companyId: string, userId: string, id: string, dto: UpdateServiceOrderDto) {
    await this.findOne(id, companyId);
    if (dto.status !== undefined) {
      throw new BadRequestException(
        'Los cambios de estado se realizan vía PATCH /:id/status, no en la edición general.',
      );
    }
    const data: Prisma.ServiceOrderUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.serviceOrder.update({ where: { id }, data });
    });
  }

  /** THE canonical status machine. */
  async changeStatus(
    companyId: string,
    userId: string,
    id: string,
    dto: ChangeServiceOrderStatusDto,
  ) {
    const order = await this.findOne(id, companyId);
    const from = order.status;
    const to = dto.status;

    if (TERMINAL_STATUSES.includes(from)) {
      throw new BadRequestException(
        'La orden está en un estado terminal (completada/cancelada); no admite más cambios.',
      );
    }
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Transición de estado no permitida: ${from} → ${to}.`);
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.serviceOrder.update({ where: { id }, data: { status: to } });
    });
  }

  /** Per-company sequential number OS-0001…. Derived from the current max inside the
   * creation transaction (the quotes approach). Single-tenant reality → nil contention;
   * the @@unique([companyId, orderNumber]) is the hard backstop. Zero-padded to 4. */
  private async nextOrderNumber(tx: Prisma.TransactionClient, companyId: string) {
    const last = await tx.serviceOrder.findFirst({
      where: { companyId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const n = last ? (parseInt(last.orderNumber.replace(/\D/g, ''), 10) || 0) + 1 : 1;
    return `OS-${String(n).padStart(4, '0')}`;
  }
}
