import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { TaxModule } from '../tax/tax.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AlertsModule, TaxModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
