import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccountSubject, OpportunitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

/* COM-019 — the Comercial dashboard (read-only, derived live). ONE endpoint, gated on
 * BOTH `read Opportunity` AND `read Account` in a single @CheckPolicies lambda (the
 * decorator takes (ability) => boolean handlers, so the conjunction is one handler):
 * MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT pass; ANALYST/VIEWER are floored on both.
 * PoliciesGuard fails OPEN — the decorator is the gate. Reads are company-scoped. */
@Controller('comercial/dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @CheckPolicies(
    (ability) => ability.can('read', OpportunitySubject) && ability.can('read', AccountSubject),
  )
  getDashboard(@CurrentCompany() companyId: string, @Query() query: DashboardQueryDto) {
    return this.service.getDashboard(companyId, query);
  }
}
