import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/* OPS-034 — refresh layer in front of the four operations dashboard
   materialized views. Responsibilities:
     * Run REFRESH MATERIALIZED VIEW CONCURRENTLY (falling back to
       blocking refresh if the unique index isn't ready yet — only
       happens on the very first run after migration).
     * Lock each view so two callers (cron + event) don't race.
     * Throttle event-driven refreshes to one per 5 minutes per view
       so a burst of asset/document/permit changes doesn't pin a CPU
       on REFRESH calls.
   The dashboard service reads from the MVs directly; this service
   never returns dashboard data. */

export type ViewName =
  | 'mv_asset_compliance_snapshot'
  | 'mv_company_compliance_summary'
  | 'mv_compliance_by_category'
  | 'mv_asset_status_distribution';

const ALL_VIEWS: ViewName[] = [
  'mv_asset_compliance_snapshot',
  'mv_company_compliance_summary',
  'mv_compliance_by_category',
  'mv_asset_status_distribution',
];

export interface DashboardFreshness {
  assetCompliance: Date | null;
  companySummary: Date | null;
  complianceByCategory: Date | null;
  statusDistribution: Date | null;
}

export interface RefreshAllResult {
  refreshedAt: Date;
  durations: Record<ViewName, number>;
}

@Injectable()
export class MaterializedViewsService {
  private readonly logger = new Logger(MaterializedViewsService.name);

  /* Per-view in-flight refresh promise. While a refresh is running
     for the same view, every other caller awaits the same promise
     instead of issuing a second REFRESH (PostgreSQL would serialize
     them anyway, but the queue would back up). */
  private readonly refreshLocks = new Map<ViewName, Promise<void>>();

  /* Per-view monotonic timestamp of the last successful refresh.
     Used by refreshThrottled() to skip event-driven refreshes that
     fire faster than THROTTLE_MS. The cron-driven path bypasses the
     throttle to guarantee the periodic baseline still happens. */
  private readonly lastRefresh = new Map<ViewName, number>();

  private readonly THROTTLE_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async refreshAssetCompliance(): Promise<void> {
    return this.refresh('mv_asset_compliance_snapshot');
  }

  async refreshCompanySummary(): Promise<void> {
    return this.refresh('mv_company_compliance_summary');
  }

  async refreshComplianceByCategory(): Promise<void> {
    return this.refresh('mv_compliance_by_category');
  }

  async refreshStatusDistribution(): Promise<void> {
    return this.refresh('mv_asset_status_distribution');
  }

  /* Refresh every view in dependency order. company_summary aggregates
     from asset_compliance_snapshot, so the snapshot must be current
     before the summary refresh starts. The other two are independent
     and run after the snapshot to ride a single transaction window. */
  async refreshAll(): Promise<RefreshAllResult> {
    const durations: Partial<Record<ViewName, number>> = {};
    const startedAt = new Date();

    for (const view of [
      'mv_asset_compliance_snapshot',
      'mv_compliance_by_category',
      'mv_asset_status_distribution',
      'mv_company_compliance_summary',
    ] as ViewName[]) {
      const t0 = Date.now();
      try {
        await this.refresh(view);
      } catch (err) {
        this.logger.error(
          `refreshAll: ${view} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      durations[view] = Date.now() - t0;
    }

    return {
      refreshedAt: startedAt,
      durations: durations as Record<ViewName, number>,
    };
  }

  /* 15-minute cron — keeps the cheap MVs current without paying for
     the full asset snapshot. company_summary is included because its
     KPIs are the most-read panel in the UI. It re-aggregates from the
     existing snapshot rather than recomputing from base tables. */
  async refreshFast(): Promise<void> {
    await this.refresh('mv_asset_status_distribution');
    await this.refresh('mv_company_compliance_summary');
  }

  /* Hourly cron — refreshes the heavy MVs. Per-asset compliance is
     re-derived from documents/alerts/exceptions, then by-category is
     recomputed from the same join shape. */
  async refreshSlow(): Promise<void> {
    await this.refresh('mv_asset_compliance_snapshot');
    await this.refresh('mv_compliance_by_category');
  }

  /* Event-driven entry point. Returns true if a refresh ran (or was
     already running and we awaited it), false if the throttle window
     swallowed the call. The caller doesn't usually care about the
     return value — it's exposed mainly for diagnostics/tests. */
  async refreshThrottled(view: ViewName): Promise<boolean> {
    const last = this.lastRefresh.get(view) ?? 0;
    if (Date.now() - last < this.THROTTLE_MS) {
      return false;
    }
    try {
      await this.refresh(view);
      return true;
    } catch (err) {
      this.logger.warn(
        `refreshThrottled: ${view} failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /* Read the `refreshed_at` column from each MV (every row carries
     the same timestamp because NOW() is captured at REFRESH time).
     Returns null per view when the MV is empty (e.g. brand-new
     install with no companies/assets yet). */
  async getFreshness(): Promise<DashboardFreshness> {
    const [snapshot, summary, byCategory, distribution] = await Promise.all([
      this.maxRefreshedAt('mv_asset_compliance_snapshot'),
      this.maxRefreshedAt('mv_company_compliance_summary'),
      this.maxRefreshedAt('mv_compliance_by_category'),
      this.maxRefreshedAt('mv_asset_status_distribution'),
    ]);
    return {
      assetCompliance: snapshot,
      companySummary: summary,
      complianceByCategory: byCategory,
      statusDistribution: distribution,
    };
  }

  /* Internal — single-flight refresh for one view. CONCURRENTLY
     keeps reads non-blocking; falls back to a blocking REFRESH if
     CONCURRENTLY fails (only realistic cause is the unique index
     missing, which can happen if the migration partially ran). */
  private async refresh(view: ViewName): Promise<void> {
    if (!ALL_VIEWS.includes(view)) {
      throw new Error(`Unknown materialized view: ${view}`);
    }

    const inflight = this.refreshLocks.get(view);
    if (inflight) {
      return inflight;
    }

    const promise = (async () => {
      const t0 = Date.now();
      try {
        await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
        this.lastRefresh.set(view, Date.now());
        this.logger.log(`Refreshed ${view} CONCURRENTLY in ${Date.now() - t0}ms`);
      } catch (err) {
        this.logger.warn(
          `CONCURRENTLY refresh failed for ${view} (${err instanceof Error ? err.message : err}); falling back to blocking REFRESH.`,
        );
        try {
          await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${view}`);
          this.lastRefresh.set(view, Date.now());
          this.logger.log(`Refreshed ${view} (blocking) in ${Date.now() - t0}ms`);
        } catch (err2) {
          this.logger.error(
            `Refresh failed for ${view}: ${err2 instanceof Error ? err2.message : err2}`,
          );
          throw err2;
        }
      }
    })();

    this.refreshLocks.set(view, promise);
    try {
      await promise;
    } finally {
      this.refreshLocks.delete(view);
    }
  }

  private async maxRefreshedAt(view: ViewName): Promise<Date | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ refreshed_at: Date | null }[]>(
        `SELECT MAX(refreshed_at) AS refreshed_at FROM ${view}`,
      );
      return rows[0]?.refreshed_at ?? null;
    } catch (err) {
      this.logger.warn(
        `getFreshness: ${view} unreadable (${err instanceof Error ? err.message : err})`,
      );
      return null;
    }
  }
}
