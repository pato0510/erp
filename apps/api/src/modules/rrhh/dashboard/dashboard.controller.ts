import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  EmployeeCompensationSubject,
  EmployeeContractSubject,
  EmployeeDocumentSubject,
  EmployeeSubject,
} from '../../common/casl/casl-ability.factory';
import type { AppAbility } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

/* HR-006 — RRHH dashboard (read-only aggregations over existing data). EVERY
 * endpoint declares @CheckPolicies (PoliciesGuard fails OPEN). Two endpoints,
 * gated independently:
 *   - /overview  → `read Employee` (MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT). The
 *     PAYLOAD is then scoped per caller by CASL ability: the per-person document
 *     rows (alertasVencimiento) and the contract-renewal block reach only
 *     Documentos/Contratos readers, so ACCOUNTANT (❌ on both) receives the
 *     worker-domain data + aggregate document counts, but not per-person rows.
 *   - /payroll   → `read EmployeeCompensation` (+ ACCOUNTANT; NOT VIEWER/ANALYST),
 *     company-wide aggregate only.
 * The frontend calls both and renders whatever each returns. */
@Controller('rrhh/dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @CheckPolicies((ability) => ability.can('read', EmployeeSubject))
  overview(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    /* Access is already enforced by @CheckPolicies above; here we only SHAPE the
       payload to the caller's domain reads. ACCOUNTANT reaches /overview via
       `read Employee` but is ❌ on Documentos/Contratos, so it must not receive
       per-person document rows or contract-renewal data through this window. */
    return this.service.getOverview(companyId, user.id, {
      canReadDocuments: ability.can('read', EmployeeDocumentSubject),
      canReadContracts: ability.can('read', EmployeeContractSubject),
    });
  }

  @Get('payroll')
  @CheckPolicies((ability) => ability.can('read', EmployeeCompensationSubject))
  payroll(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getPayroll(companyId, user.id);
  }
}
