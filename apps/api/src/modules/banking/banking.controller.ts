import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BankingService } from './banking.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';
import { BANK_SYNC_QUEUE } from '../jobs/queues.constant';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

@Controller('banking')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class BankingController {
  constructor(
    private readonly bankingService: BankingService,
    @InjectQueue(BANK_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  @Post('connections')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  createConnection(@CurrentCompany() companyId: string, @Body() dto: CreateConnectionDto) {
    return this.bankingService.createConnection(companyId, dto);
  }

  @Get('connections')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getConnections(@CurrentCompany() companyId: string) {
    return this.bankingService.getConnections(companyId);
  }

  @Get('connections/:id')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getConnection(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.bankingService.getConnection(id, companyId);
  }

  @Post('connections/:id/sync-balance')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  async syncBalance(@Param('id') id: string, @CurrentCompany() companyId: string) {
    await this.bankingService.getConnection(id, companyId);
    const job = await this.syncQueue.add(
      'sync-balance',
      { connectionId: id, companyId },
      JOB_OPTIONS,
    );
    return { jobId: job.id, message: 'Sync enqueued' };
  }

  @Post('connections/:id/sync-movements')
  @CheckPolicies((ability) => ability.can('update', MovementSubject))
  async syncMovements(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Body() body: { from?: string; to?: string },
  ) {
    await this.bankingService.getConnection(id, companyId);
    const from = body.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = body.to || new Date().toISOString();
    const job = await this.syncQueue.add(
      'sync-movements',
      { connectionId: id, companyId, from, to },
      JOB_OPTIONS,
    );
    return { jobId: job.id, message: 'Sync enqueued' };
  }

  @Get('jobs/:jobId/status')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  async getJobStatus(@Param('jobId') jobId: string) {
    const job = await this.syncQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    const state = await job.getState();
    return {
      id: job.id,
      name: job.name,
      status: state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      finishedOn: job.finishedOn,
    };
  }

  @Get('connections/:id/sync-history')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getSyncHistory(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.bankingService.getSyncHistory(id, companyId);
  }

  @Get('connections/:id/movements')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  getExternalMovements(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isReconciled') isReconciled?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.bankingService.getExternalMovements(id, companyId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      isReconciled: isReconciled === 'true' ? true : isReconciled === 'false' ? false : undefined,
      dateFrom,
      dateTo,
    });
  }
}
