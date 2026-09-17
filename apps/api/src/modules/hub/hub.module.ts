import { Module } from '@nestjs/common';
import { TodosModule } from '../actividades/todos/todos.module';
import { AlertsModule as ComercialAlertsModule } from '../comercial/alerts/alerts.module';
import { AlertRulesModule } from '../operations/alerts/alert-rules.module';
import { HubController } from './hub.controller';
import { HubService } from './hub.service';

@Module({
  imports: [ComercialAlertsModule, TodosModule, AlertRulesModule],
  controllers: [HubController],
  providers: [HubService],
})
export class HubModule {}
