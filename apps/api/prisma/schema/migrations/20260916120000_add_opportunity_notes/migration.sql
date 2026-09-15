-- CreateTable
CREATE TABLE "opportunity_notes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_notes_companyId_idx" ON "opportunity_notes"("companyId");
CREATE INDEX "opportunity_notes_opportunityId_createdAt_idx" ON "opportunity_notes"("opportunityId", "createdAt" DESC);

-- AddForeignKey — a note is a DEPENDENT CHILD of the opportunity. ON DELETE CASCADE:
-- deleting the deal removes its internal thread (same rationale as opportunity_services).
-- Deliberately NOT account history: unlike activities (CASCADE from accounts, SET NULL on
-- opportunities), a note has no life without its opportunity.
ALTER TABLE "opportunity_notes" ADD CONSTRAINT "opportunity_notes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-016 — platform invariant for every business table, templated VERBATIM
-- from activities (20260706120000) / opportunities / accounts / contacts:
-- company-isolation RLS policy + audit trigger (reusing the platform
-- audit_trigger_function) + the app_user GRANT. Kept in the migration so
-- production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE opportunity_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunity_note_isolation ON opportunity_notes
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON opportunity_notes TO app_user;

-- Audit trigger
CREATE TRIGGER audit_opportunity_notes
  AFTER INSERT OR UPDATE OR DELETE ON opportunity_notes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
