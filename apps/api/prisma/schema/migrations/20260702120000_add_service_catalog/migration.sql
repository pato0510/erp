-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('GENERAL', 'ASEO', 'TRANSPORTE', 'MANTENIMIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "ServiceUnit" AS ENUM ('UNIDAD', 'MENSUAL', 'POR_PERSONA', 'POR_FAENA', 'POR_EVENTO');

-- CreateTable
CREATE TABLE "service_catalog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "unit" "ServiceUnit" NOT NULL,
    "basePrice" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_catalog_companyId_idx" ON "service_catalog"("companyId");

-- ─────────────────────────────────────────────────────────────────────────
-- COM-002 — platform invariant for every business table, templated VERBATIM
-- from job_positions (20260624120000): company-isolation RLS policy + audit
-- trigger (reusing the platform audit_trigger_function) + the app_user GRANT.
-- Kept in the migration so production gets it on `migrate deploy` at boot.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_catalog_isolation ON service_catalog
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON service_catalog TO app_user;

-- Audit trigger
CREATE TRIGGER audit_service_catalog
  AFTER INSERT OR UPDATE OR DELETE ON service_catalog
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
