import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OpportunitySubject, QuoteSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AlertsService } from './alerts.service';

/* ALERT-001 — the Comercial alerts panel (read-only, derived live). ONE endpoint, gated on
 * BOTH `read Opportunity` AND `read Quote` in a single @CheckPolicies lambda (the COM-019
 * idiom): MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT pass; ANALYST/VIEWER are floored on both.
 * ?summary=true returns only the counts (the sidebar badge). PoliciesGuard fails OPEN —
 * the decorator is the gate. */
@Controller('comercial/alerts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @CheckPolicies(
    (ability) => ability.can('read', OpportunitySubject) && ability.can('read', QuoteSubject),
  )
  getAlerts(@CurrentCompany() companyId: string, @Query('summary') summary?: string) {
    return this.service.getAlerts(companyId, summary === 'true');
  }
}
