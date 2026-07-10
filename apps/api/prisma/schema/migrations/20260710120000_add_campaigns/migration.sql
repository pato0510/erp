-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('FERIA_EVENTO', 'REDES_SOCIALES', 'GOOGLE_ADS', 'EMAIL', 'REFERIDOS', 'LICITACION', 'OTRO');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('BORRADOR', 'ACTIVA', 'PAUSADA', 'FINALIZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" "CampaignChannel" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'BORRADOR',
    "startDate" DATE,
    "endDate" DATE,
    "budgetAmount" DECIMAL(18,2),
    "ownerId" UUID,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_companyId_idx" ON "campaigns"("companyId");
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- ─────────────────────────────────────────────────────────────────────────
-- MKT-002 — platform invariant for every business table, templated VERBATIM
-- from accounts (20260702130000) / quotes: company-isolation RLS policy + audit
-- trigger (reusing the platform audit_trigger_function) + the app_user GRANT.
-- Kept in the migration so production gets it on `migrate deploy`. campaigns has
-- no FK yet — its two relations (marketing_expenses.campaignId, accounts.
-- sourceCampaignId) are added with their own tables/columns in MKT-005/MKT-006.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_isolation ON campaigns
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO app_user;

-- Audit trigger
CREATE TRIGGER audit_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
