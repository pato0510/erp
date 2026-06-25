import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/* HR-006 — RRHH dashboard. Pure read/aggregation over existing tables
   (employees, employee_compensation, employee_documents). PrismaService /
   RlsService come from their @Global modules. */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
