-- CreateTable
CREATE TABLE "presence_snapshots" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "period" DATE NOT NULL,
    "webVisits" INTEGER,
    "linkedinFollowers" INTEGER,
    "googleProfileViews" INTEGER,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — one snapshot per company per month (the upsert key), plus the companyId
-- index. The UNIQUE lives at the DB level (not only in the Prisma model), so a concurrent
-- double-submit for the same month can never mint a second row.
CREATE UNIQUE INDEX "presence_snapshots_companyId_period_key" ON "presence_snapshots"("companyId", "period");
CREATE INDEX "presence_snapshots_companyId_idx" ON "presence_snapshots"("companyId");

-- ─────────────────────────────────────────────────────────────────────────
-- MKT-008 — platform invariant for every business table, templated VERBATIM
-- from campaigns (20260710120000) / marketing_expenses: company-isolation RLS
-- policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- presence_snapshots has NO FK (no relations to any other model).
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE presence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY presence_snapshot_isolation ON presence_snapshots
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON presence_snapshots TO app_user;

-- Audit trigger
CREATE TRIGGER audit_presence_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON presence_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
