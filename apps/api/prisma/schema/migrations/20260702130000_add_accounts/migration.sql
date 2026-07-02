-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PROSPECTO', 'ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "AccountPriority" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PROSPECTO',
    "industry" TEXT,
    "priority" "AccountPriority" NOT NULL DEFAULT 'MEDIA',
    "commercialRisk" TEXT,
    "ownerId" UUID,
    "counterpartyId" UUID,
    "sourceCampaignId" UUID,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_companyId_idx" ON "accounts"("companyId");

-- AddForeignKey — optional link to Finance counterparties. ON DELETE SET NULL:
-- deleting a counterparty only UNLINKS the account (sets counterpartyId NULL),
-- it never deletes or blocks the account. sourceCampaignId has NO FK on purpose
-- (the campaigns table does not exist yet — future Marketing module).
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-003 — platform invariant for every business table, templated VERBATIM
-- from service_catalog (20260702120000) / job_positions: company-isolation RLS
-- policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_isolation ON accounts
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts TO app_user;

-- Audit trigger
CREATE TRIGGER audit_accounts
  AFTER INSERT OR UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
