import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { AddOpportunityServiceDto } from './dto/add-opportunity-service.dto';
import { UpdateOpportunityServiceDto } from './dto/update-opportunity-service.dto';

/* Closed = historical record (mirrors COM-005). A closed deal's bundle cannot be
   mutated; EN_PAUSA and the active stages can. */
const CLOSED_STAGES: OpportunityStage[] = [OpportunityStage.GANADA, OpportunityStage.PERDIDA];

@Injectable()
export class OpportunityServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** List the bundle lines of an opportunity (the natural access path). */
  async findAll(companyId: string, opportunityId: string) {
    await this.assertOpportunityInCompany(opportunityId, companyId);
    return this.prisma.opportunityService.findMany({
      where: { companyId, opportunityId },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  /** Rule 1 — ADD a line. The opportunity must exist, be in this company and be
   * mutable (not closed). The catalog service must exist, be in this company and be
   * ACTIVE. unitPrice defaults to the service's CURRENT basePrice (price snapshot)
   * unless the caller provides one. Duplicate (opportunity, service) rejected. The
   * opportunity's estimatedValue is re-derived in the same transaction. */
  async add(
    companyId: string,
    userId: string,
    opportunityId: string,
    dto: AddOpportunityServiceDto,
  ) {
    await this.assertOpportunityMutable(opportunityId, companyId);
    const service = await this.assertActiveServiceInCompany(dto.serviceId, companyId);

    // PRICE SNAPSHOT — copy basePrice now; later catalog changes never touch this line.
    const unitPrice =
      dto.unitPrice !== undefined
        ? new Prisma.Decimal(dto.unitPrice)
        : new Prisma.Decimal(service.basePrice);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const duplicate = await tx.opportunityService.findFirst({
        where: { companyId, opportunityId, serviceId: dto.serviceId },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'Este servicio ya está en el bundle de la oportunidad; ajusta la cantidad en la línea existente.',
        );
      }
      const line = await tx.opportunityService.create({
        data: {
          companyId,
          createdBy: userId,
          opportunityId,
          serviceId: dto.serviceId,
          quantity: new Prisma.Decimal(dto.quantity),
          unitPrice,
          notes: dto.notes ?? null,
        },
      });
      await this.recomputeEstimatedValue(tx, companyId, opportunityId);
      return line;
    });
  }

  /** Rule 2 — EDIT a line (quantity / unitPrice / notes). serviceId is NOT editable
   * (remove + add). Re-derives estimatedValue in the same transaction. */
  async update(
    companyId: string,
    userId: string,
    opportunityId: string,
    lineId: string,
    dto: UpdateOpportunityServiceDto,
  ) {
    await this.assertOpportunityMutable(opportunityId, companyId);
    await this.findLine(lineId, companyId, opportunityId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const data: Prisma.OpportunityServiceUncheckedUpdateInput = {};
      if (dto.quantity !== undefined) data.quantity = new Prisma.Decimal(dto.quantity);
      if (dto.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(dto.unitPrice);
      if (dto.notes !== undefined) data.notes = dto.notes;
      const line = await tx.opportunityService.update({ where: { id: lineId }, data });
      await this.recomputeEstimatedValue(tx, companyId, opportunityId);
      return line;
    });
  }

  /** Rule 3 — REMOVE a line (hard delete; a bundle line has no lifecycle field, same
   * as contacts). Re-derives estimatedValue; removing the LAST line keeps the last
   * derived value and re-enables manual editing (see recomputeEstimatedValue). */
  async remove(companyId: string, userId: string, opportunityId: string, lineId: string) {
    await this.assertOpportunityMutable(opportunityId, companyId);
    await this.findLine(lineId, companyId, opportunityId);

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await tx.opportunityService.delete({ where: { id: lineId } });
      await this.recomputeEstimatedValue(tx, companyId, opportunityId);
      return { id: lineId, deleted: true };
    });
  }

  /** Rule 4 — DERIVED TOTAL. Recompute the opportunity's estimatedValue =
   * Σ(quantity × unitPrice) across all its lines, in the SAME transaction. With ZERO
   * lines we intentionally leave estimatedValue untouched: removing the last line
   * KEEPS the last derived value and re-enables manual editing (the opportunities
   * update path only rejects manual edits while lines exist). */
  private async recomputeEstimatedValue(
    tx: Prisma.TransactionClient,
    companyId: string,
    opportunityId: string,
  ) {
    const lines = await tx.opportunityService.findMany({
      where: { companyId, opportunityId },
      select: { quantity: true, unitPrice: true },
    });
    if (lines.length === 0) return; // keep last derived value; manual editing re-enabled
    const total = lines.reduce(
      (acc, l) => acc.add(new Prisma.Decimal(l.quantity).mul(new Prisma.Decimal(l.unitPrice))),
      new Prisma.Decimal(0),
    );
    await tx.opportunity.update({
      where: { id: opportunityId },
      data: { estimatedValue: total },
    });
  }

  /** Company-scoped existence check for the parent opportunity. */
  private async assertOpportunityInCompany(opportunityId: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    return opp;
  }

  /** Rule 5 — the opportunity must exist, be in this company AND be mutable. A CLOSED
   * (GANADA/PERDIDA) deal's bundle is a historical record — mutations are rejected. */
  private async assertOpportunityMutable(opportunityId: string, companyId: string) {
    const opp = await this.assertOpportunityInCompany(opportunityId, companyId);
    if (CLOSED_STAGES.includes(opp.stage)) {
      throw new ConflictException(
        'La oportunidad está cerrada (GANADA/PERDIDA); su bundle de servicios es un registro histórico y no puede modificarse.',
      );
    }
    return opp;
  }

  /** Rule 1 — the catalog service must exist, be in this company AND be active.
   * Inactive services cannot be added (existing historical lines referencing a
   * later-deactivated service remain untouched). */
  private async assertActiveServiceInCompany(serviceId: string, companyId: string) {
    const service = await this.prisma.serviceCatalog.findFirst({
      where: { id: serviceId, companyId },
    });
    if (!service) {
      throw new BadRequestException('Servicio no encontrado en esta empresa.');
    }
    if (!service.isActive) {
      throw new BadRequestException('El servicio está inactivo y no puede agregarse al bundle.');
    }
    return service;
  }

  /** Company- AND opportunity-scoped line lookup. */
  private async findLine(lineId: string, companyId: string, opportunityId: string) {
    const line = await this.prisma.opportunityService.findFirst({
      where: { id: lineId, companyId, opportunityId },
    });
    if (!line) throw new NotFoundException('Línea de servicio no encontrada');
    return line;
  }
}
