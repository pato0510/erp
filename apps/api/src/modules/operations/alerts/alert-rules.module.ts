import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OPERATIONS_ALERT_ENGINE_QUEUE } from '../../jobs/queues.constant';
import { DocumentRequirementsModule } from '../document-requirements/document-requirements.module';
import { AlertEngineProcessor } from './alert-engine.processor';
import { AlertEngineService } from './alert-engine.service';
import {
  AlertEngineTriggerController,
  AlertInstancesController,
} from './alert-instances.controller';
import { AlertInstancesService } from './alert-instances.service';
import { AlertRulePresetsService } from './alert-rule-presets.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { CompanyAlertSettingsController } from './company-alert-settings.controller';
import { CompanyAlertSettingsService } from './company-alert-settings.service';

@Module({
  imports: [
    /* DocumentRequirementsModule exposes resolveRequirementsForAsset used
       by the alert engine; the BullMQ queue registration is co-located
       here so the cron job + manual trigger both reach the same Queue
       instance. */
    DocumentRequirementsModule,
    BullModule.registerQueue({ name: OPERATIONS_ALERT_ENGINE_QUEUE }),
  ],
  controllers: [
    AlertRulesController,
    CompanyAlertSettingsController,
    AlertInstancesController,
    AlertEngineTriggerController,
  ],
  providers: [
    AlertRulesService,
    CompanyAlertSettingsService,
    AlertRulePresetsService,
    AlertInstancesService,
    AlertEngineService,
    AlertEngineProcessor,
  ],
  exports: [AlertRulesService, CompanyAlertSettingsService, AlertEngineService],
})
export class AlertRulesModule {}
