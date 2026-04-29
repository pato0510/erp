import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  aggregateIdForEvent,
  aggregateTypeForEvent,
  EVENT_TYPES,
  EventTypeName,
  OperationsDomainEvent,
} from './domain-event-types';

const MAX_RETRIES = 3;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/* OPS-032 — central bus that persists every domain event before
   broadcasting it to in-process listeners. Persistence-first means
   handlers can replay on retry, and admins always have an audit
   trail of what was emitted, what was processed, and what failed.

   The service deliberately swallows persistence and emit errors:
   the caller is usually inside a domain operation (closing a
   permit, approving a document) and we never want a bus hiccup to
   fail user-visible work. The audit row + cron retry catch the
   rare case where a handler fails. */

@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  /* Persist + broadcast. Returns the persisted row id, or null when
     the row was deduped by the unique constraint (idempotent
     re-emission). */
  async emit<T extends OperationsDomainEvent>(event: T): Promise<string | null> {
    const aggregateType = aggregateTypeForEvent(event);
    const aggregateId = aggregateIdForEvent(event);
    const occurredAt = new Date(event.occurredAt);

    let row;
    try {
      row = await this.prisma.domainEvent.create({
        data: {
          companyId: event.companyId,
          eventType: event.type,
          aggregateType,
          aggregateId,
          payload: event as unknown as Prisma.InputJsonValue,
          occurredAt,
          status: DomainEventStatus.PENDING,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        /* Idempotent re-emit. The unique constraint already absorbed
           the dupe; nothing to do. */
        this.logger.debug(
          `Skipped duplicate domain event ${event.type} for ${aggregateId} @ ${occurredAt.toISOString()}`,
        );
        return null;
      }
      this.logger.error(
        `Failed to persist domain event ${event.type}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }

    /* Fire the in-process broadcast. EventEmitter2 returns the
       handler results synchronously by default; we use emitAsync so
       handlers can be async without us blocking on them serially.
       Any handler error shows up as a rejected promise we capture
       below. */
    this.emitter.emitAsync(event.type, event).then(
      (results) => {
        void this.markProcessed(row.id, results);
      },
      (handlerErr) => {
        void this.markFailed(
          row.id,
          handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
          true,
        );
      },
    );

    return row.id;
  }

  /* Batch wrapper — useful for cron passes that produce dozens of
     events. We fan out one-by-one so each gets its own audit row
     and idempotency check; the outer await waits on persistence
     only, not handler results. */
  async emitMany(events: OperationsDomainEvent[]): Promise<Array<string | null>> {
    const out: Array<string | null> = [];
    for (const event of events) {
      out.push(await this.emit(event));
    }
    return out;
  }

  /* Update a row's status to PROCESSED with the per-handler results.
     Called from the .then callback in emit(). Failures here are
     logged but never re-thrown — the row will look PENDING in the
     audit page until the next retry cron picks it up. */
  async markProcessed(eventId: string, handlerResults: unknown): Promise<void> {
    try {
      await this.prisma.domainEvent.update({
        where: { id: eventId },
        data: {
          status: DomainEventStatus.PROCESSED,
          handledAt: new Date(),
          handlerResults: (Array.isArray(handlerResults)
            ? handlerResults
            : [handlerResults]) as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark event ${eventId} processed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async markFailed(eventId: string, reason: string, incrementRetry = true): Promise<void> {
    try {
      await this.prisma.domainEvent.update({
        where: { id: eventId },
        data: {
          status: DomainEventStatus.FAILED,
          handledAt: new Date(),
          failureReason: reason.slice(0, 1000),
          ...(incrementRetry ? { retryCount: { increment: 1 } } : {}),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark event ${eventId} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /* Cron entry point — reaches for every FAILED event with
     retryCount < MAX_RETRIES across all companies and re-emits
     them. We re-broadcast via the bus rather than re-persisting, so
     the original audit row stays the source of truth. */
  async retryFailed(): Promise<{ retried: number; skipped: number }> {
    const candidates = await this.prisma.domainEvent.findMany({
      where: {
        status: DomainEventStatus.FAILED,
        retryCount: { lt: MAX_RETRIES },
      },
      orderBy: { occurredAt: 'asc' },
      take: 100,
    });
    let retried = 0;
    let skipped = 0;
    for (const row of candidates) {
      const payload = row.payload as unknown as OperationsDomainEvent;
      try {
        /* Reset to PENDING + bump retryCount before broadcasting so
           a handler that fails again triggers markFailed and we
           don't double-bump. */
        await this.prisma.domainEvent.update({
          where: { id: row.id },
          data: {
            status: DomainEventStatus.PENDING,
            retryCount: { increment: 1 },
            failureReason: null,
          },
        });
        this.emitter.emitAsync(row.eventType, payload).then(
          (results) => {
            void this.markProcessed(row.id, results);
          },
          (handlerErr) => {
            void this.markFailed(
              row.id,
              handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
              false,
            );
          },
        );
        retried++;
      } catch (err) {
        this.logger.warn(
          `Failed to retry event ${row.id}: ${err instanceof Error ? err.message : err}`,
        );
        skipped++;
      }
    }
    return { retried, skipped };
  }

  async retrySingle(companyId: string, eventId: string): Promise<{ retried: boolean }> {
    const row = await this.prisma.domainEvent.findFirst({
      where: { id: eventId, companyId },
    });
    if (!row) return { retried: false };
    if (row.retryCount >= MAX_RETRIES) {
      throw new Error('Máximo de reintentos alcanzado.');
    }
    const payload = row.payload as unknown as OperationsDomainEvent;
    await this.prisma.domainEvent.update({
      where: { id: row.id },
      data: {
        status: DomainEventStatus.PENDING,
        retryCount: { increment: 1 },
        failureReason: null,
      },
    });
    this.emitter.emitAsync(row.eventType, payload).then(
      (results) => {
        void this.markProcessed(row.id, results);
      },
      (handlerErr) => {
        void this.markFailed(
          row.id,
          handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
          false,
        );
      },
    );
    return { retried: true };
  }

  /* Audit listing — paginated, filterable. Returns rows in
     reverse-chronological order so the audit page leads with the
     most recent activity. */
  async findEvents(
    companyId: string,
    filters: {
      eventType?: string;
      aggregateType?: string;
      aggregateId?: string;
      status?: DomainEventStatus;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    const where: Prisma.DomainEventWhereInput = { companyId };
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.aggregateType) where.aggregateType = filters.aggregateType;
    if (filters.aggregateId) where.aggregateId = filters.aggregateId;
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      where.occurredAt = {};
      if (filters.dateFrom) where.occurredAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.occurredAt.lte = new Date(filters.dateTo);
    }

    const [rows, total] = await Promise.all([
      this.prisma.domainEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.domainEvent.count({ where }),
    ]);
    return { data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async findOne(companyId: string, eventId: string) {
    return this.prisma.domainEvent.findFirst({
      where: { id: eventId, companyId },
    });
  }

  /* Aggregate counts for the audit page KPI cards. Date scope
     defaults to "last 30 days" so numbers stay meaningful as the
     event log grows. */
  async getStats(companyId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [total, processed, failed, pending, byType] = await Promise.all([
      this.prisma.domainEvent.count({ where: { companyId, occurredAt: { gte: since } } }),
      this.prisma.domainEvent.count({
        where: { companyId, occurredAt: { gte: since }, status: 'PROCESSED' },
      }),
      this.prisma.domainEvent.count({
        where: { companyId, occurredAt: { gte: since }, status: 'FAILED' },
      }),
      this.prisma.domainEvent.count({
        where: { companyId, occurredAt: { gte: since }, status: 'PENDING' },
      }),
      this.prisma.domainEvent.groupBy({
        by: ['eventType'],
        where: { companyId, occurredAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const successRate = total === 0 ? 100 : Math.round((processed / total) * 1000) / 10;
    const byTypeMap: Record<string, number> = {};
    for (const t of EVENT_TYPES) byTypeMap[t] = 0;
    for (const row of byType) byTypeMap[row.eventType] = row._count._all;
    return {
      windowDays: days,
      total,
      processed,
      failed,
      pending,
      successRate,
      byType: byTypeMap as Record<EventTypeName | string, number>,
    };
  }
}
