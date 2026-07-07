import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, LostReason, OpportunityStage, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { ChangeStageDto } from './dto/change-stage.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

const ACTIVE_STAGES: OpportunityStage[] = [
  OpportunityStage.PROSPECTO,
  OpportunityStage.CONTACTO,
  OpportunityStage.VISITA_TECNICA,
  OpportunityStage.COTIZACION,
  OpportunityStage.NEGOCIACION,
];
const CLOSED_STAGES: OpportunityStage[] = [OpportunityStage.GANADA, OpportunityStage.PERDIDA];

/* COM-009 — Spanish display labels for the system-activity subjects. Hardcoded here
   (no shared FE/BE label module exists) but kept IDENTICAL to the frontend
   stageLabels.tsx / stage machine so a timeline entry reads the same as the board
   column. If these ever diverge from stageLabels, fix them together. */
const STAGE_LABELS: Record<OpportunityStage, string> = {
  PROSPECTO: 'Prospecto',
  CONTACTO: 'Contacto',
  VISITA_TECNICA: 'Visita Técnica',
  COTIZACION: 'Cotización',
  NEGOCIACION: 'Negociación',
  EN_PAUSA: 'En Pausa',
  GANADA: 'Ganada',
  PERDIDA: 'Perdida',
};
const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRECIO: 'Precio',
  COMPETENCIA: 'Competencia',
  PROYECTO_CANCELADO: 'Canceló el proyecto',
  OTRO: 'Otro',
};

interface ListFilters {
  stage?: OpportunityStage;
  accountId?: string;
  ownerId?: string;
}

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Anchor a YYYY-MM-DD (or ISO) string to UTC midnight so an @db.Date column
   * never suffers the timezone off-by-one (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.OpportunityWhereInput = { companyId };
    if (filters.stage) where.stage = filters.stage;
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    return this.prisma.opportunity.findMany({ where, orderBy: [{ updatedAt: 'desc' }] });
  }

  async findOne(id: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({ where: { id, companyId } });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    return opp;
  }

  async create(companyId: string, userId: string, dto: CreateOpportunityDto) {
    await this.assertAccountInCompany(dto.accountId, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          companyId,
          createdBy: userId,
          accountId: dto.accountId,
          name: dto.name,
          stage: OpportunityStage.PROSPECTO,
          estimatedValue:
            dto.estimatedValue !== undefined ? new Prisma.Decimal(dto.estimatedValue) : null,
          probability: dto.probability ?? null,
          expectedCloseDate: dto.expectedCloseDate ? this.toDateOnly(dto.expectedCloseDate) : null,
          ownerId: dto.ownerId ?? null,
          notes: dto.notes ?? null,
        },
      });
      // COM-009 — the create event, in the SAME transaction as the insert.
      await this.writeSystemActivity(tx, {
        companyId,
        accountId: dto.accountId,
        opportunityId: created.id,
        userId,
        subject: 'Oportunidad creada',
      });
      return created;
    });
  }

  /** General-field update. Stage edits are REJECTED here — they must go through
   * changeStage() so the transition rules are the only path. */
  async update(id: string, companyId: string, userId: string, dto: UpdateOpportunityDto) {
    await this.findOne(id, companyId);
    if (dto.stage !== undefined) {
      throw new BadRequestException(
        'Los cambios de etapa se realizan vía PATCH /:id/stage, no en la edición general.',
      );
    }
    if (dto.accountId) await this.assertAccountInCompany(dto.accountId, companyId);

    // COM-006 — DERIVED TOTAL: while the opportunity has a service bundle, its
    // estimatedValue is Σ(quantity × unitPrice) and cannot be set manually. Edit the
    // bundle lines instead. With ZERO lines, manual editing works as before.
    if (dto.estimatedValue !== undefined) {
      const bundleLines = await this.prisma.opportunityService.count({
        where: { companyId, opportunityId: id },
      });
      if (bundleLines > 0) {
        throw new BadRequestException(
          'El valor estimado se deriva del bundle de servicios (suma de cantidad × precio); edita las líneas del bundle, no el valor directamente.',
        );
      }
    }

    const data: Prisma.OpportunityUncheckedUpdateInput = {};
    if (dto.accountId !== undefined) data.accountId = dto.accountId;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.estimatedValue !== undefined) {
      data.estimatedValue =
        dto.estimatedValue === null ? null : new Prisma.Decimal(dto.estimatedValue);
    }
    if (dto.probability !== undefined) data.probability = dto.probability;
    if (dto.expectedCloseDate !== undefined) {
      data.expectedCloseDate = dto.expectedCloseDate
        ? this.toDateOnly(dto.expectedCloseDate)
        : null;
    }
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunity.update({ where: { id }, data });
    });
  }

  /** THE canonical stage-transition path — enforces the pipeline rules. */
  async changeStage(id: string, companyId: string, userId: string, dto: ChangeStageDto) {
    const opp = await this.findOne(id, companyId);
    const from = opp.stage;
    const to = dto.stage;

    // Rule 3 — GANADA/PERDIDA are semi-terminal: no ordinary stage move out of them.
    if (CLOSED_STAGES.includes(from)) {
      throw new BadRequestException(
        'La oportunidad está cerrada (GANADA/PERDIDA). Usa "reabrir" para reactivarla.',
      );
    }

    const data: Prisma.OpportunityUncheckedUpdateInput = { stage: to };
    // COM-009 — the timeline text for this movement (Spanish display labels). Computed
    // alongside `data`; written in the SAME transaction as the update below.
    let subject: string;

    if (to === OpportunityStage.PERDIDA) {
      // Rule 2 — losing requires a categorized reason; OTRO also requires detail.
      if (!dto.lostReason) {
        throw new BadRequestException('Para marcar PERDIDA debes indicar el motivo (lostReason).');
      }
      if (dto.lostReason === LostReason.OTRO && !dto.lostReasonDetail?.trim()) {
        throw new BadRequestException(
          'Con motivo OTRO debes detallar el motivo (lostReasonDetail).',
        );
      }
      const detail = dto.lostReasonDetail?.trim() || null;
      data.lostReason = dto.lostReason;
      data.lostReasonDetail = detail;
      data.closedAt = new Date();
      data.previousStage = null;
      subject = `Oportunidad perdida — ${LOST_REASON_LABELS[dto.lostReason]}`;
      if (dto.lostReason === LostReason.OTRO && detail) subject += `: ${detail}`;
    } else if (to === OpportunityStage.GANADA) {
      // Rule 2 — GANADA needs nothing extra here (COM-013 handoff prereqs come later).
      data.closedAt = new Date();
      data.previousStage = null;
      subject = 'Oportunidad ganada';
    } else if (to === OpportunityStage.EN_PAUSA) {
      // Rule 4 — pause only FROM an active stage; remember where it was.
      if (!ACTIVE_STAGES.includes(from)) {
        throw new BadRequestException('Solo puedes pausar una oportunidad en una etapa activa.');
      }
      data.previousStage = from;
      subject = 'Oportunidad en pausa';
      // closedAt untouched by a pause
    } else {
      // to is one of the five active stages — Rule 1 free movement, and Rule 4
      // resume-elsewhere: moving out of EN_PAUSA to any active stage clears the
      // pause context (that movement reads as a resume, not a plain stage change).
      if (from === OpportunityStage.EN_PAUSA) {
        data.previousStage = null;
        subject = `Oportunidad reanudada (a ${STAGE_LABELS[to]})`;
      } else {
        subject = `Etapa: ${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}`;
      }
    }

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.opportunity.update({ where: { id }, data });
      await this.writeSystemActivity(tx, {
        companyId,
        accountId: opp.accountId,
        opportunityId: id,
        userId,
        subject,
      });
      return updated;
    });
  }

  /** Rule 4 — dedicated resume: EN_PAUSA → previousStage, clearing previousStage. */
  async resume(id: string, companyId: string, userId: string) {
    const opp = await this.findOne(id, companyId);
    if (opp.stage !== OpportunityStage.EN_PAUSA) {
      throw new BadRequestException('Solo se puede reanudar una oportunidad EN_PAUSA.');
    }
    const target = opp.previousStage ?? OpportunityStage.NEGOCIACION;
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.opportunity.update({
        where: { id },
        data: { stage: target, previousStage: null },
      });
      await this.writeSystemActivity(tx, {
        companyId,
        accountId: opp.accountId,
        opportunityId: id,
        userId,
        subject: `Oportunidad reanudada (a ${STAGE_LABELS[target]})`,
      });
      return updated;
    });
  }

  /** Rule 3 — the ONLY exit from GANADA/PERDIDA: reopen → NEGOCIACION, clear
   * closedAt, but KEEP lostReason/lostReasonDetail as historical record. */
  async reopen(id: string, companyId: string, userId: string) {
    const opp = await this.findOne(id, companyId);
    if (!CLOSED_STAGES.includes(opp.stage)) {
      throw new BadRequestException('Solo se puede reabrir una oportunidad GANADA o PERDIDA.');
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const updated = await tx.opportunity.update({
        where: { id },
        // lostReason / lostReasonDetail intentionally preserved (historical record).
        data: { stage: OpportunityStage.NEGOCIACION, closedAt: null },
      });
      await this.writeSystemActivity(tx, {
        companyId,
        accountId: opp.accountId,
        opportunityId: id,
        userId,
        subject: 'Oportunidad reabierta',
      });
      return updated;
    });
  }

  /** Hard delete ONLY for non-closed opportunities. Closed (GANADA/PERDIDA) are
   * historical outcomes feeding pipeline analytics and the future GANADA handoff —
   * deleting them would lose commercial history; reopen instead if needed. */
  async remove(id: string, companyId: string, userId: string) {
    const opp = await this.findOne(id, companyId);
    if (CLOSED_STAGES.includes(opp.stage)) {
      throw new ConflictException(
        'No se puede eliminar una oportunidad cerrada (GANADA/PERDIDA); reábrela si corresponde.',
      );
    }
    // COM-010 — quotes are commercial documents; the quotes→opportunities FK is ON
    // DELETE RESTRICT. Surface that as a friendly 409 before hitting the DB error.
    const quoteCount = await this.prisma.quote.count({ where: { companyId, opportunityId: id } });
    if (quoteCount > 0) {
      throw new ConflictException(
        'No se puede eliminar una oportunidad con cotizaciones; son documentos comerciales (elimina los borradores o conserva el historial).',
      );
    }
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunity.delete({ where: { id } });
    });
  }

  private async assertAccountInCompany(accountId: string, companyId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId },
      select: { id: true },
    });
    if (!account) {
      throw new BadRequestException('Cuenta no encontrada en esta empresa.');
    }
  }

  /** COM-009 — write a SYSTEM activity (type NOTA, isSystemGenerated=true) recording a
   * pipeline event, in the SAME transaction as the stage mutation (the `tx` passed by
   * executeWithRls). This deliberately bypasses the public ActivitiesService.create,
   * which forces isSystemGenerated=false — so the public API still cannot mint system
   * entries, while the machine's own history is atomic with the movement it records.
   * Only the COM-005 events call this; bundle mutations / estimatedValue recomputes
   * (COM-006) never do. detail stays null — the subject carries the message. */
  private async writeSystemActivity(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      accountId: string;
      opportunityId: string;
      userId: string;
      subject: string;
    },
  ) {
    await tx.activity.create({
      data: {
        companyId: params.companyId,
        createdBy: params.userId,
        accountId: params.accountId,
        opportunityId: params.opportunityId,
        type: ActivityType.NOTA,
        subject: params.subject,
        detail: null,
        isSystemGenerated: true,
        activityDate: new Date(),
      },
    });
  }
}
