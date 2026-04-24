import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { GoalsService, UpsertGoalsDto } from './goals.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly goalsService: GoalsService,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getDashboard(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    return this.dashboardService.getDashboardData(companyId, fiscalPeriodId);
  }

  @Get('annual')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getAnnual(@CurrentCompany() companyId: string, @Query('year') year?: string) {
    const parsed = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.dashboardService.getAnnualData(companyId, parsed);
  }

  @Get('multiyear')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getMultiYear(
    @CurrentCompany() companyId: string,
    @Query('fromYear') fromYear?: string,
    @Query('toYear') toYear?: string,
  ) {
    const currentYear = new Date().getFullYear();
    const from = fromYear ? parseInt(fromYear, 10) : 2019;
    const to = toYear ? parseInt(toYear, 10) : currentYear;
    return this.dashboardService.getMultiYearData(companyId, from, to);
  }

  @Get('goals')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getGoals(@CurrentCompany() companyId: string, @Query('year') year?: string) {
    const parsed = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.goalsService.getGoals(companyId, parsed);
  }

  @Patch('goals')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  upsertGoals(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpsertGoalsDto,
  ) {
    return this.goalsService.upsertGoals(companyId, user.id, dto);
  }
}
