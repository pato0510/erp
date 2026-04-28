import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { OPERATIONS_ALERT_ENGINE_QUEUE } from '../../jobs/queues.constant';
import { DocumentRequirementsModule } from '../document-requirements/document-requirements.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';
import { NotificationModule } from '../notifications/notification.module';
import { AlertEngineProcessor } from './alert-engine.processor';
import { AlertEngineService } from './alert-engine.service';
import { AlertEscalationService } from './alert-escalation.service';
import {
  AlertEngineTriggerController,
  AlertInstancesController,
} from './alert-instances.controller';
import { AlertInstancesService } from './alert-instances.service';
import { AlertRulePresetsService } from './alert-rule-presets.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { AssetBlockingService } from './asset-blocking.service';
import { CompanyAlertSettingsController } from './company-alert-settings.controller';
import { CompanyAlertSettingsService } from './company-alert-settings.service';

@Module({
  imports: [
    /* DocumentRequirementsModule exposes resolveRequirementsForAsset used
       by the alert engine; the BullMQ queue registration is co-located
       here so the cron job + manual trigger both reach the same Queue
       instance. NotificationModule is wired so the engine and blocking
       service can fan out user notifications (OPS-022). ExceptionsModule
       is forwardRef'd so the processor can dispatch the hourly
       exception-expiration check (OPS-023) — ExceptionsModule itself
       depends on AlertRulesModule for AssetBlockingService, which is
       why we go through forwardRef. */
    DocumentRequirementsModule,
    NotificationModule,
    forwardRef(() => ExceptionsModule),
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
    AlertEscalationService,
    AssetBlockingService,
  ],
  exports: [
    AlertRulesService,
    CompanyAlertSettingsService,
    AlertEngineService,
    AlertEscalationService,
    AssetBlockingService,
  ],
})
export class AlertRulesModule {}
