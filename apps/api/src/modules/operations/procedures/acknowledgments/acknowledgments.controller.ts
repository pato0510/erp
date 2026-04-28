import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ProcedureAcknowledgmentSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { AcknowledgmentsService } from './acknowledgments.service';
import { AcknowledgeDto, ExemptUserDto, FilterAcknowledgmentsDto } from './dto/workflow.dto';

@Controller('operations/acknowledgments')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AcknowledgmentsController {
  constructor(private readonly service: AcknowledgmentsService) {}

  @Get('my-pending')
  @CheckPolicies((ability) => ability.can('read', ProcedureAcknowledgmentSubject))
  myPending(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getMyPending(companyId, user.id);
  }

  @Get('my-pending-count')
  @CheckPolicies((ability) => ability.can('read', ProcedureAcknowledgmentSubject))
  myPendingCount(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getMyPendingCount(companyId, user.id);
  }

  @Get('company-coverage')
  @CheckPolicies((ability) => ability.can('manage', ProcedureAcknowledgmentSubject))
  companyCoverage(@CurrentCompany() companyId: string) {
    return this.service.getCompanyCoverage(companyId);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', ProcedureAcknowledgmentSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query() filters: FilterAcknowledgmentsDto,
  ) {
    return this.service.findAll(companyId, user.id, filters);
  }

  @Get('coverage/:procedureId')
  @CheckPolicies((ability) => ability.can('read', ProcedureAcknowledgmentSubject))
  procedureCoverage(
    @Param('procedureId') procedureId: string,
    @CurrentCompany() companyId: string,
  ) {
    return this.service.getProcedureCoverage(companyId, procedureId);
  }

  @Get('user/:userId/coverage')
  @CheckPolicies((ability) => ability.can('read', ProcedureAcknowledgmentSubject))
  userCoverage(@Param('userId') userId: string, @CurrentCompany() companyId: string) {
    return this.service.getUserCoverage(companyId, userId);
  }

  @Post(':procedureId/acknowledge')
  @CheckPolicies((ability) => ability.can('acknowledge', ProcedureAcknowledgmentSubject))
  acknowledge(
    @Param('procedureId') procedureId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AcknowledgeDto,
    @Req() req: Request,
  ) {
    return this.service.acknowledge(companyId, user.id, procedureId, dto, {
      ip: this.captureIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Post(':procedureId/exempt/:userId')
  @CheckPolicies((ability) => ability.can('exempt', ProcedureAcknowledgmentSubject))
  exempt(
    @Param('procedureId') procedureId: string,
    @Param('userId') targetUserId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ExemptUserDto,
  ) {
    return this.service.exempt(companyId, user.id, procedureId, targetUserId, dto);
  }

  @Post(':procedureId/reapply/:userId')
  @CheckPolicies((ability) => ability.can('exempt', ProcedureAcknowledgmentSubject))
  reapply(
    @Param('procedureId') procedureId: string,
    @Param('userId') targetUserId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.reapply(companyId, user.id, procedureId, targetUserId);
  }

  private captureIp(req: Request): string | null {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
    if (Array.isArray(fwd) && fwd[0]) return fwd[0];
    return req.ip ?? null;
  }
}
