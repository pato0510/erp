import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OPERATIONS_ALERT_ENGINE_QUEUE } from '../../jobs/queues.constant';
import { AlertEngineService } from './alert-engine.service';

interface RecalculateJobData {
  companyId?: string;
  forcedExecution?: boolean;
  dryRun?: boolean;
}

const REPEATABLE_JOB_NAME = 'daily-alert-recalculation';
/* Cron: 06:00 every day. Server timezone — Railway runs UTC, so the user
   sees this fire at 02:00–03:00 local Chile time depending on DST. We
   keep it server-time for now; OPS-021 can move to per-tenant cron. */
const DAILY_CRON = '0 6 * * *';

@Processor(OPERATIONS_ALERT_ENGINE_QUEUE)
export class AlertEngineProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AlertEngineProcessor.name);

  constructor(
    private readonly engine: AlertEngineService,
    @InjectQueue(OPERATIONS_ALERT_ENGINE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /* On module bootstrap, ensure the repeatable cron job is registered.
     BullMQ's repeat scheduler is idempotent on (name, repeat) so calling
     this on every process restart is safe. */
  async onModuleInit() {
    try {
      /* Clean up any prior repeatable schedules under the same name so a
         changed cron expression takes effect across deploys. */
      const existing = await this.queue.getRepeatableJobs();
      for (const r of existing) {
        if (r.name === REPEATABLE_JOB_NAME) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
      await this.queue.add(REPEATABLE_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: DAILY_CRON },
        removeOnComplete: 30,
        removeOnFail: 30,
      });
      this.logger.log(
        `Scheduled daily alert recalculation cron "${DAILY_CRON}" on ${OPERATIONS_ALERT_ENGINE_QUEUE}`,
      );
    } catch (err) {
      /* Don't crash startup if Redis is briefly unavailable — the job
         will be re-armed on the next module init. */
      this.logger.error(
        `Failed to register alert-engine cron: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async process(job: Job<RecalculateJobData>): Promise<unknown> {
    this.logger.log(`Processing alert engine job ${job.id} (${job.name})`);
    if (job.data.companyId) {
      return this.engine.processCompany(job.data.companyId, {
        forcedExecution: job.data.forcedExecution,
        dryRun: job.data.dryRun,
      });
    }
    return this.engine.processAllCompanies({
      forcedExecution: job.data.forcedExecution,
      dryRun: job.data.dryRun,
    });
  }
}
