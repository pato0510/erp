-- OPS-028 — Procedure acknowledgment system. Created automatically
-- when a procedure with requiresAcknowledgment=true is published.
-- The user is the subject of record (signature hash binds the ack
-- to them) and the procedure is the content they're acknowledging.

CREATE TYPE "AcknowledgmentStatus" AS ENUM (
    'PENDING',
    'READ',
    'ACKNOWLEDGED',
    'EXPIRED',
    'EXEMPTED'
);

CREATE TABLE "procedure_acknowledgments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "procedureId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AcknowledgmentStatus" NOT NULL DEFAULT 'PENDING',
    "firstViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "acknowledgedAt" TIMESTAMP(3),
    "signatureHash" TEXT,
    "acknowledgedFromIp" TEXT,
    "acknowledgedUserAgent" TEXT,
    "acknowledgmentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderSentAt" TIMESTAMP(3),
    "exemptedBy" UUID,
    "exemptedAt" TIMESTAMP(3),
    "exemptionReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedure_acknowledgments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procedure_acknowledgments_companyId_procedureId_userId_key"
  ON "procedure_acknowledgments"("companyId", "procedureId", "userId");
CREATE INDEX "procedure_acknowledgments_companyId_userId_status_idx"
  ON "procedure_acknowledgments"("companyId", "userId", "status");
CREATE INDEX "procedure_acknowledgments_companyId_procedureId_status_idx"
  ON "procedure_acknowledgments"("companyId", "procedureId", "status");
CREATE INDEX "procedure_acknowledgments_companyId_status_dueDate_idx"
  ON "procedure_acknowledgments"("companyId", "status", "dueDate");

ALTER TABLE "procedure_acknowledgments" ADD CONSTRAINT "procedure_acknowledgments_procedureId_fkey"
  FOREIGN KEY ("procedureId") REFERENCES "procedures"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS — company-scoped at the DB, with user-level scoping enforced
-- by CASL + the service layer (mirrors how user_notifications and
-- the rest of the OPS module handle it). The application code never
-- returns rows the caller shouldn't see, but the company guard
-- prevents cross-tenant leakage even on a misconfigured query.
ALTER TABLE procedure_acknowledgments ENABLE ROW LEVEL SECURITY;
CREATE POLICY procedure_acknowledgment_isolation ON procedure_acknowledgments
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON procedure_acknowledgments TO app_user;

-- Audit trigger
CREATE TRIGGER audit_procedure_acknowledgments
  AFTER INSERT OR UPDATE OR DELETE ON procedure_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
