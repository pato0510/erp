import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Job, Queue } from 'bullmq';
import { OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE } from '../../jobs/queues.constant';
import { MaterializedViewsService } from './materialized-views.service';

/* OPS-034 — refresh scheduler for the dashboard MVs.
   Two repeatable jobs:
     * fast (every 15 min) → status_distribution + company_summary
     * slow (every hour) → asset_compliance_snapshot + by_category
   Plus selective domain-event listeners (OPS-032 events) that
   trigger throttled refreshes on the views most likely to drift
   between cron ticks. The throttle (5 min in MaterializedViewsService)
   protects against burst traffic. */

const FAST_JOB_NAME = 'dashboard-mv-refresh-fast';
const SLOW_JOB_NAME = 'dashboard-mv-refresh-slow';

const FAST_CRON = '*/15 * * * *';
const SLOW_CRON = '0 * * * *';

@Processor(OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE)
export class DashboardMvRefreshProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DashboardMvRefreshProcessor.name);

  constructor(
    private readonly mv: MaterializedViewsService,
    @InjectQueue(OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /* Same shape as alert-engine.processor: clean up any stale
     repeatables under our job names so a changed cron expression
     takes effect across deploys, then re-arm. Errors here are logged
     but never thrown — Redis being briefly unavailable should not
     crash module init. */
  async onModuleInit() {
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const r of existing) {
        if (r.name === FAST_JOB_NAME || r.name === SLOW_JOB_NAME) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
      await this.queue.add(
        FAST_JOB_NAME,
        {},
        {
          repeat: { pattern: FAST_CRON },
          removeOnComplete: 30,
          removeOnFail: 30,
        },
      );
      await this.queue.add(
        SLOW_JOB_NAME,
        {},
        {
          repeat: { pattern: SLOW_CRON },
          removeOnComplete: 30,
          removeOnFail: 30,
        },
      );
      this.logger.log(
        `Scheduled dashboard MV refresh crons (fast="${FAST_CRON}", slow="${SLOW_CRON}") on ${OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register dashboard-mv-refresh cron: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing dashboard MV refresh job ${job.id} (${job.name})`);
    if (job.name === FAST_JOB_NAME) {
      await this.mv.refreshFast();
      return { ok: true, kind: 'fast' };
    }
    if (job.name === SLOW_JOB_NAME) {
      await this.mv.refreshSlow();
      return { ok: true, kind: 'slow' };
    }
    return null;
  }

  /* ── domain-event listeners (OPS-032) ─────────────────────────
     The spec called out events that don't currently exist in the
     codebase (document.approved, asset.status-changed, etc.). We
     listen instead to the events OPS-032 actually emits and cover
     the same scenarios:
       * asset.blocked / asset.unblocked → status flipped, refresh
         the per-asset snapshot AND the donut distribution
       * document.renewal-imminent → a doc just crossed into the
         expiring-soon window, snapshot's expiring/risk counters
         shift
       * permit.renewal-imminent → permit-side counters shift in
         the company summary
       * work-permit.closed → in_execution / closed_today shift in
         the company summary
     All calls go through refreshThrottled() so a cron-tick burst
     of events doesn't pin the worker. */

  @OnEvent('asset.blocked')
  @OnEvent('asset.unblocked')
  async handleAssetStatusChange() {
    await Promise.all([
      this.mv.refreshThrottled('mv_asset_compliance_snapshot'),
      this.mv.refreshThrottled('mv_asset_status_distribution'),
    ]);
  }

  @OnEvent('document.renewal-imminent')
  async handleDocumentRenewalImminent() {
    await this.mv.refreshThrottled('mv_asset_compliance_snapshot');
  }

  @OnEvent('permit.renewal-imminent')
  async handlePermitRenewalImminent() {
    await this.mv.refreshThrottled('mv_company_compliance_summary');
  }

  @OnEvent('work-permit.closed')
  async handleWorkPermitClosed() {
    await this.mv.refreshThrottled('mv_company_compliance_summary');
  }
}
