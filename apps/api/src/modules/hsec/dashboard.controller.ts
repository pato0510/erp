import { Controller, Get, UseGuards } from '@nestjs/common';
import { HsecIncidentSubject } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { HsecDashboardService } from './dashboard.service';

/* HSEC-010 — the dashboard aggregate, gated `read HsecIncident` (recorded choice: the
 * aggregate is module-reader-gated; the founder-signed matrix is UNIFORM across all five
 * HSEC subjects, so any single subject gates exactly the same set — MANAGER/ADMIN/
 * SUPER_ADMIN in, everyone else floored. The roster endpoint set the precedent). */
@Controller('hsec')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class HsecDashboardController {
  constructor(private readonly service: HsecDashboardService) {}

  @Get('dashboard')
  @CheckPolicies((ability) => ability.can('read', HsecIncidentSubject))
  dashboard(@CurrentCompany() companyId: string) {
    return this.service.getDashboard(companyId);
  }
}
