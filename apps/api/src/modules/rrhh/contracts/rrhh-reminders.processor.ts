import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { RRHH_REMINDERS_QUEUE } from '../../jobs/queues.constant';
import { CertificationRemindersService } from '../certifications/certification-reminders.service';
import { DocumentRemindersService } from '../employee-documents/document-reminders.service';
import { ContractRemindersService } from './contract-reminders.service';

const CONTRACT_EXPIRY_JOB_NAME = 'rrhh-contract-expiry-reminders';
/* HR-005 — document-expiry reminders. A SIBLING daily job (same queue, same
   07:00 cron) so the daily run executes BOTH contract and document reminders —
   mirroring how the Operations AlertEngineProcessor hosts several repeatables.
   This does NOT replace the contract job; both run. */
const DOCUMENT_EXPIRY_JOB_NAME = 'rrhh-document-expiry-reminders';
/* HR-014 — certification-expiry reminders. Another sibling daily job; all three
   run on the same 07:00 sweep. */
const CERTIFICATION_EXPIRY_JOB_NAME = 'rrhh-certification-expiry-reminders';
/* 07:00 daily — after the 06:00 operations alert recalc so the two daily
   sweeps don't contend. Server timezone (Railway = UTC). */
const DAILY_CRON = '0 7 * * *';

const REMINDER_JOB_NAMES = [
  CONTRACT_EXPIRY_JOB_NAME,
  DOCUMENT_EXPIRY_JOB_NAME,
  CERTIFICATION_EXPIRY_JOB_NAME,
];

/* HR-007 — the RRHH reminder cron (HR-005 foundation). Hosts the daily
   contract-expiry sweep (HR-007), the document-expiry sweep (HR-005) AND the
   certification-expiry sweep (HR-014); future RRHH reminders register their own
   job names here. Registration is idempotent on (name, repeat) and tolerant of a
   briefly-unavailable Redis (re-armed on next boot). */
@Processor(RRHH_REMINDERS_QUEUE)
export class RrhhRemindersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(RrhhRemindersProcessor.name);

  constructor(
    private readonly contractReminders: ContractRemindersService,
    private readonly documentReminders: DocumentRemindersService,
    private readonly certificationReminders: CertificationRemindersService,
    @InjectQueue(RRHH_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const r of existing) {
        if (REMINDER_JOB_NAMES.includes(r.name)) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
      for (const name of REMINDER_JOB_NAMES) {
        await this.queue.add(
          name,
          {},
          { repeat: { pattern: DAILY_CRON }, removeOnComplete: 30, removeOnFail: 30 },
        );
      }
      this.logger.log(
        `Scheduled RRHH reminder crons (contract + document + certification expiry, "${DAILY_CRON}") on ${RRHH_REMINDERS_QUEUE}`,
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
    if (job.name === DOCUMENT_EXPIRY_JOB_NAME) {
      return this.documentReminders.runForAllCompanies();
    }
    if (job.name === CERTIFICATION_EXPIRY_JOB_NAME) {
      return this.certificationReminders.runForAllCompanies();
    }
    return { skipped: job.name };
  }
}
