import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BANK_SYNC_QUEUE } from '../../jobs/queues.constant';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BankSyncScheduler {
  private readonly logger = new Logger(BankSyncScheduler.name);

  constructor(
    @InjectQueue(BANK_SYNC_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 */6 * * *') // Every 6 hours
  async scheduleSyncForAllCompanies() {
    this.logger.log('Running scheduled bank sync for all companies...');

    const companies = await this.prisma.bankConnection.findMany({
      where: { isActive: true, status: 'ACTIVE' },
      select: { companyId: true },
      distinct: ['companyId'],
    });

    for (const { companyId } of companies) {
      await this.queue.add(
        'sync-all-active',
        { companyId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    }

    this.logger.log(`Scheduled bank sync for ${companies.length} companies`);
  }
}
