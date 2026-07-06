import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /** Rule 3a — the account timeline: the account's activities INCLUDING those linked
   * to its opportunities. Every activity carries the account's id (opportunity-linked
   * ones derive/keep it), so a plain accountId filter already covers them. DESC. */
  async findAllByAccount(companyId: string, accountId: string, limit?: number) {
    await this.assertAccountInCompany(accountId, companyId);
    return this.prisma.activity.findMany({
      where: { companyId, accountId },
      orderBy: [{ activityDate: 'desc' }],
      take: this.clampLimit(limit),
    });
  }

  /** Rule 3b — the opportunity timeline: only that opportunity's activities. DESC. */
  async findAllByOpportunity(companyId: string, opportunityId: string, limit?: number) {
    await this.assertOpportunityInCompany(opportunityId, companyId);
    return this.prisma.activity.findMany({
      where: { companyId, opportunityId },
      orderBy: [{ activityDate: 'desc' }],
      take: this.clampLimit(limit),
    });
  }

  /** Rule 1 — CREATE a manual activity. The account is identified directly
   * (accountId) OR DERIVED from a supplied opportunity (created "from" the deal —
   * never asked twice). A supplied opportunity must exist, be in this company AND
   * belong to the resolved account. isSystemGenerated is NEVER accepted from input —
   * forced false (only COM-009 creates system entries). */
  async create(companyId: string, userId: string, dto: CreateActivityDto) {
    let accountId = dto.accountId;
    if (dto.opportunityId) {
      const opp = await this.prisma.opportunity.findFirst({
        where: { id: dto.opportunityId, companyId },
        select: { id: true, accountId: true },
      });
      if (!opp) throw new BadRequestException('Oportunidad no encontrada en esta empresa.');
      if (accountId && accountId !== opp.accountId) {
        throw new BadRequestException('La oportunidad no pertenece a la cuenta indicada.');
      }
      accountId = accountId ?? opp.accountId; // derive when created from an opportunity
    }
    if (!accountId) {
      throw new BadRequestException('Debes indicar una cuenta o una oportunidad.');
    }
    await this.assertAccountInCompany(accountId, companyId);

    const resolvedAccountId = accountId;
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.activity.create({
        data: {
          companyId,
          createdBy: userId,
          accountId: resolvedAccountId,
          opportunityId: dto.opportunityId ?? null,
          type: dto.type,
          subject: dto.subject,
          detail: dto.detail ?? null,
          activityDate: dto.activityDate ? new Date(dto.activityDate) : new Date(),
          isSystemGenerated: false, // NEVER from input — manual activities only in COM-008
        },
      });
    });
  }

  /** Rule 2 — UPDATE editable fields (type, subject, detail, activityDate,
   * opportunityId). accountId is NOT editable. A system-generated activity cannot be
   * updated at all (the guard exists NOW even though none can be created yet). A
   * (re)linked opportunity is revalidated against the activity's FIXED account;
   * opportunityId=null unlinks. */
  async update(companyId: string, userId: string, id: string, dto: UpdateActivityDto) {
    const existing = await this.findActivity(id, companyId);
    this.assertMutable(existing);

    if (dto.opportunityId) {
      const opp = await this.prisma.opportunity.findFirst({
        where: { id: dto.opportunityId, companyId },
        select: { id: true, accountId: true },
      });
      if (!opp) throw new BadRequestException('Oportunidad no encontrada en esta empresa.');
      if (opp.accountId !== existing.accountId) {
        throw new BadRequestException('La oportunidad no pertenece a la cuenta de esta actividad.');
      }
    }

    const data: Prisma.ActivityUncheckedUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.detail !== undefined) data.detail = dto.detail;
    if (dto.activityDate !== undefined) data.activityDate = new Date(dto.activityDate);
    if (dto.opportunityId !== undefined) data.opportunityId = dto.opportunityId; // null = unlink

    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.activity.update({ where: { id }, data });
    });
  }

  /** Rule 2 — DELETE a manual activity. System-generated rows are immutable. */
  async remove(companyId: string, userId: string, id: string) {
    const existing = await this.findActivity(id, companyId);
    this.assertMutable(existing);
    return this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      return tx.activity.delete({ where: { id } });
    });
  }

  /** COM-009 guard, live NOW: system-generated activities are a historical record and
   * cannot be edited or deleted. No system activity can be created yet, but the guard
   * is enforced so COM-009 can rely on it. */
  private assertMutable(activity: { isSystemGenerated: boolean }) {
    if (activity.isSystemGenerated) {
      throw new ConflictException(
        'Las actividades generadas por el sistema son un registro histórico: no pueden editarse ni eliminarse.',
      );
    }
  }

  private async findActivity(id: string, companyId: string) {
    const activity = await this.prisma.activity.findFirst({ where: { id, companyId } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    return activity;
  }

  private async assertAccountInCompany(accountId: string, companyId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId },
      select: { id: true },
    });
    if (!account) throw new BadRequestException('Cuenta no encontrada en esta empresa.');
  }

  private async assertOpportunityInCompany(opportunityId: string, companyId: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, companyId },
      select: { id: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
  }

  private clampLimit(limit?: number) {
    if (!limit || limit <= 0) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
  }
}
