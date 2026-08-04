import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OperationsDashboardSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { MaterializedViewsService } from './materialized-views.service';
import { OperationsDashboardService } from './operations-dashboard.service';

/* OPS-029 — read-only aggregator over the entire Operations module: the
   module landing page, meant to work for EVERY role (VIEWER, ANALYST,
   ACCOUNTANT, MANAGER, ADMIN, SUPER_ADMIN).
   OPS-034 — added /freshness and /refresh-views (ADMIN-only, `manage`).

   HARDEN-001 (2026-08-03) — the nine read endpoints are now gated on
   `read OperationsDashboardSubject`. They STAY OPEN to every role by CASL
   grant (SUPER_ADMIN/ADMIN via `manage all`; MANAGER/ACCOUNTANT/ANALYST via
   `read all`; VIEWER via an explicit `can('read', OperationsDashboardSubject)`
   added in the same change), so no role loses access. The point of the gate
   is the MEMBERSHIP CHECK: PoliciesGuard short-circuits to `true` when a
   handler has no @CheckPolicies (policies.guard.ts:17-20) — BEFORE it
   validates the x-company-id header against the caller's memberships. So the
   previously ungated reads accepted any x-company-id and returned that
   company's data to a non-member. Adding @CheckPolicies makes the guard run
   its membership lookup, rejecting a foreign company with 403.

   CORRECTION to the old OPS-029 note: RLS is NOT the backstop here. At
   runtime the DB role bypasses RLS (BYPASSRLS/superuser) and RLS is ENABLE-
   only (not FORCE); moreover these endpoints read materialized views, which
   PostgreSQL cannot subject to RLS at all — so the ONLY tenant boundary on
   this surface is the membership check this gate restores. The systemic
   fixes (a non-bypass runtime role / FORCE RLS) are HARDEN-002/003; see
   docs/HARDENING-RECON.md. */
@Controller('operations/dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OperationsDashboardController {
  constructor(
    private readonly service: OperationsDashboardService,
    private readonly materializedViews: MaterializedViewsService,
  ) {}

  @Get('overview')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  overview(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getOverview(companyId, user.id);
  }

  @Get('action-items')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  actionItems(@CurrentCompany() companyId: string) {
    return this.service.getActionItems(companyId);
  }

  @Get('upcoming-events')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  upcomingEvents(
    @CurrentCompany() companyId: string,
    @Query('daysAhead', new DefaultValuePipe(30), ParseIntPipe) daysAhead: number,
  ) {
    return this.service.getUpcomingEvents(companyId, daysAhead);
  }

  @Get('top-assets-at-risk')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  topAssetsAtRisk(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    return this.service.getTopAssetsAtRisk(companyId, limit);
  }

  @Get('recent-activity')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  recentActivity(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getRecentActivity(companyId, limit);
  }

  @Get('my-tasks')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  myTasks(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getMyTasks(companyId, user.id);
  }

  @Get('asset-distribution')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  assetDistribution(@CurrentCompany() companyId: string) {
    return this.service.getAssetStatusDistribution(companyId);
  }

  @Get('compliance-by-category')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  complianceByCategory(@CurrentCompany() companyId: string) {
    return this.service.getComplianceByCategory(companyId);
  }

  /* OPS-034 — surface the per-MV refreshed_at so the dashboard UI can display
     "data refreshed N minutes ago". Returns global MV metadata only (no
     companyId, no per-tenant rows), so it was never a per-tenant leak;
     HARDEN-001 gates it anyway so it requires a valid membership like the
     rest of the dashboard. Open to every role by CASL grant. */
  @Get('freshness')
  @CheckPolicies((ability) => ability.can('read', OperationsDashboardSubject))
  freshness() {
    return this.service.getDashboardFreshness();
  }

  /* OPS-034 — manual refresh of all 4 MVs. ADMIN-only via the
     `manage` action on OperationsDashboardSubject (only ADMIN /
     SUPER_ADMIN have `manage all`). */
  @Post('refresh-views')
  @CheckPolicies((ability) => ability.can('manage', OperationsDashboardSubject))
  async refreshViews() {
    return this.materializedViews.refreshAll();
  }
}
