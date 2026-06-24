import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { EmployeeSubject } from '../common/casl/casl-ability.factory';

/* HR-001 — RRHH module shell.
 *
 * The single endpoint proves the authorization wiring end-to-end. NOTE:
 * PoliciesGuard FAILS OPEN — a route without a @CheckPolicies handler is
 * authorized-by-default. Every RRHH endpoint MUST declare @CheckPolicies;
 * never leave one bare. `read Employee` here yields 200 for
 * SUPER_ADMIN/ADMIN/MANAGER and 403 for ACCOUNTANT/ANALYST/VIEWER. */
@Controller('rrhh')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class RrhhController {
  @Get('health')
  @CheckPolicies((ability) => ability.can('read', EmployeeSubject))
  health() {
    return {
      status: 'ok',
      module: 'rrhh',
      timestamp: new Date().toISOString(),
    };
  }
}
