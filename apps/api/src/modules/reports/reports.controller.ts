import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { ReportSubject } from '../common/casl/casl-ability.factory';

@Controller('reports')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('movements/export')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportMovements(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Res() res?: Response,
  ) {
    const buffer = await this.reportsService.exportMovementsExcel(companyId, {
      fiscalPeriodId,
      type,
      status,
      dateFrom,
      dateTo,
      search,
    });

    const date = new Date().toISOString().split('T')[0];
    res!.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="movimientos-${date}.xlsx"`,
    });
    res!.send(buffer);
  }

  @Get('cashflow/export')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportCashflow(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId: string,
    @Res() res?: Response,
  ) {
    const buffer = await this.reportsService.exportCashflowExcel(companyId, fiscalPeriodId);

    const date = new Date().toISOString().split('T')[0];
    res!.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="caja-${date}.xlsx"`,
    });
    res!.send(buffer);
  }

  @Get('executive-summary')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  getExecutiveSummary(
    @CurrentCompany() companyId: string,
    @Query('fiscalPeriodId') fiscalPeriodId?: string,
  ) {
    return this.reportsService.generateExecutiveSummary(companyId, fiscalPeriodId);
  }
}
