import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import {
  OPERATIONS_ALERT_ENGINE_QUEUE,
  OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE,
  OPERATIONS_WORK_PERMITS_QUEUE,
} from '../../jobs/queues.constant';
import { MaterializedViewsService } from '../dashboard/materialized-views.service';

/* OPS-037 — module-level health surface. Aggregates per-subsystem
   reachability checks into a single endpoint that monitoring tools
   (Uptime Kuma, healthchecks.io, Better Stack) can poll. Returns
   200 OK regardless of degraded subsystems — the body's `status`
   field flips to "degraded" so probes can flag it without losing
   the per-check detail. The endpoint requires JWT (otherwise it'd
   leak infra topology to anonymous probes); a separate global
   /api/health remains anonymous for liveness. */

const MODULE_VERSION = '1.0.0';
const SPRINTS_COMPLETED = 8;
const TICKETS_COMPLETED = 37;

/* Single shape for every subsystem check — the `ok` field
   determines pass/fail and either `detail` or `error` populates
   based on outcome. Kept non-discriminated so call sites can
   compute `ok` from a runtime expression without satisfying a
   literal-type narrowing. */
interface CheckResult {
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
}

interface CronInfo {
  queue: string;
  name: string;
  /** Cron pattern as registered with BullMQ. */
  pattern: string | null;
  /** Next firing in ms-since-epoch (BullMQ-provided). */
  next: number | null;
  /** Stable repeat key — useful for deletion via removeRepeatableByKey. */
  key: string;
}

@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsHealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly materializedViews: MaterializedViewsService,
    @InjectQueue(OPERATIONS_ALERT_ENGINE_QUEUE)
    private readonly alertEngineQueue: Queue,
    @InjectQueue(OPERATIONS_WORK_PERMITS_QUEUE)
    private readonly workPermitsQueue: Queue,
    @InjectQueue(OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE)
    private readonly dashboardMvQueue: Queue,
  ) {}

  @Get('health')
  async health() {
    /* All five checks run in parallel — even if one stalls (Redis
       timeout, MinIO HEAD hangs), the others still report. We do
       not throw on any individual failure: a degraded subsystem
       is still useful information. */
    const [database, redis, materializedViews, crons, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMaterializedViews(),
      this.checkCrons(),
      this.checkStorage(),
    ]);

    const checks = { database, redis, materializedViews, crons, storage };
    const allOk = Object.values(checks).every((c) => c.ok);
    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      module: {
        version: MODULE_VERSION,
        sprintsCompleted: SPRINTS_COMPLETED,
        ticketsCompleted: TICKETS_COMPLETED,
      },
    };
  }

  /* Cron registry — lists every repeatable job currently armed
     across the operations queues, with the next-fire time when
     BullMQ exposes it. Useful for "did the deploy actually
     re-arm the crons?" diagnostics. */
  @Get('health/crons')
  async listCrons(): Promise<{ count: number; crons: CronInfo[] }> {
    const queues = [
      { name: OPERATIONS_ALERT_ENGINE_QUEUE, q: this.alertEngineQueue },
      { name: OPERATIONS_WORK_PERMITS_QUEUE, q: this.workPermitsQueue },
      { name: OPERATIONS_DASHBOARD_MV_REFRESH_QUEUE, q: this.dashboardMvQueue },
    ];
    const all: CronInfo[] = [];
    for (const { name, q } of queues) {
      try {
        const repeatables = await q.getRepeatableJobs();
        for (const r of repeatables) {
          /* `r.key` is the stable string key BullMQ uses for
             removeRepeatableByKey — exactly what an admin would
             need to delete a misregistered cron. */
          all.push({
            queue: name,
            name: r.name,
            pattern: r.pattern ?? null,
            next: r.next ?? null,
            key: r.key,
          });
        }
      } catch (err) {
        all.push({
          queue: name,
          name: '<error>',
          pattern: null,
          next: null,
          key: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
    return { count: all.length, crons: all };
  }

  /* ---- helpers ----------------------------------------------- */

  private async checkDatabase(): Promise<CheckResult> {
    try {
      const t0 = Date.now();
      const [{ one }] =
        await this.prisma.$queryRawUnsafe<Array<{ one: number }>>('SELECT 1 AS one');
      const totalAssets = await this.prisma.operationalAsset.count();
      return {
        ok: one === 1,
        detail: { latencyMs: Date.now() - t0, totalAssets },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /* Redis health is inferred from the BullMQ client connection —
     we don't reach into ioredis directly because BullMQ owns the
     client lifecycle. A successful `getRepeatableJobs()` call on
     any queue means the connection is up. */
  private async checkRedis(): Promise<CheckResult> {
    try {
      const t0 = Date.now();
      const [a, b, c] = await Promise.all([
        this.alertEngineQueue.getRepeatableJobs(),
        this.workPermitsQueue.getRepeatableJobs(),
        this.dashboardMvQueue.getRepeatableJobs(),
      ]);
      return {
        ok: true,
        detail: {
          latencyMs: Date.now() - t0,
          queues: 3,
          repeatableJobs: a.length + b.length + c.length,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkMaterializedViews(): Promise<CheckResult> {
    try {
      const freshness = await this.materializedViews.getFreshness();
      const empty: string[] = [];
      const ages: Record<string, number | null> = {};
      const now = Date.now();
      for (const [k, ts] of Object.entries(freshness)) {
        if (!ts) {
          empty.push(k);
          ages[k] = null;
        } else {
          ages[k] = Math.round((now - new Date(ts).getTime()) / 1000);
        }
      }
      return {
        ok: empty.length < 4,
        detail: { ageSeconds: ages, emptyViews: empty },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkCrons(): Promise<CheckResult> {
    try {
      const queues = [this.alertEngineQueue, this.workPermitsQueue, this.dashboardMvQueue];
      let total = 0;
      for (const q of queues) {
        const r = await q.getRepeatableJobs();
        total += r.length;
      }
      /* Expect at least the 9 we register on boot:
         alert-engine: 6 (daily, escalation, exception expiration,
         ack reminders, ack expiration, domain events retry)
         work-permits: 1 (hourly expiration)
         dashboard-mv: 2 (fast 15min, slow hourly) */
      const expectedMin = 9;
      return {
        ok: total >= expectedMin,
        detail: { registeredCrons: total, expectedMinimum: expectedMin },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkStorage(): Promise<CheckResult> {
    if (!this.storage.isConfigured()) {
      /* Not configured isn't "broken" — DB blob fallback handles
         persistence everywhere we use it. We still flag it so a
         deploy that should have MinIO surfaces the gap. */
      return {
        ok: true,
        detail: { configured: false, note: 'MINIO_ENDPOINT not set; DB blob fallback active.' },
      };
    }
    try {
      /* Cheapest reachability probe — list / list-bucket.
         downloadFile of a known key would be safer but we don't
         know one; uploadFile would write garbage. The S3 client
         throws on connection refused, which is what we want. */
      const bucket = process.env.OPERATIONS_BUCKET || 'excelsia-documents';
      /* getFileUrl just signs a URL synchronously against the
         client config — it doesn't reach the server. We need an
         actual round-trip. headObject would be ideal but isn't
         exposed. Use a known-missing key download and treat 404
         as success (server reachable). */
      try {
        await this.storage.downloadFile(bucket, '__health_check_probe__');
        /* Improbable: a key with that name actually exists. Still ok. */
        return { ok: true, detail: { configured: true, bucket, probe: 'hit' } };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        /* 404 / NoSuchKey means the bucket and connection work. */
        if (msg.includes('NoSuchKey') || msg.includes('Not Found') || msg.includes('404')) {
          return { ok: true, detail: { configured: true, bucket, probe: '404-as-expected' } };
        }
        return { ok: false, error: msg };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
