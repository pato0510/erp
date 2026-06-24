-- CreateEnum
CREATE TYPE "AreaRRHH" AS ENUM ('OPERACIONES', 'ADMINISTRACION', 'COMERCIAL', 'GERENCIA', 'FINANZAS', 'PREVENCION_RIESGOS', 'MANTENIMIENTO', 'RRHH');

-- CreateTable
CREATE TABLE "job_positions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "area" "AreaRRHH" NOT NULL,
    "description" TEXT,
    "requiredCertTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "requiredDocTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enabledServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_positions_companyId_idx" ON "job_positions"("companyId");

-- ─────────────────────────────────────────────────────────────────────────
-- HR-002 — platform invariant for every business table, templated VERBATIM
-- from document_records (20260428170000) / RRHH-RECON.md R3c: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) +
-- the app_user GRANT. Kept in the migration so production gets it on deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE job_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_position_isolation ON job_positions
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON job_positions TO app_user;

-- Audit trigger
CREATE TRIGGER audit_job_positions
  AFTER INSERT OR UPDATE OR DELETE ON job_positions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
