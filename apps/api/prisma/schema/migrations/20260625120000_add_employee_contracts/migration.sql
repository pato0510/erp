-- CreateEnum
CREATE TYPE "ContractWorkSchedule" AS ENUM ('COMPLETA', 'PARCIAL', 'TURNO', 'ESPECIAL');

-- CreateEnum
CREATE TYPE "GratificationType" AS ENUM ('NO', 'LEGAL', 'PACTADA');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('VIGENTE', 'VENCIDO', 'REEMPLAZADO', 'TERMINADO');

-- CreateTable
CREATE TABLE "employee_contracts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "contractualRole" TEXT,
    "workSchedule" "ContractWorkSchedule" NOT NULL,
    "baseSalary" DECIMAL(18,2) NOT NULL,
    "gratification" "GratificationType" NOT NULL DEFAULT 'NO',
    "gratificationAmount" DECIMAL(18,2),
    "mealAllowance" DECIMAL(18,2),
    "transportAllowance" DECIMAL(18,2),
    "workLocation" TEXT,
    "mainDuties" TEXT,
    "supervisorId" UUID,
    "documentId" UUID,
    "parentContractId" UUID,
    "status" "ContractStatus" NOT NULL DEFAULT 'VIGENTE',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_contracts_companyId_idx" ON "employee_contracts"("companyId");

-- CreateIndex
CREATE INDEX "employee_contracts_companyId_employeeId_idx" ON "employee_contracts"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "employee_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-007 — platform invariant, templated VERBATIM from document_records
-- (20260428170000) / RRHH-RECON.md checklist: company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT. Kept in the migration so production gets it on deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — employee_contracts
ALTER TABLE employee_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_contracts_isolation ON employee_contracts
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — employee_contracts
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_contracts TO app_user;

-- Audit trigger — employee_contracts
CREATE TRIGGER audit_employee_contracts
  AFTER INSERT OR UPDATE OR DELETE ON employee_contracts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
