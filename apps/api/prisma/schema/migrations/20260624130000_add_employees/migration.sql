-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVO', 'INACTIVO', 'DESVINCULADO');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('INDEFINIDO', 'PLAZO_FIJO', 'POR_OBRA', 'HONORARIOS', 'EXTERNO');

-- CreateEnum
CREATE TYPE "HealthSystem" AS ENUM ('FONASA', 'ISAPRE');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "fullName" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "birthDate" DATE,
    "nationality" TEXT,
    "personalEmail" TEXT,
    "companyEmail" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "jobPositionId" UUID,
    "area" "AreaRRHH" NOT NULL,
    "supervisorId" UUID,
    "base" TEXT,
    "hireDate" DATE NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVO',
    "contractType" "ContractType",
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "baseSalaryGross" DECIMAL(18,2) NOT NULL,
    "afp" TEXT,
    "health" "HealthSystem",
    "bank" TEXT,
    "bankAccountType" TEXT,
    "bankAccount" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_rut_key" ON "employees"("companyId", "rut");

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensation_employeeId_key" ON "employee_compensation"("employeeId");

-- CreateIndex
CREATE INDEX "employee_compensation_companyId_idx" ON "employee_compensation"("companyId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "job_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensation" ADD CONSTRAINT "employee_compensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-003 — platform invariant for BOTH tables, templated VERBATIM from
-- document_records (20260428170000) / RRHH-RECON.md R3c: company-isolation RLS
-- policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on deploy.
-- employee_compensation carries the same DB-level isolation as everything else;
-- the EXTRA per-role restriction (MANAGER/ADMIN only) is enforced at the API.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_isolation ON employees
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — employees
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO app_user;

-- Audit trigger — employees
CREATE TRIGGER audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — employee_compensation
ALTER TABLE employee_compensation ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_compensation_isolation ON employee_compensation
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — employee_compensation
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_compensation TO app_user;

-- Audit trigger — employee_compensation
CREATE TRIGGER audit_employee_compensation
  AFTER INSERT OR UPDATE OR DELETE ON employee_compensation
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
