import { Module } from '@nestjs/common';
import { AlertRulePresetsService } from './alert-rule-presets.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { CompanyAlertSettingsController } from './company-alert-settings.controller';
import { CompanyAlertSettingsService } from './company-alert-settings.service';

@Module({
  controllers: [AlertRulesController, CompanyAlertSettingsController],
  providers: [AlertRulesService, CompanyAlertSettingsService, AlertRulePresetsService],
  exports: [AlertRulesService, CompanyAlertSettingsService],
})
export class AlertRulesModule {}
