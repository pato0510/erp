import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { BANK_SYNC_QUEUE } from '../../jobs/queues.constant';
import { BankingService } from '../banking.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Processor(BANK_SYNC_QUEUE)
export class BankSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BankSyncProcessor.name);

  constructor(
    private readonly bankingService: BankingService,
    private readonly prisma: PrismaService,
    @InjectQueue(BANK_SYNC_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing bank sync job ${job.id}: ${job.name}`);

    switch (job.name) {
      case 'sync-balance':
        return this.handleSyncBalance(job);
      case 'sync-movements':
        return this.handleSyncMovements(job);
      case 'sync-all-active':
        return this.handleSyncAllActive(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return null;
    }
  }

  private async handleSyncBalance(job: Job) {
    const { connectionId, companyId } = job.data;
    const result = await this.bankingService.syncBalance(connectionId, companyId);
    this.logger.log(`Sync balance complete: ${result.balance} ${result.currency}`);
    return result;
  }

  private async handleSyncMovements(job: Job) {
    const { connectionId, companyId, from, to } = job.data;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const result = await this.bankingService.syncMovements(
      connectionId,
      companyId,
      fromDate,
      toDate,
    );
    this.logger.log(`Sync movements complete: ${result.synced} synced`);
    return result;
  }

  private async handleSyncAllActive(job: Job) {
    const { companyId } = job.data;
    const connections = await this.bankingService.getConnections(companyId);
    const active = connections.filter((c) => c.status === 'ACTIVE');

    for (const conn of active) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await this.queue.add('sync-balance', { connectionId: conn.id, companyId }, this.jobOptions());
      await this.queue.add(
        'sync-movements',
        { connectionId: conn.id, companyId, from: sevenDaysAgo },
        this.jobOptions(),
      );
    }

    this.logger.log(`Enqueued sync for ${active.length} active connections`);
    return { connectionsScheduled: active.length };
  }

  private jobOptions() {
    return {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    };
  }
}
