import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AlertsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
