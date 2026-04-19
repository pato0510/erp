import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

@Controller('alerts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getAlerts(@CurrentCompany() companyId: string) {
    return this.alertsService.getActiveAlerts(companyId);
  }

  @Post('generate')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  generate(@CurrentCompany() companyId: string) {
    return this.alertsService.generateAlerts(companyId);
  }

  @Patch(':id/dismiss')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  dismiss(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.alertsService.dismissAlert(id, companyId, user.id);
  }

  @Patch(':id/resolve')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  resolve(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.alertsService.resolveAlert(id, companyId);
  }

  @Get('thresholds')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getThresholds(@CurrentCompany() companyId: string) {
    return this.alertsService.getThresholds(companyId);
  }

  @Patch('thresholds')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  updateThresholds(
    @CurrentCompany() companyId: string,
    @Body()
    dto: {
      lowCashThreshold?: number;
      commitmentDaysWarning?: number;
      commitmentDaysCritical?: number;
    },
  ) {
    return this.alertsService.updateThresholds(companyId, dto);
  }
}
