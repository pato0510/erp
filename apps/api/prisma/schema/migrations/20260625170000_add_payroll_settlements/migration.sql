-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('BORRADOR', 'EMITIDA', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "payroll_settlements" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "haberesImponibles" DECIMAL(18,2) NOT NULL,
    "haberesNoImponibles" DECIMAL(18,2) NOT NULL,
    "sueldoBase" DECIMAL(18,2),
    "gratificacion" DECIMAL(18,2),
    "totalHaberes" DECIMAL(18,2) NOT NULL,
    "descUAfp" DECIMAL(18,2) NOT NULL,
    "descSalud" DECIMAL(18,2) NOT NULL,
    "descAfc" DECIMAL(18,2) NOT NULL,
    "descImpuestoUnico" DECIMAL(18,2) NOT NULL,
    "otrosDescuentos" DECIMAL(18,2) NOT NULL,
    "totalDescuentos" DECIMAL(18,2) NOT NULL,
    "liquidoPagado" DECIMAL(18,2) NOT NULL,
    "aporteAfcEmpleador" DECIMAL(18,2),
    "aporteSis" DECIMAL(18,2),
    "aporteMutual" DECIMAL(18,2),
    "otrosAportesEmpleador" DECIMAL(18,2),
    "costoEmpresa" DECIMAL(18,2),
    "afpName" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'BORRADOR',
    "documentId" UUID,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_settlements_companyId_idx" ON "payroll_settlements"("companyId");

-- CreateIndex
CREATE INDEX "payroll_settlements_companyId_employeeId_idx" ON "payroll_settlements"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settlements_companyId_employeeId_periodYear_periodMo_key" ON "payroll_settlements"("companyId", "employeeId", "periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settlements" ADD CONSTRAINT "payroll_settlements_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-009 — platform invariant for the NEW payroll_settlements table, templated
-- VERBATIM from document_records (20260428170000) / RRHH-RECON.md checklist:
-- company-isolation RLS policy + audit trigger (reusing the platform
-- audit_trigger_function) + the app_user GRANT. Kept in the migration so
-- production gets it on deploy. (Per-person salary visibility is enforced ON TOP
-- of this at the API via the EmployeeCompensation CASL guard.)
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — payroll_settlements
ALTER TABLE payroll_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_settlements_isolation ON payroll_settlements
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — payroll_settlements
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_settlements TO app_user;

-- Audit trigger — payroll_settlements
CREATE TRIGGER audit_payroll_settlements
  AFTER INSERT OR UPDATE OR DELETE ON payroll_settlements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
