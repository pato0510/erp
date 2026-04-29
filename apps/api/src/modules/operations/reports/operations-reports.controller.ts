import { BadRequestException, Body, Controller, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Get } from '@nestjs/common';
import { ReportSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import {
  AcknowledgmentCoverageFilters,
  ActivityFilters,
  AlertsHistoryFilters,
  AssetComplianceFilters,
  WorkPermitsFilters,
} from './dto/report-filter.dto';
import { OperationsReportsService } from './operations-reports.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* OPS-031 — POST endpoints accept the rich filter object as JSON body
   so we don't have to URL-encode arrays or long date ranges. The
   matching GET preview endpoints accept the same fields as query
   params for convenience (and to keep cache-friendly URLs the
   frontend can show in the modal). All endpoints are gated by CASL
   `read Report` which today maps to ADMIN/MANAGER/SUPER_ADMIN. */
@Controller('operations/reports')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OperationsReportsController {
  constructor(private readonly service: OperationsReportsService) {}

  /* ---- Excel exports (POST + body) ---- */

  @Post('asset-compliance')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportAssetCompliance(
    @CurrentCompany() companyId: string,
    @Body() filters: AssetComplianceFilters,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportAssetCompliance(companyId, filters ?? {});
    this.sendXlsx(res, buffer, `cumplimiento-documental-${todayKey()}.xlsx`);
  }

  @Post('activity')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportActivity(
    @CurrentCompany() companyId: string,
    @Body() filters: ActivityFilters,
    @Res() res: Response,
  ) {
    this.requireDateRange(filters);
    const buffer = await this.service.exportActivity(companyId, filters);
    this.sendXlsx(
      res,
      buffer,
      `actividad-${filters.startDate.slice(0, 10)}-a-${filters.endDate.slice(0, 10)}.xlsx`,
    );
  }

  @Post('acknowledgment-coverage')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportAcknowledgmentCoverage(
    @CurrentCompany() companyId: string,
    @Body() filters: AcknowledgmentCoverageFilters,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportAcknowledgmentCoverage(companyId, filters ?? {});
    this.sendXlsx(res, buffer, `cobertura-acuses-${todayKey()}.xlsx`);
  }

  @Post('alerts-history')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportAlertsHistory(
    @CurrentCompany() companyId: string,
    @Body() filters: AlertsHistoryFilters,
    @Res() res: Response,
  ) {
    this.requireDateRange(filters);
    const buffer = await this.service.exportAlertsHistory(companyId, filters);
    this.sendXlsx(
      res,
      buffer,
      `alertas-${filters.startDate.slice(0, 10)}-a-${filters.endDate.slice(0, 10)}.xlsx`,
    );
  }

  @Post('work-permits')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  async exportWorkPermits(
    @CurrentCompany() companyId: string,
    @Body() filters: WorkPermitsFilters,
    @Res() res: Response,
  ) {
    this.requireDateRange(filters);
    const buffer = await this.service.exportWorkPermits(companyId, filters);
    this.sendXlsx(
      res,
      buffer,
      `permisos-trabajo-${filters.startDate.slice(0, 10)}-a-${filters.endDate.slice(0, 10)}.xlsx`,
    );
  }

  /* ---- Previews (GET + query) ---- */

  @Get('preview/asset-compliance')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  previewAssetCompliance(
    @CurrentCompany() companyId: string,
    @Query('assetTypeId') assetTypeId?: string,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('blockedOnly') blockedOnly?: string,
    @Query('includeDeprecated') includeDeprecated?: string,
  ) {
    return this.service.previewAssetCompliance(companyId, {
      assetTypeId,
      locationId,
      status,
      blockedOnly: blockedOnly === 'true',
      includeDeprecated: includeDeprecated === 'true',
    });
  }

  @Get('preview/activity')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  previewActivity(
    @CurrentCompany() companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('activityTypes') activityTypes?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate y endDate son obligatorios.');
    }
    return this.service.previewActivity(companyId, {
      startDate,
      endDate,
      activityTypes: parseActivityTypes(activityTypes),
    });
  }

  @Get('preview/acknowledgment-coverage')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  previewAcknowledgmentCoverage(
    @CurrentCompany() companyId: string,
    @Query('procedureId') procedureId?: string,
    @Query('category') category?: string,
    @Query('includeExempted') includeExempted?: string,
  ) {
    return this.service.previewAcknowledgmentCoverage(companyId, {
      procedureId,
      category,
      includeExempted: includeExempted === 'true',
    });
  }

  @Get('preview/alerts-history')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  previewAlertsHistory(
    @CurrentCompany() companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('assetId') assetId?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate y endDate son obligatorios.');
    }
    return this.service.previewAlertsHistory(companyId, {
      startDate,
      endDate,
      severity: severity as AlertsHistoryFilters['severity'],
      status: status as AlertsHistoryFilters['status'],
      assetId,
    });
  }

  @Get('preview/work-permits')
  @CheckPolicies((ability) => ability.can('read', ReportSubject))
  previewWorkPermits(
    @CurrentCompany() companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('status') status?: string,
    @Query('supervisorId') supervisorId?: string,
    @Query('permitTypeId') permitTypeId?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate y endDate son obligatorios.');
    }
    return this.service.previewWorkPermits(companyId, {
      startDate,
      endDate,
      status,
      supervisorId,
      permitTypeId,
    });
  }

  /* ---- Helpers ---- */

  private sendXlsx(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  private requireDateRange(filters: { startDate?: string; endDate?: string }) {
    if (!filters?.startDate || !filters?.endDate) {
      throw new BadRequestException('startDate y endDate son obligatorios para este reporte.');
    }
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseActivityTypes(input: string | undefined): ActivityFilters['activityTypes'] {
  if (!input) return undefined;
  const VALID = new Set([
    'document',
    'alert',
    'asset-status',
    'work-permit',
    'procedure',
    'exception',
  ]);
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => VALID.has(s));
  return parts.length > 0 ? (parts as ActivityFilters['activityTypes']) : undefined;
}
