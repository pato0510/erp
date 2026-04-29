import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OPERATIONS_ALERT_ENGINE_QUEUE } from '../../jobs/queues.constant';
import { DomainEventsService } from '../events/domain-events.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { AcknowledgmentsService } from '../procedures/acknowledgments/acknowledgments.service';
import { AlertEngineService } from './alert-engine.service';
import { AlertEscalationService } from './alert-escalation.service';

interface RecalculateJobData {
  companyId?: string;
  forcedExecution?: boolean;
  dryRun?: boolean;
}

const REPEATABLE_JOB_NAME = 'daily-alert-recalculation';
const ESCALATION_JOB_NAME = 'alert-escalation-check';
const EXCEPTION_EXPIRATION_JOB_NAME = 'exception-expiration-check';
/* OPS-028 — daily 09:00 reminder fan-out for procedures that need
   reading. Different from the 06:00 daily alert recalc so we don't
   clobber that worker. */
const ACK_REMINDERS_JOB_NAME = 'procedure-acknowledgment-reminders';
/* OPS-028 — daily 01:00 sweep that flips overdue rows to EXPIRED. */
const ACK_EXPIRATION_JOB_NAME = 'procedure-acknowledgment-expiration';
/* OPS-032 — every 15 minutes, retry FAILED domain events whose
   retryCount is still below the cap. */
const DOMAIN_EVENTS_RETRY_JOB_NAME = 'domain-events-retry';
/* Cron: 06:00 every day. Server timezone — Railway runs UTC, so the user
   sees this fire at 02:00–03:00 local Chile time depending on DST. We
   keep it server-time for now; OPS-021 can move to per-tenant cron. */
const DAILY_CRON = '0 6 * * *';
/* OPS-022 — every 6 hours. Catches alerts whose escalateAfterDays
   window just closed without waiting until the next morning. */
const ESCALATION_CRON = '0 */6 * * *';
/* OPS-023 — hourly so an exception that expires at e.g. 14:00 only
   waits at most 60 minutes before the asset is re-blocked. */
const EXCEPTION_EXPIRATION_CRON = '0 * * * *';
const ACK_REMINDERS_CRON = '0 9 * * *';
const ACK_EXPIRATION_CRON = '0 1 * * *';
const DOMAIN_EVENTS_RETRY_CRON = '*/15 * * * *';

@Processor(OPERATIONS_ALERT_ENGINE_QUEUE)
export class AlertEngineProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AlertEngineProcessor.name);

  constructor(
    private readonly engine: AlertEngineService,
    private readonly escalation: AlertEscalationService,
    private readonly exceptions: ExceptionsService,
    private readonly acknowledgments: AcknowledgmentsService,
    private readonly domainEvents: DomainEventsService,
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
        if (
          r.name === REPEATABLE_JOB_NAME ||
          r.name === ESCALATION_JOB_NAME ||
          r.name === EXCEPTION_EXPIRATION_JOB_NAME ||
          r.name === ACK_REMINDERS_JOB_NAME ||
          r.name === ACK_EXPIRATION_JOB_NAME ||
          r.name === DOMAIN_EVENTS_RETRY_JOB_NAME
        ) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
      await this.queue.add(REPEATABLE_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: DAILY_CRON },
        removeOnComplete: 30,
        removeOnFail: 30,
      });
      await this.queue.add(ESCALATION_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: ESCALATION_CRON },
        removeOnComplete: 30,
        removeOnFail: 30,
      });
      await this.queue.add(EXCEPTION_EXPIRATION_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: EXCEPTION_EXPIRATION_CRON },
        removeOnComplete: 60,
        removeOnFail: 30,
      });
      await this.queue.add(ACK_REMINDERS_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: ACK_REMINDERS_CRON },
        removeOnComplete: 30,
        removeOnFail: 30,
      });
      await this.queue.add(ACK_EXPIRATION_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: ACK_EXPIRATION_CRON },
        removeOnComplete: 30,
        removeOnFail: 30,
      });
      await this.queue.add(DOMAIN_EVENTS_RETRY_JOB_NAME, {} satisfies RecalculateJobData, {
        repeat: { pattern: DOMAIN_EVENTS_RETRY_CRON },
        removeOnComplete: 60,
        removeOnFail: 30,
      });
      this.logger.log(
        `Scheduled alert crons (daily="${DAILY_CRON}", escalation="${ESCALATION_CRON}", exceptions="${EXCEPTION_EXPIRATION_CRON}", ackReminders="${ACK_REMINDERS_CRON}", ackExpiration="${ACK_EXPIRATION_CRON}", domainEventsRetry="${DOMAIN_EVENTS_RETRY_CRON}") on ${OPERATIONS_ALERT_ENGINE_QUEUE}`,
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
    if (job.name === ESCALATION_JOB_NAME) {
      return this.escalation.processAllCompaniesEscalations();
    }
    if (job.name === EXCEPTION_EXPIRATION_JOB_NAME) {
      return this.exceptions.processAllCompaniesExpired();
    }
    if (job.name === ACK_REMINDERS_JOB_NAME) {
      return this.acknowledgments.sendRemindersForAllCompanies();
    }
    if (job.name === ACK_EXPIRATION_JOB_NAME) {
      return this.acknowledgments.processExpiredForAllCompanies();
    }
    if (job.name === DOMAIN_EVENTS_RETRY_JOB_NAME) {
      return this.domainEvents.retryFailed();
    }
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
