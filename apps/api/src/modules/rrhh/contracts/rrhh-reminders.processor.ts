import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { RRHH_REMINDERS_QUEUE } from '../../jobs/queues.constant';
import { ContractRemindersService } from './contract-reminders.service';

const CONTRACT_EXPIRY_JOB_NAME = 'rrhh-contract-expiry-reminders';
/* 07:00 daily — after the 06:00 operations alert recalc so the two daily
   sweeps don't contend. Server timezone (Railway = UTC). */
const CONTRACT_EXPIRY_CRON = '0 7 * * *';

/* HR-007 — the RRHH reminder cron (HR-005 foundation). Currently hosts the daily
   contract-expiry sweep; future RRHH reminders (certifications, etc.) register
   their own job names here. Registration is idempotent on (name, repeat) and
   tolerant of a briefly-unavailable Redis (re-armed on next boot). */
@Processor(RRHH_REMINDERS_QUEUE)
export class RrhhRemindersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(RrhhRemindersProcessor.name);

  constructor(
    private readonly contractReminders: ContractRemindersService,
    @InjectQueue(RRHH_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const r of existing) {
        if (r.name === CONTRACT_EXPIRY_JOB_NAME) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
      await this.queue.add(
        CONTRACT_EXPIRY_JOB_NAME,
        {},
        { repeat: { pattern: CONTRACT_EXPIRY_CRON }, removeOnComplete: 30, removeOnFail: 30 },
      );
      this.logger.log(
        `Scheduled RRHH reminder cron (contractExpiry="${CONTRACT_EXPIRY_CRON}") on ${RRHH_REMINDERS_QUEUE}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register rrhh-reminders cron: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing RRHH reminder job ${job.id} (${job.name})`);
    if (job.name === CONTRACT_EXPIRY_JOB_NAME) {
      return this.contractReminders.runForAllCompanies();
    }
    return { skipped: job.name };
  }
}
