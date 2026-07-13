-- CreateTable
CREATE TABLE "marketing_expenses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "expenseDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "vendorName" TEXT,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_expenses_companyId_idx" ON "marketing_expenses"("companyId");
CREATE INDEX "marketing_expenses_campaignId_idx" ON "marketing_expenses"("campaignId");

-- AddForeignKey — expenses are DEPENDENT CHILDREN of a campaign. ON DELETE CASCADE:
-- deleting a (pristine-draft) campaign removes its expenses. The pristine-BORRADOR
-- guard in the service still blocks deleting a campaign that HAS expenses (decision d);
-- CASCADE is the DB-level safety net.
ALTER TABLE "marketing_expenses" ADD CONSTRAINT "marketing_expenses_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- MKT-005 — platform invariant for every business table, templated VERBATIM
-- from campaigns (20260710120000) / accounts / quotes: company-isolation RLS
-- policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE marketing_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_expense_isolation ON marketing_expenses
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_expenses TO app_user;

-- Audit trigger
CREATE TRIGGER audit_marketing_expenses
  AFTER INSERT OR UPDATE OR DELETE ON marketing_expenses
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
