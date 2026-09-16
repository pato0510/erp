-- CreateTable
CREATE TABLE "enterprises" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rut" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enterprises_companyId_idx" ON "enterprises"("companyId");

-- Uniqueness lives HERE, not in Prisma (it cannot express either index):
-- one name per company, case-insensitive; one RUT per company, only when present.
CREATE UNIQUE INDEX "enterprises_companyId_lower_name_key" ON "enterprises"("companyId", lower("name"));
CREATE UNIQUE INDEX "enterprises_companyId_rut_key" ON "enterprises"("companyId", "rut") WHERE "rut" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-018 — platform invariant for every business table, templated VERBATIM
-- from opportunity_documents (20260916130000) / opportunity_notes / accounts:
-- company-isolation RLS policy + audit trigger (reusing the platform
-- audit_trigger_function) + the app_user GRANT. Kept in the migration so
-- production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE enterprises ENABLE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON enterprises
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON enterprises TO app_user;

-- Audit trigger
CREATE TRIGGER audit_enterprises
  AFTER INSERT OR UPDATE OR DELETE ON enterprises
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- ─────────────────────────────────────────────────────────────────────────
-- COM-018 — accounts gain the OPTIONAL parent-enterprise link (one Enterprise →
-- many Accounts). ON DELETE SET NULL (template: accounts_sourceCampaignId_fkey,
-- 20260713130000): a raw delete only unlinks, never takes the account down.
-- ─────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "enterpriseId" UUID;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "enterprises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "accounts_enterpriseId_idx" ON "accounts"("enterpriseId");
