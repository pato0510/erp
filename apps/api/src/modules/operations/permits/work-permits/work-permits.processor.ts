import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OPERATIONS_WORK_PERMITS_QUEUE } from '../../../jobs/queues.constant';
import { WorkPermitsService } from './work-permits.service';

const EXPIRATION_JOB_NAME = 'work-permit-expiration-check';
/* OPS-025 — hourly so AUTHORIZED/IN_EXECUTION rows whose plannedEnd
   passed during the day are flipped to EXPIRED within ~60 minutes. */
const EXPIRATION_CRON = '0 * * * *';

@Processor(OPERATIONS_WORK_PERMITS_QUEUE)
export class WorkPermitsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WorkPermitsProcessor.name);

  constructor(
    private readonly service: WorkPermitsService,
    @InjectQueue(OPERATIONS_WORK_PERMITS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const r of existing) {
        if (r.name === EXPIRATION_JOB_NAME) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
      await this.queue.add(
        EXPIRATION_JOB_NAME,
        {},
        {
          repeat: { pattern: EXPIRATION_CRON },
          removeOnComplete: 60,
          removeOnFail: 30,
        },
      );
      this.logger.log(
        `Scheduled work-permit cron (${EXPIRATION_CRON}) on ${OPERATIONS_WORK_PERMITS_QUEUE}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register work-permit cron: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing work-permit job ${job.id} (${job.name})`);
    if (job.name === EXPIRATION_JOB_NAME) {
      return this.service.processAllCompaniesExpired();
    }
    return null;
  }
}
