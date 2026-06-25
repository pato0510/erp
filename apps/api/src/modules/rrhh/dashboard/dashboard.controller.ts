import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  EmployeeCompensationSubject,
  EmployeeSubject,
} from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

/* HR-006 — RRHH dashboard (read-only aggregations over existing data). EVERY
 * endpoint declares @CheckPolicies (PoliciesGuard fails OPEN). Two endpoints,
 * gated independently so the sensitive payroll aggregate reaches exactly the
 * compensation-readers:
 *   - /overview  → `read Employee`            (MANAGER/ADMIN/SUPER_ADMIN)
 *   - /payroll   → `read EmployeeCompensation`(+ ACCOUNTANT; NOT VIEWER/ANALYST)
 * The frontend calls both and renders whatever each returns — so masa salarial
 * simply never reaches a caller who can't read compensation. */
@Controller('rrhh/dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @CheckPolicies((ability) => ability.can('read', EmployeeSubject))
  overview(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getOverview(companyId, user.id);
  }

  @Get('payroll')
  @CheckPolicies((ability) => ability.can('read', EmployeeCompensationSubject))
  payroll(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getPayroll(companyId, user.id);
  }
}
