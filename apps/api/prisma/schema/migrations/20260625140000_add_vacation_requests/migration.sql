-- CreateEnum
CREATE TYPE "VacationRequestStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'TOMADO', 'CANCELADO');

-- AlterTable — manual feriado progresivo (días adicionales) on the employee.
-- Inherits employees' existing RLS policy + audit trigger + app_user GRANT.
ALTER TABLE "employees" ADD COLUMN "diasAdicionalesFeriado" INTEGER NOT NULL DEFAULT 0;

-- AlterTable — annual feriado entitlement parameter on company settings.
-- Inherits company_settings' existing RLS policy + audit trigger + app_user GRANT.
ALTER TABLE "company_settings" ADD COLUMN "feriadoAnualDiasHabiles" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "vacation_requests" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "diasHabiles" INTEGER NOT NULL,
    "status" "VacationRequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "requestedBy" UUID,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacation_requests_companyId_idx" ON "vacation_requests"("companyId");

-- CreateIndex
CREATE INDEX "vacation_requests_companyId_employeeId_idx" ON "vacation_requests"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "vacation_requests" ADD CONSTRAINT "vacation_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-011 — platform invariant for the NEW vacation_requests table, templated
-- VERBATIM from document_records (20260428170000) / RRHH-RECON.md checklist:
-- company-isolation RLS policy + audit trigger (reusing the platform
-- audit_trigger_function) + the app_user GRANT. Kept in the migration so
-- production gets it on deploy. (The new COLUMNS above inherit their tables'
-- existing RLS/audit/GRANT — no extra policy needed for them.)
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — vacation_requests
ALTER TABLE vacation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY vacation_requests_isolation ON vacation_requests
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — vacation_requests
GRANT SELECT, INSERT, UPDATE, DELETE ON vacation_requests TO app_user;

-- Audit trigger — vacation_requests
CREATE TRIGGER audit_vacation_requests
  AFTER INSERT OR UPDATE OR DELETE ON vacation_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
