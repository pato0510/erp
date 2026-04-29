-- OPS-032 — Domain events. Internal pub/sub audit table emitted by
-- the Operations module. Persisted before broadcast so handlers can
-- replay on retry and admins have a trail of what was emitted, what
-- was processed, and what failed.

CREATE TYPE "DomainEventStatus" AS ENUM (
    'PENDING',
    'PROCESSED',
    'FAILED'
);

CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "status" "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
    "handlerResults" JSONB,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- Idempotency — same event for the same aggregate at the exact same
-- instant is a duplicate (e.g. the alert engine emitting twice in
-- the same cron tick).
CREATE UNIQUE INDEX "domain_events_companyId_eventType_aggregateId_occurredAt_key"
  ON "domain_events"("companyId", "eventType", "aggregateId", "occurredAt");
CREATE INDEX "domain_events_companyId_eventType_occurredAt_idx"
  ON "domain_events"("companyId", "eventType", "occurredAt");
CREATE INDEX "domain_events_companyId_status_idx"
  ON "domain_events"("companyId", "status");
CREATE INDEX "domain_events_aggregateType_aggregateId_idx"
  ON "domain_events"("aggregateType", "aggregateId");

-- RLS — company-scoped at the DB layer to prevent cross-tenant
-- leakage even on a misconfigured query. Same posture as the rest
-- of the operations tables.
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY domain_event_isolation ON domain_events
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON domain_events TO app_user;

-- Audit trigger — captures every state transition (PENDING →
-- PROCESSED/FAILED, retry counter increments) into the audit log.
CREATE TRIGGER audit_domain_events
  AFTER INSERT OR UPDATE OR DELETE ON domain_events
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
