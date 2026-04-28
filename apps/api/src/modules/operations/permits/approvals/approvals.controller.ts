import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PermitApprovalSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import {
  ApproveStepDto,
  FilterPendingApprovalsDto,
  RejectStepDto,
  SkipStepDto,
} from './dto/approval-action.dto';
import { ApprovalActionsService, PermitTargetKind } from './approval-actions.service';

@Controller('operations/permit-approvals')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ApprovalsController {
  constructor(
    private readonly service: ApprovalActionsService,
    private readonly prisma: PrismaService,
  ) {}

  /* Audit-style listing for ADMIN — returns every recorded approval
     across the company. Filters and pagination are intentionally
     light here; the dashboard uses the per-user pending endpoint
     which has its own view-model. */
  @Get()
  @CheckPolicies((ability) => ability.can('read', PermitApprovalSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.prisma.permitApproval.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      include: {
        approvalStep: { select: { name: true, requiredRoles: true } },
      },
    });
  }

  @Get('pending')
  @CheckPolicies((ability) => ability.can('read', PermitApprovalSubject))
  pending(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query() filters: FilterPendingApprovalsDto,
  ) {
    return this.service.getPendingApprovalsForUser(companyId, user.id, filters);
  }

  @Get('pending-counts')
  @CheckPolicies((ability) => ability.can('read', PermitApprovalSubject))
  pendingCounts(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getApprovalCountsForUser(companyId, user.id);
  }

  @Get('permit/:permitId')
  @CheckPolicies((ability) => ability.can('read', PermitApprovalSubject))
  async timelineForPermit(
    @CurrentCompany() companyId: string,
    @Param('permitId') permitId: string,
    @Query('kind') kind: string | undefined,
  ) {
    const k = await this.resolvePermitKind(companyId, permitId, kind);
    return this.service.getTimelineForPermit(companyId, permitId, k);
  }

  @Post('permit/:permitId/approve')
  @CheckPolicies((ability) => ability.can('approve', PermitApprovalSubject))
  async approve(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Param('permitId') permitId: string,
    @Query('kind') kind: string | undefined,
    @Body() dto: ApproveStepDto,
    @Req() req: Request,
  ) {
    const k = await this.resolvePermitKind(companyId, permitId, kind);
    return this.service.approveStep(companyId, user.id, permitId, k, dto, {
      ip: this.captureIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post('permit/:permitId/reject')
  @CheckPolicies((ability) => ability.can('reject', PermitApprovalSubject))
  async reject(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Param('permitId') permitId: string,
    @Query('kind') kind: string | undefined,
    @Body() dto: RejectStepDto,
    @Req() req: Request,
  ) {
    const k = await this.resolvePermitKind(companyId, permitId, kind);
    return this.service.rejectStep(companyId, user.id, permitId, k, dto, {
      ip: this.captureIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post('permit/:permitId/skip')
  @CheckPolicies((ability) => ability.can('skip', PermitApprovalSubject))
  async skip(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Param('permitId') permitId: string,
    @Query('kind') kind: string | undefined,
    @Body() dto: SkipStepDto,
  ) {
    const k = await this.resolvePermitKind(companyId, permitId, kind);
    return this.service.skipStep(companyId, user.id, permitId, k, dto);
  }

  /* Resolves whether the path param is a work_permit or a permit row.
     Frontend may pass `?kind=work-permit|external-permit` to skip the
     extra lookup; otherwise we probe both tables. */
  private async resolvePermitKind(
    companyId: string,
    permitId: string,
    hint: string | undefined,
  ): Promise<PermitTargetKind> {
    if (hint === 'work-permit' || hint === 'external-permit') return hint;
    const [wp, ep] = await Promise.all([
      this.prisma.workPermit.findFirst({
        where: { id: permitId, companyId },
        select: { id: true },
      }),
      this.prisma.permit.findFirst({
        where: { id: permitId, companyId },
        select: { id: true },
      }),
    ]);
    if (wp) return 'work-permit';
    if (ep) return 'external-permit';
    throw new NotFoundException('Permiso no encontrado.');
  }

  private captureIp(req: Request): string | null {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
    if (Array.isArray(fwd) && fwd[0]) return fwd[0];
    return req.ip ?? null;
  }
}
