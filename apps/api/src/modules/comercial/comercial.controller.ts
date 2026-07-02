import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccountSubject } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';

/* COM-001 — Comercial (CRM) module shell.
 *
 * Skeleton only: no data model, no CRUD (those land in COM-002+). The single
 * endpoint proves the authorization wiring end-to-end. NOTE: PoliciesGuard FAILS
 * OPEN — a route without a @CheckPolicies handler is authorized-by-default. Every
 * Comercial endpoint MUST declare @CheckPolicies; never leave one bare. This ping
 * gates on `read Account`, so it is never world-open: JWT + active membership are
 * always required, and only a role with read on Account passes. With the COM-001
 * default-deny floor in place (the inherited blanket `read all` is revoked on the
 * Comercial subjects for MANAGER/ACCOUNTANT/ANALYST, mirroring how RRHH revokes via
 * RRHH_SUBJECTS), this ping returns 200 ONLY for SUPER_ADMIN/ADMIN (via `manage
 * all`); MANAGER, ACCOUNTANT, ANALYST and VIEWER all get 403. Positive per-role
 * read grants for Comercial arrive with the per-entity tickets (COM-002+). */
@Controller('comercial')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ComercialController {
  @Get('health')
  @CheckPolicies((ability) => ability.can('read', AccountSubject))
  health() {
    return {
      status: 'ok',
      module: 'comercial',
      timestamp: new Date().toISOString(),
    };
  }
}
