import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { OperationsDashboardService } from './operations-dashboard.service';

/* OPS-029 — read-only aggregator over the entire Operations module.
   Every authenticated user in the company can hit these endpoints; the
   underlying queries don't reveal anything beyond what the per-feature
   pages already expose, and RLS still scopes data to the company.
   No CASL @CheckPolicies — the dashboard is the module's landing page
   and must work for every role (VIEWER, ANALYST, ACCOUNTANT, MANAGER,
   ADMIN). */
@Controller('operations/dashboard')
@UseGuards(JwtAuthGuard)
export class OperationsDashboardController {
  constructor(private readonly service: OperationsDashboardService) {}

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
}
