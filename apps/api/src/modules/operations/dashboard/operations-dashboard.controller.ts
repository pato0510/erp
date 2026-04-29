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

/* OPS-029 — read-only aggregator over the entire Operations module.
   Every authenticated user in the company can hit these endpoints; the
   underlying queries don't reveal anything beyond what the per-feature
   pages already expose, and RLS still scopes data to the company.
   No CASL @CheckPolicies on the read endpoints — the dashboard is the
   module's landing page and must work for every role (VIEWER, ANALYST,
   ACCOUNTANT, MANAGER, ADMIN).
   OPS-034 — added /freshness (open) and /refresh-views (ADMIN-only).
   PoliciesGuard is added at the controller level: it short-circuits to
   true when no @CheckPolicies metadata is set, so the read endpoints
   stay open. */
@Controller('operations/dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OperationsDashboardController {
  constructor(
    private readonly service: OperationsDashboardService,
    private readonly materializedViews: MaterializedViewsService,
  ) {}

  @Get('overview')
  overview(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getOverview(companyId, user.id);
  }

  @Get('action-items')
  actionItems(@CurrentCompany() companyId: string) {
    return this.service.getActionItems(companyId);
  }

  @Get('upcoming-events')
  upcomingEvents(
    @CurrentCompany() companyId: string,
    @Query('daysAhead', new DefaultValuePipe(30), ParseIntPipe) daysAhead: number,
  ) {
    return this.service.getUpcomingEvents(companyId, daysAhead);
  }

  @Get('top-assets-at-risk')
  topAssetsAtRisk(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    return this.service.getTopAssetsAtRisk(companyId, limit);
  }

  @Get('recent-activity')
  recentActivity(
    @CurrentCompany() companyId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getRecentActivity(companyId, limit);
  }

  @Get('my-tasks')
  myTasks(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.getMyTasks(companyId, user.id);
  }

  @Get('asset-distribution')
  assetDistribution(@CurrentCompany() companyId: string) {
    return this.service.getAssetStatusDistribution(companyId);
  }

  @Get('compliance-by-category')
  complianceByCategory(@CurrentCompany() companyId: string) {
    return this.service.getComplianceByCategory(companyId);
  }

  /* OPS-034 — surface the per-MV refreshed_at so the dashboard UI
     can display "data refreshed N minutes ago". Open to every
     authenticated user; freshness is not sensitive. */
  @Get('freshness')
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
