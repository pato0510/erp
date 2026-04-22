import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { TaxModule } from '../tax/tax.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GoalsService } from './goals.service';

@Module({
  imports: [AlertsModule, ReconciliationModule, TaxModule],
  controllers: [DashboardController],
  providers: [DashboardService, GoalsService],
})
export class DashboardModule {}
