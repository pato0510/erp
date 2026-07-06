-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LLAMADA', 'REUNION', 'EMAIL', 'VISITA_FAENA', 'NOTA');

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "opportunityId" UUID,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "detail" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_companyId_idx" ON "activities"("companyId");
CREATE INDEX "activities_accountId_idx" ON "activities"("accountId");
CREATE INDEX "activities_opportunityId_idx" ON "activities"("opportunityId");
CREATE INDEX "activities_activityDate_idx" ON "activities"("activityDate");

-- AddForeignKey — activities ARE the account's history. ON DELETE CASCADE: deleting
-- an account removes its activities (same rationale as contacts — history has no life
-- without its account).
ALTER TABLE "activities" ADD CONSTRAINT "activities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — the OPTIONAL opportunity link. ON DELETE SET NULL: deleting an
-- (open) opportunity must NOT erase the account's real interaction history — it only
-- unlinks the activity from that opportunity, keeping the account-level record intact.
-- Deliberately unlike the CASCADE on accountId.
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-008 — platform invariant for every business table, templated VERBATIM
-- from opportunities (20260702150000) / accounts / contacts: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_isolation ON activities
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON activities TO app_user;

-- Audit trigger
CREATE TRIGGER audit_activities
  AFTER INSERT OR UPDATE OR DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
