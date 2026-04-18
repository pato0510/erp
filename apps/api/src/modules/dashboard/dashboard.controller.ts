import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getDashboard(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    return this.dashboardService.getDashboardData(companyId, fiscalPeriodId);
  }
}
