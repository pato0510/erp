import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialActivityEvent,
  LostReason,
  OpportunityStage,
  Opportunity,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { santiagoDateOf, todayInSantiago } from '../../common/santiago-date';
import { formatCLP, formatDateOnly, writeSystemActivity } from '../activities/system-activity';
import { DomainEventsService } from '../../operations/events/domain-events.service';
import { ChangeStageDto } from './dto/change-stage.dto';
import { ACTIVE_STAGES, CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ResumeOpportunityDto } from './dto/resume-opportunity.dto';
import { ReopenOpportunityDto } from './dto/reopen-opportunity.dto';
import { LOST_REASON_LABELS, STAGE_LABELS } from './opportunity-labels';
import { loadStageProbabilities } from './stage-probabilities';
import { memberDisplayName } from '../../iam/member-display-name';
import { lockLeadOpportunity, prepareLeadChange } from '../leads/lead-link';

const CLOSED_STAGES: OpportunityStage[] = [OpportunityStage.GANADA, OpportunityStage.PERDIDA];
const VALUE_STAGES: OpportunityStage[] = ['COTIZACION', 'NEGOCIACION', 'GANADA'];
const DATE_STAGES: OpportunityStage[] = ['VISITA_TECNICA', ...VALUE_STAGES];
type FieldEdit = Pick<UpdateOpportunityDto, 'estimatedValue' | 'expectedCloseDate' | 'probability'>;
type FieldChange = { event: CommercialActivityEvent; subject: string };

interface ListFilters {
  stage?: OpportunityStage[]; // COM-020 — repeatable
  accountId?: string;
  ownerId?: string;
  q?: string; // COM-020 — name / account name contains (case-insensitive)
  enterpriseId?: string; // COM-020 — via the account's parent enterprise
  noEnterprise?: boolean; // COM-020 — accounts without a parent enterprise
  /* COM-020 — TRI-STATE on purpose: undefined = legacy behaviour (every stage, what the
     kanban and ActivityTimeline expect); false = open only; true = open + closed within
     the last 90 days by closedAt. */
  includeClosed?: boolean;
}

export type LastUpdateKind =
  | CommercialActivityEvent
  | 'ACCION_AGREGADA'
  | 'ACCION_COMPLETADA'
  | 'ACCION_REABIERTA'
  | 'SISTEMA';

/* COM-022 — both live timestamps share ONE page-scoped raw query. */
interface OpportunityActivitySummary {
  id: string;
  lastMovementAt: Date | null;
  lastUpdateAt: Date;
  lastUpdateKind: LastUpdateKind;
}

// COM-020 — reuses the file's existing CLOSED_STAGES (GANADA/PERDIDA).
const CLOSED_WINDOW_DAYS = 90;

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  /** Anchor a YYYY-MM-DD (or ISO) string to UTC midnight so an @db.Date column
   * never suffers the timezone off-by-one (the RRHH HR-004b convention). */
  private toDateOnly(dateStr: string): Date {
    const d = new Date(dateStr);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** COM-020 — the list (full set, no pagination, updatedAt DESC), extended — never
   * forked: every existing caller keeps its params and its row fields; rows GAIN
   * `account { id, name, enterprise { id, name } | null }` and the DERIVED
   * `lastMovementAt`. `owner` stays `ownerId` (a bare actor UUID, no relation). */
  async findAll(companyId: string, filters: ListFilters = {}) {
    const where: Prisma.OpportunityWhereInput = { companyId };
    const and: Prisma.OpportunityWhereInput[] = [];
    if (filters.stage && filters.stage.length > 0) where.stage = { in: filters.stage };
    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    if (filters.enterpriseId && filters.noEnterprise) {
      throw new BadRequestException('enterpriseId y noEnterprise son excluyentes.');
    }
    if (filters.enterpriseId) where.account = { enterpriseId: filters.enterpriseId };
    if (filters.noEnterprise) where.account = { enterpriseId: null };
    const q = filters.q?.trim();
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { account: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (filters.includeClosed === false) {
      and.push({ stage: { notIn: CLOSED_STAGES } });
    } else if (filters.includeClosed === true) {
      const since = new Date(Date.now() - CLOSED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      and.push({
        OR: [{ stage: { notIn: CLOSED_STAGES } }, { closedAt: { gte: since } }],
      });
    }
    if (and.length > 0) where.AND = and;
    const rows = await this.prisma.opportunity.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        lead: { select: { id: true, name: true } },
        _count: { select: { services: true } },
        account: {
          select: { id: true, name: true, enterprise: { select: { id: true, name: true } } },
        },
      },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const [summaries, pending] = await Promise.all([
      this.activitySummaryByOpportunity(companyId, ids),
      this.prisma.activity.findMany({
        where: {
          companyId,
          opportunityId: { in: ids },
          status: 'PENDIENTE',
          isSystemGenerated: false,
        },
        select: { opportunityId: true, activityDate: true },
      }),
    ]);
    const byId = new Map(summaries.map((row) => [row.id, row]));
    const counts = new Map<string, { pendingActions: number; overdueActions: number }>();
    const today = todayInSantiago();
    for (const action of pending) {
      if (!action.opportunityId) continue;
      const count = counts.get(action.opportunityId) ?? { pendingActions: 0, overdueActions: 0 };
      count.pendingActions += 1;
      if (santiagoDateOf(action.activityDate) < today) count.overdueActions += 1;
      counts.set(action.opportunityId, count);
    }
    return rows.map(({ _count, ...r }) => {
      const summary = byId.get(r.id);
      return {
        ...r,
        valueFromBundle: _count.services > 0,
        lastMovementAt: summary?.lastMovementAt?.toISOString() ?? null,
        ...(counts.get(r.id) ?? { pendingActions: 0, overdueActions: 0 }),
        lastUpdate: {
          at: (summary?.lastUpdateAt ?? r.createdAt).toISOString(),
          kind: summary?.lastUpdateKind ?? ('CREACION' satisfies LastUpdateKind),
        },
      };
    });
  }

  /** COM-020 — "Último movimiento" per opportunity, DERIVED at read time (never stored,
   * never cached): ONE raw query for the whole list — no per-row work, no N+1. The twin
   * of COM-018's lastMovementByAccount: GREATEST of the row's own updatedAt (stage moves,
   * edits), its activities, its notes (COM-016) and its live documents (COM-017).
   * Doctrine: raw SQL ALWAYS carries the explicit "companyId" filter (HARDEN arc).
   * ALERT-001 — PUBLIC so the alerts panel reuses it (one implementation of the derivation). */
  async lastMovementByOpportunity(
    companyId: string,
    opportunityIds: string[],
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (opportunityIds.length === 0) return result;
    const rows = await this.activitySummaryByOpportunity(companyId, opportunityIds);
    for (const row of rows) {
      if (row.lastMovementAt) result.set(row.id, new Date(row.lastMovementAt));
    }
    return result;
  }

  private async activitySummaryByOpportunity(companyId: string, opportunityIds: string[]) {
    return this.prisma.$queryRaw<OpportunityActivitySummary[]>(Prisma.sql`
      SELECT o.id, GREATEST(o."updatedAt", act.last, n.last, d.last) AS "lastMovementAt",
             COALESCE(upd.at, o."createdAt") AS "lastUpdateAt",
             COALESCE(upd.kind, 'CREACION') AS "lastUpdateKind"
      FROM opportunities o
      LEFT JOIN LATERAL (SELECT max("createdAt") AS last FROM activities WHERE "opportunityId" = o.id) act ON true
      LEFT JOIN LATERAL (SELECT max("createdAt") AS last FROM opportunity_notes WHERE "opportunityId" = o.id) n ON true
      LEFT JOIN LATERAL (SELECT max("createdAt") AS last FROM opportunity_documents WHERE "opportunityId" = o.id AND "deletedAt" IS NULL) d ON true
      LEFT JOIN LATERAL (
        SELECT ev.at, ev.kind FROM (
          SELECT a."createdAt" AS at,
                 CASE WHEN a."isSystemGenerated" THEN COALESCE(a."systemEvent"::text, 'SISTEMA')
                      ELSE 'ACCION_AGREGADA' END AS kind,
                 0 AS pri
            FROM activities a WHERE a."opportunityId" = o.id
          UNION ALL
          SELECT a."statusChangedAt",
                 CASE WHEN a."status" = 'HECHA' THEN 'ACCION_COMPLETADA' ELSE 'ACCION_REABIERTA' END,
                 1
            FROM activities a WHERE a."opportunityId" = o.id
              AND a."isSystemGenerated" = false AND a."statusChangedAt" IS NOT NULL
        ) ev ORDER BY ev.at DESC, ev.pri DESC, ev.kind LIMIT 1
      ) upd ON true
      WHERE o."companyId" = ${companyId}::uuid AND o.id = ANY(${opportunityIds}::uuid[])
    `);
  }

  async findOne(id: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, companyId },
      include: { lead: { select: { id: true, name: true } } },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    return opp;
  }

  async create(companyId: string, userId: string, dto: CreateOpportunityDto) {
    await this.assertAccountInCompany(dto.accountId, companyId);
    const stage = dto.stage === undefined ? OpportunityStage.PROSPECTO : dto.stage;
    if (!ACTIVE_STAGES.includes(stage)) {
      throw new BadRequestException(
        'La etapa inicial debe ser Prospecto, Contacto, Visita Técnica, Cotización o Negociación.',
      );
    }
    this.assertRequirements(stage, dto, `Para crear en ${STAGE_LABELS[stage]}`);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      await this.assertOwner(tx, companyId, dto.ownerId);
      const probabilities = await loadStageProbabilities(tx, companyId);
      const created = await tx.opportunity.create({
        data: {
          companyId,
          createdBy: userId,
          accountId: dto.accountId,
          name: dto.name,
          stage,
          estimatedValue:
            dto.estimatedValue != null ? new Prisma.Decimal(dto.estimatedValue) : null,
          probability: dto.probability ?? probabilities[stage],
          expectedCloseDate: dto.expectedCloseDate ? this.toDateOnly(dto.expectedCloseDate) : null,
          ownerId: dto.ownerId ?? null,
          notes: dto.notes ?? null,
        },
      });
      // COM-009 — the create event, in the SAME transaction as the insert.
      await writeSystemActivity(tx, {
        companyId,
        accountId: dto.accountId,
        opportunityId: created.id,
        userId,
        event: 'CREACION',
        subject: 'Oportunidad creada',
        detail: stage === 'PROSPECTO' ? null : `Etapa inicial: ${STAGE_LABELS[stage]}`,
      });
      return created;
    });
  }

  /** General-field update. Stage edits are REJECTED here — they must go through
   * changeStage() so the transition rules are the only path. */
  async update(id: string, companyId: string, userId: string, dto: UpdateOpportunityDto) {
    if (dto.stage !== undefined) {
      throw new BadRequestException(
        'Los cambios de etapa se realizan vía PATCH /:id/stage, no en la edición general.',
      );
    }
    if (dto.accountId) await this.assertAccountInCompany(dto.accountId, companyId);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const editsOrigin = dto.leadId !== undefined || dto.accountId !== undefined;
      if (editsOrigin) await lockLeadOpportunity(tx, companyId, id);
      const existing = await this.findForMutation(tx, id, companyId);
      const effectiveStage =
        existing.stage === 'EN_PAUSA' ? existing.previousStage : existing.stage;
      if (effectiveStage && dto.estimatedValue === null && VALUE_STAGES.includes(effectiveStage)) {
        throw new BadRequestException(
          'No puedes quitar el valor estimado en Cotización o etapas posteriores.',
        );
      }
      if (
        effectiveStage &&
        dto.expectedCloseDate !== undefined &&
        !dto.expectedCloseDate &&
        DATE_STAGES.includes(effectiveStage)
      ) {
        throw new BadRequestException(
          'No puedes quitar la fecha estimada de cierre desde Visita Técnica en adelante.',
        );
      }
      if (dto.probability !== undefined && CLOSED_STAGES.includes(existing.stage)) {
        throw new BadRequestException(
          'La probabilidad no se edita en oportunidades ganadas o perdidas.',
        );
      }
      await this.assertManualValue(tx, companyId, id, dto);
      await this.assertOwner(tx, companyId, dto.ownerId);
      const data = this.fieldData(dto);
      if (dto.accountId !== undefined) data.accountId = dto.accountId;
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.ownerId !== undefined) data.ownerId = dto.ownerId;
      if (dto.notes !== undefined) data.notes = dto.notes;
      const changes = this.fieldChanges(existing, dto);
      if (editsOrigin) {
        const beforeId = existing.leadId ?? null;
        const afterId = dto.leadId === undefined ? beforeId : dto.leadId;
        const change = await prepareLeadChange(
          tx,
          companyId,
          dto.accountId ?? existing.accountId,
          beforeId,
          afterId,
        );
        if (dto.leadId !== undefined) data.leadId = dto.leadId;
        if (change) changes.push(change);
      }
      if (dto.ownerId !== undefined && dto.ownerId !== existing.ownerId) {
        const before = existing.ownerId
          ? await this.ownerName(tx, companyId, existing.ownerId)
          : null;
        const after = dto.ownerId ? await this.ownerName(tx, companyId, dto.ownerId) : null;
        if (before !== null || after !== null) {
          changes.push({
            event: 'RESPONSABLE',
            subject:
              before === null
                ? `Responsable asignado: ${after}`
                : after === null
                  ? `Responsable quitado (era ${before})`
                  : `Responsable: ${before} → ${after}`,
          });
        }
      }
      const updated = await tx.opportunity.update({ where: { id, companyId }, data });
      await this.writeFieldChanges(tx, companyId, userId, updated.accountId, id, changes);
      return updated;
    });
  }

  /** THE canonical stage-transition path — enforces the pipeline rules. */
  async changeStage(id: string, companyId: string, userId: string, dto: ChangeStageDto) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const opp = await this.findForMutation(tx, id, companyId);
      const from = opp.stage;
      const to = dto.stage;

      // Rule 3 — GANADA/PERDIDA are semi-terminal: no ordinary stage move out of them.
      if (CLOSED_STAGES.includes(from)) {
        throw new BadRequestException(
          'La oportunidad está cerrada (GANADA/PERDIDA). Usa "reabrir" para reactivarla.',
        );
      }
      if (to === from) {
        throw new BadRequestException(`La oportunidad ya está en ${STAGE_LABELS[from]}.`);
      }

      const reference = from === 'EN_PAUSA' ? (opp.previousStage ?? 'NEGOCIACION') : from;
      const movingBack =
        ACTIVE_STAGES.includes(to) && ACTIVE_STAGES.indexOf(to) < ACTIVE_STAGES.indexOf(reference);
      const reason = movingBack ? this.requireReason(dto.reason, 'Retroceder de etapa') : null;
      const context =
        to === 'GANADA'
          ? 'Para marcar como Ganada'
          : from === 'EN_PAUSA' && ACTIVE_STAGES.includes(to)
            ? `Para reanudar en ${STAGE_LABELS[to]}`
            : `Para mover a ${STAGE_LABELS[to]}`;
      const { data, changes } = await this.prepareEntry(tx, companyId, opp, to, dto, context);
      data.stage = to;
      // COM-009 — the timeline text for this movement (Spanish display labels). Computed
      // alongside `data`; written in the SAME transaction as the update below.
      let subject: string;
      let event: CommercialActivityEvent;

      if (to === OpportunityStage.PERDIDA) {
        // Rule 2 — losing requires a categorized reason; OTRO also requires detail.
        if (!dto.lostReason) {
          throw new BadRequestException(
            'Para marcar PERDIDA debes indicar el motivo (lostReason).',
          );
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
        event = 'PERDIDA';
        subject = `Oportunidad perdida — ${LOST_REASON_LABELS[dto.lostReason]}`;
        if (dto.lostReason === LostReason.OTRO && detail) subject += `: ${detail}`;
      } else if (to === OpportunityStage.GANADA) {
        // COM-023 required fields were checked; handoff prerequisites remain separate.
        data.closedAt = new Date();
        data.previousStage = null;
        event = 'GANADA';
        subject = 'Oportunidad ganada';
      } else if (to === OpportunityStage.EN_PAUSA) {
        // Rule 4 — pause only FROM an active stage; remember where it was.
        if (!ACTIVE_STAGES.includes(from)) {
          throw new BadRequestException('Solo puedes pausar una oportunidad en una etapa activa.');
        }
        data.previousStage = from;
        event = 'PAUSA';
        subject = 'Oportunidad en pausa';
        // closedAt untouched by a pause
      } else {
        // to is one of the five active stages — Rule 1 free movement, and Rule 4
        // resume-elsewhere: moving out of EN_PAUSA to any active stage clears the
        // pause context (that movement reads as a resume, not a plain stage change).
        if (from === OpportunityStage.EN_PAUSA) {
          data.previousStage = null;
          event = 'REANUDACION';
          subject = `Oportunidad reanudada (a ${STAGE_LABELS[to]})`;
        } else {
          event = 'CAMBIO_ETAPA';
          subject = `Etapa: ${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}`;
        }
      }

      const updated = await tx.opportunity.update({ where: { id, companyId }, data });
      await this.writeFieldChanges(tx, companyId, userId, opp.accountId, id, changes);
      await writeSystemActivity(tx, {
        companyId,
        accountId: opp.accountId,
        opportunityId: id,
        userId,
        event,
        subject,
        detail: reason ? `Motivo: ${reason}` : null,
      });
      if (to === 'GANADA') await this.promoteAccount(tx, companyId, userId, opp);
      return updated;
    });
  }

  /** Rule 4 — dedicated resume: EN_PAUSA → previousStage, clearing previousStage. */
  async resume(id: string, companyId: string, userId: string, dto: ResumeOpportunityDto = {}) {
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const opp = await this.findForMutation(tx, id, companyId);
      if (opp.stage !== OpportunityStage.EN_PAUSA) {
        throw new BadRequestException('Solo se puede reanudar una oportunidad EN_PAUSA.');
      }
      const target = opp.previousStage ?? OpportunityStage.NEGOCIACION;
      const { data, changes } = await this.prepareEntry(
        tx,
        companyId,
        opp,
        target,
        dto,
        `Para reanudar en ${STAGE_LABELS[target]}`,
      );
      const updated = await tx.opportunity.update({
        where: { id, companyId },
        data: { ...data, stage: target, previousStage: null },
      });
      await this.writeFieldChanges(tx, companyId, userId, opp.accountId, id, changes);
      await writeSystemActivity(tx, {
        companyId,
        accountId: opp.accountId,
        opportunityId: id,
        userId,
        event: 'REANUDACION',
        subject: `Oportunidad reanudada (a ${STAGE_LABELS[target]})`,
      });
      return updated;
    });
  }

  /** Reopen preserves lost reason history and never reverts the account's status. */
  async reopen(id: string, companyId: string, userId: string, dto?: ReopenOpportunityDto) {
    const reason = this.requireReason(dto?.reason, 'Reabrir');
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const opp = await this.findForMutation(tx, id, companyId);
      if (!CLOSED_STAGES.includes(opp.stage)) {
        throw new BadRequestException('Solo se puede reabrir una oportunidad GANADA o PERDIDA.');
      }
      const target = OpportunityStage.NEGOCIACION;
      const { data, changes } = await this.prepareEntry(
        tx,
        companyId,
        opp,
        target,
        dto ?? {},
        'Para reabrir en Negociación',
      );
      const updated = await tx.opportunity.update({
        where: { id, companyId },
        data: { ...data, stage: target, closedAt: null },
      });
      await this.writeFieldChanges(tx, companyId, userId, opp.accountId, id, changes);
      await writeSystemActivity(tx, {
        companyId,
        accountId: opp.accountId,
        opportunityId: id,
        userId,
        event: 'REAPERTURA',
        subject: 'Oportunidad reabierta',
        detail: `Motivo: ${reason}`,
      });
      return updated;
    });
  }

  private async findForMutation(tx: Prisma.TransactionClient, id: string, companyId: string) {
    const opp = await tx.opportunity.findFirst({ where: { id, companyId } });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    return opp;
  }

  private assertRequirements(
    stage: OpportunityStage,
    fields: {
      estimatedValue?: Prisma.Decimal | number | null;
      expectedCloseDate?: Date | string | null;
    },
    context: string,
  ) {
    const missing: string[] = [];
    if (VALUE_STAGES.includes(stage) && fields.estimatedValue == null)
      missing.push('valor estimado');
    if (DATE_STAGES.includes(stage) && !fields.expectedCloseDate)
      missing.push('fecha estimada de cierre');
    if (missing.length) throw new BadRequestException(`${context} falta: ${missing.join(' y ')}.`);
  }

  private requireReason(value: string | undefined, action: string): string {
    const reason = typeof value === 'string' ? value.trim() : '';
    if (!reason) throw new BadRequestException(`${action} requiere un motivo.`);
    if (reason.length < 3 || reason.length > 500) {
      throw new BadRequestException(`${action} requiere un motivo de entre 3 y 500 caracteres.`);
    }
    return reason;
  }

  private async assertManualValue(
    tx: Prisma.TransactionClient,
    companyId: string,
    id: string,
    dto: FieldEdit,
  ) {
    if (dto.estimatedValue === undefined) return;
    const count = await tx.opportunityService.count({ where: { companyId, opportunityId: id } });
    if (count > 0) {
      throw new BadRequestException(
        'El valor estimado se deriva del bundle de servicios (suma de cantidad × precio); edita las líneas del bundle, no el valor directamente.',
      );
    }
  }

  private fieldData(dto: FieldEdit): Prisma.OpportunityUncheckedUpdateInput {
    const data: Prisma.OpportunityUncheckedUpdateInput = {};
    if (dto.estimatedValue !== undefined)
      data.estimatedValue =
        dto.estimatedValue === null ? null : new Prisma.Decimal(dto.estimatedValue);
    if (dto.expectedCloseDate !== undefined)
      data.expectedCloseDate = dto.expectedCloseDate
        ? this.toDateOnly(dto.expectedCloseDate)
        : null;
    if (dto.probability !== undefined) data.probability = dto.probability;
    return data;
  }

  private async prepareEntry(
    tx: Prisma.TransactionClient,
    companyId: string,
    opp: Opportunity,
    target: OpportunityStage,
    dto: ResumeOpportunityDto,
    context: string,
  ) {
    await this.assertManualValue(tx, companyId, opp.id, dto);
    this.assertRequirements(
      target,
      {
        estimatedValue: dto.estimatedValue !== undefined ? dto.estimatedValue : opp.estimatedValue,
        expectedCloseDate:
          dto.expectedCloseDate !== undefined ? dto.expectedCloseDate : opp.expectedCloseDate,
      },
      context,
    );
    const probabilities = await loadStageProbabilities(tx, companyId);
    return {
      data: { ...this.fieldData(dto), probability: probabilities[target] },
      changes: this.fieldChanges(opp, dto),
    };
  }

  private fieldChanges(existing: Opportunity, dto: FieldEdit): FieldChange[] {
    const changes: FieldChange[] = [];
    if (dto.estimatedValue !== undefined) {
      const before = existing.estimatedValue;
      const after = dto.estimatedValue === null ? null : new Prisma.Decimal(dto.estimatedValue);
      const equal = before == null ? after === null : after !== null && before.equals(after);
      if (!equal)
        this.recordChange(
          changes,
          'VALOR_ESTIMADO',
          'Valor estimado',
          'definido',
          before == null ? null : formatCLP(before),
          after === null ? null : formatCLP(after),
        );
    }
    if (dto.expectedCloseDate !== undefined) {
      const before = existing.expectedCloseDate;
      const after = dto.expectedCloseDate ? this.toDateOnly(dto.expectedCloseDate) : null;
      if (
        (before?.toISOString().slice(0, 10) ?? null) !== (after?.toISOString().slice(0, 10) ?? null)
      ) {
        this.recordChange(
          changes,
          'FECHA_CIERRE',
          'Fecha de cierre',
          'definida',
          before == null ? null : formatDateOnly(before),
          after === null ? null : formatDateOnly(after),
        );
      }
    }
    if (dto.probability !== undefined && (existing.probability ?? null) !== dto.probability) {
      this.recordChange(
        changes,
        'PROBABILIDAD',
        'Probabilidad',
        'definida',
        existing.probability == null ? null : `${existing.probability}%`,
        dto.probability === null ? null : `${dto.probability}%`,
      );
    }
    return changes;
  }

  private recordChange(
    changes: FieldChange[],
    event: CommercialActivityEvent,
    label: string,
    ending: 'definido' | 'definida',
    before: string | null,
    after: string | null,
  ) {
    const subject =
      before === null
        ? `${label} ${ending}: ${after}`
        : after === null
          ? `${label} ${ending === 'definido' ? 'eliminado' : 'eliminada'} (era ${before})`
          : `${label}: ${before} → ${after}`;
    changes.push({ event, subject });
  }

  private async writeFieldChanges(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    accountId: string,
    opportunityId: string,
    changes: FieldChange[],
  ) {
    for (const change of changes) {
      await writeSystemActivity(tx, { companyId, accountId, opportunityId, userId, ...change });
    }
  }

  private async assertOwner(
    tx: Prisma.TransactionClient,
    companyId: string,
    ownerId?: string | null,
  ) {
    if (ownerId == null) return;
    const member = await tx.membership.findFirst({
      where: { companyId, userId: ownerId, isActive: true },
      select: { userId: true },
    });
    if (!member)
      throw new BadRequestException('El responsable debe ser un miembro activo de la empresa.');
  }

  private async ownerName(tx: Prisma.TransactionClient, companyId: string, userId: string) {
    const member = await tx.membership.findFirst({
      where: { companyId, userId },
      select: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    return member ? memberDisplayName(member.user) : 'Usuario desconocido';
  }

  private async promoteAccount(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    opp: Opportunity,
  ) {
    const account = await tx.account.findFirst({
      where: { companyId, id: opp.accountId },
      select: { status: true },
    });
    if (!account || (account.status !== 'PROSPECTO' && account.status !== 'INACTIVA')) return;
    // Conditional update prevents duplicate promotions if two opportunities win together.
    const promoted = await tx.account.updateMany({
      where: { companyId, id: opp.accountId, status: account.status },
      data: { status: 'ACTIVA' },
    });
    if (!promoted.count) return;
    await writeSystemActivity(tx, {
      companyId,
      accountId: opp.accountId,
      opportunityId: null,
      userId,
      event: 'CUENTA_CLIENTE',
      subject: `Cuenta pasa a Cliente (antes ${account.status === 'PROSPECTO' ? 'Prospecto' : 'Inactiva'})`,
      detail: `Oportunidad ganada: ${opp.name}`,
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

  /** COM-013b — the Comercial→Operaciones handoff. Validates the critical rule, emits a
   * self-contained `comercial.opportunity-won` event (the Operaciones listener creates
   * the ServiceOrder from the payload — no cross-module read), and stamps handoffAt.
   *
   * ORDERING (guarantees "handoffAt set ⇒ event emitted"): we EMIT FIRST and only stamp
   * handoffAt after emit() returns a persisted event-row id. DomainEventsService.emit
   * persists the domain_event row then returns its id (broadcast is async, and the retry
   * cron re-runs failed handlers), so a non-null id means the event WILL be delivered.
   * A failed emit leaves handoffAt null → the operator can retry; the listener's
   * sourceOpportunityId dedup makes a retry's second event a no-op if the first somehow
   * created the order. (The naive "stamp handoffAt then emit" would risk an orphan:
   * handoffAt set with no event, and the already-sent 409 blocking recovery.)
   *
   * The endpoint returns "handoff initiated" — the ServiceOrder is created ASYNCHRONOUSLY
   * by the listener; we do NOT wait for it. */
  async sendToOperations(companyId: string, userId: string, id: string) {
    const opp = await this.findOne(id, companyId);

    // Already-sent guard — never re-emit (belt-and-suspenders: the listener also dedups
    // on sourceOpportunityId and the event row dedups on its unique).
    if (opp.handoffAt) {
      throw new ConflictException(
        `La oportunidad ya fue enviada a Operaciones el ${opp.handoffAt.toISOString().slice(0, 10)}.`,
      );
    }

    // The scope is the ACCEPTED quote's frozen lines (COM-010 serviceName snapshots).
    const quote = await this.prisma.quote.findFirst({
      where: { companyId, opportunityId: id, status: QuoteStatus.ACEPTADA },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    });

    // Critical rule (V1) — collect everything missing so the 4xx lists it.
    const missing: string[] = [];
    if (opp.stage !== OpportunityStage.GANADA) missing.push('la oportunidad debe estar Ganada');
    if (!opp.ownerId) missing.push('requiere un responsable comercial');
    if (!quote) missing.push('requiere una cotización aceptada');
    else if (quote.lines.length === 0) missing.push('el alcance de la cotización está vacío');
    if (missing.length > 0) {
      throw new BadRequestException(`No se puede enviar a Operaciones: ${missing.join('; ')}.`);
    }

    const acceptedQuote = quote!;
    const account = await this.prisma.account.findFirst({
      where: { id: opp.accountId, companyId },
      select: { name: true, counterpartyId: true, paymentTermDays: true },
    });

    // Stable timestamp — used BOTH as the event's occurredAt (idempotency key) and as
    // handoffAt, so an app-level re-emit dedups instead of duplicating.
    const occurredAt = new Date();
    const scopeLines = acceptedQuote.lines.map((l) => ({
      serviceName: l.serviceName,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    }));

    const eventId = await this.domainEvents.emit({
      type: 'comercial.opportunity-won',
      companyId,
      occurredAt: occurredAt.toISOString(),
      opportunityId: id, // aggregateId — a real UUID (never composite)
      quoteId: acceptedQuote.id,
      clientName: account?.name ?? 'Cliente',
      counterpartyId: account?.counterpartyId ?? null,
      title: opp.name,
      description: opp.notes ?? null,
      scopeLines,
      netAmount: Number(acceptedQuote.netAmount),
      taxAmount: Number(acceptedQuote.taxAmount),
      totalAmount: Number(acceptedQuote.totalAmount),
      currency: 'CLP',
      ownerId: opp.ownerId,
      // COM-014 — carry the account's payment term so the Finance listener stays payload-only.
      paymentTermDays: account?.paymentTermDays ?? 30,
    });
    if (!eventId) {
      // emit() swallowed the row (persistence failed or an exact-duplicate re-emit). Do
      // NOT stamp handoffAt — leave the opportunity resendable.
      throw new InternalServerErrorException(
        'No se pudo iniciar el handoff (el evento no se emitió). Intenta nuevamente.',
      );
    }

    // Event persisted → stamp handoffAt (the invariant "handoffAt set ⇒ event emitted").
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.opportunity.update({ where: { id }, data: { handoffAt: occurredAt } });
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
}
