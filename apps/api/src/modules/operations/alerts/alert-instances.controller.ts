import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AlertSeverity } from '@prisma/client';
import { AlertRuleSubject, AlertSettingsSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { OPERATIONS_ALERT_ENGINE_QUEUE } from '../../jobs/queues.constant';
import { AlertInstancesService } from './alert-instances.service';
import {
  BulkAlertIdsDto,
  DismissAlertInstanceDto,
  FilterAlertInstancesDto,
  ResolveAlertInstanceDto,
} from './dto/filter-alert-instances.dto';

/* Two controllers in one file — the second handles the `/alerts/recalculate`
   trigger which lives outside the `/alerts/instances` namespace. We keep
   them together so the route surface is contiguous and easy to audit. */
@Controller('operations/alerts/instances')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AlertInstancesController {
  constructor(private readonly service: AlertInstancesService) {}

  @Get('active-count')
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  getActiveCount(@CurrentCompany() companyId: string, @Query('severity') severity?: AlertSeverity) {
    return this.service.getActiveCount(companyId, severity);
  }

  /* OPS-021 — KPI tile counts (total / active / critical / unattended /
     resolvedToday) for the alert center header. Single endpoint so the
     UI stays snappy. */
  @Get('kpis')
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  getKpis(@CurrentCompany() companyId: string) {
    return this.service.getKpis(companyId);
  }

  @Post('bulk-acknowledge')
  @CheckPolicies((ability) => ability.can('update', AlertRuleSubject))
  bulkAcknowledge(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: BulkAlertIdsDto,
  ) {
    return this.service.bulkAcknowledge(companyId, user.id, dto.ids);
  }

  @Post('bulk-resolve')
  @CheckPolicies((ability) => ability.can('update', AlertRuleSubject))
  bulkResolve(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: BulkAlertIdsDto,
  ) {
    return this.service.bulkResolve(companyId, user.id, dto.ids, dto.reason ?? null);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterAlertInstancesDto) {
    return this.service.findAll(companyId, filters);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', AlertRuleSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post(':id/acknowledge')
  @CheckPolicies((ability) => ability.can('update', AlertRuleSubject))
  acknowledge(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.acknowledge(id, companyId, user.id);
  }

  @Post(':id/resolve')
  @CheckPolicies((ability) => ability.can('update', AlertRuleSubject))
  resolve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ResolveAlertInstanceDto,
  ) {
    return this.service.resolve(id, companyId, user.id, dto);
  }

  @Post(':id/dismiss')
  @CheckPolicies((ability) => ability.can('update', AlertRuleSubject))
  dismiss(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: DismissAlertInstanceDto,
  ) {
    return this.service.dismiss(id, companyId, user.id, dto);
  }
}

interface RecalculateBody {
  companyId?: string;
}

/* OPS-019 — manual trigger for the alert engine. Body lets ADMINs target
   a specific company; defaults to the caller's current company so the
   common case is "recalculate mine now". The job is enqueued in BullMQ
   so the response stays fast and the heavy work runs out of band. */
@Controller('operations/alerts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AlertEngineTriggerController {
  constructor(@InjectQueue(OPERATIONS_ALERT_ENGINE_QUEUE) private readonly queue: Queue) {}

  @Post('recalculate')
  @CheckPolicies((ability) => ability.can('update', AlertSettingsSubject))
  async recalculate(@CurrentCompany() companyId: string, @Body() body: RecalculateBody) {
    const targetCompanyId = body.companyId ?? companyId;
    const job = await this.queue.add(
      'recalculate-on-demand',
      { companyId: targetCompanyId, forcedExecution: true },
      {
        removeOnComplete: 30,
        removeOnFail: 30,
        attempts: 1,
      },
    );
    return { jobId: job.id, status: 'queued', companyId: targetCompanyId };
  }
}
