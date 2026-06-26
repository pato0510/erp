-- CreateEnum
CREATE TYPE "TerminationCausal" AS ENUM ('NECESIDADES_EMPRESA', 'DESAHUCIO_EMPLEADOR', 'RENUNCIA', 'MUTUO_ACUERDO', 'CADUCIDAD_ART160', 'PLAZO_FIJO_TERMINO');

-- CreateEnum
CREATE TYPE "TerminationStatus" AS ENUM ('REGISTRADO', 'ANULADO');

-- CreateTable
CREATE TABLE "termination_records" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "causal" "TerminationCausal" NOT NULL,
    "terminationDate" DATE NOT NULL,
    "ufValueUsed" DECIMAL(12,4) NOT NULL,
    "baseMonthlyUsed" DECIMAL(18,2) NOT NULL,
    "aniosServicio" INTEGER NOT NULL,
    "aniosIndemnizables" INTEGER NOT NULL,
    "montoIas" DECIMAL(18,2) NOT NULL,
    "montoAvisoPrevio" DECIMAL(18,2) NOT NULL,
    "feriadoDias" DECIMAL(6,2) NOT NULL,
    "montoFeriado" DECIMAL(18,2) NOT NULL,
    "montoTotal" DECIMAL(18,2) NOT NULL,
    "avisoPrevioDado" BOOLEAN NOT NULL,
    "status" "TerminationStatus" NOT NULL DEFAULT 'REGISTRADO',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "termination_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "termination_records_companyId_idx" ON "termination_records"("companyId");

-- CreateIndex
CREATE INDEX "termination_records_companyId_employeeId_idx" ON "termination_records"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "termination_records" ADD CONSTRAINT "termination_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-010 — platform invariant for the NEW termination_records table, templated
-- VERBATIM from document_records (20260428170000) / RRHH-RECON.md checklist:
-- company-isolation RLS policy + audit trigger (reusing the platform
-- audit_trigger_function) + the app_user GRANT. Kept in the migration so
-- production gets it on deploy. (Per-person finiquito visibility is enforced ON
-- TOP of this at the API via the TerminationSimulation CASL guard.)
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — termination_records
ALTER TABLE termination_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY termination_records_isolation ON termination_records
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — termination_records
GRANT SELECT, INSERT, UPDATE, DELETE ON termination_records TO app_user;

-- Audit trigger — termination_records
CREATE TRIGGER audit_termination_records
  AFTER INSERT OR UPDATE OR DELETE ON termination_records
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
