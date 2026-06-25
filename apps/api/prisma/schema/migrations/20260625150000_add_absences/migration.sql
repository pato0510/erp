-- CreateEnum
CREATE TYPE "AbsenceCategory" AS ENUM ('PERMISO', 'LICENCIA');

-- CreateEnum
CREATE TYPE "AbsenceDayUnit" AS ENUM ('CORRIDOS', 'HABILES', 'MEDIO_DIA', 'HORAS');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "absence_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AbsenceCategory" NOT NULL DEFAULT 'PERMISO',
    "daysDefault" INTEGER,
    "unit" "AbsenceDayUnit" NOT NULL DEFAULT 'HABILES',
    "withPay" BOOLEAN NOT NULL DEFAULT true,
    "isLegal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "category" "AbsenceCategory" NOT NULL,
    "absenceTypeId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "withPay" BOOLEAN NOT NULL DEFAULT true,
    "blocksAvailability" BOOLEAN NOT NULL DEFAULT true,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PENDIENTE',
    "medicalFolio" TEXT,
    "healthEntity" TEXT,
    "requestedBy" UUID,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "documentId" UUID,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "absence_types_companyId_name_key" ON "absence_types"("companyId", "name");

-- CreateIndex
CREATE INDEX "absence_types_companyId_idx" ON "absence_types"("companyId");

-- CreateIndex
CREATE INDEX "absences_companyId_idx" ON "absences"("companyId");

-- CreateIndex
CREATE INDEX "absences_companyId_employeeId_idx" ON "absences"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_absenceTypeId_fkey" FOREIGN KEY ("absenceTypeId") REFERENCES "absence_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-012 — platform invariant for BOTH new tables, templated VERBATIM from
-- document_records (20260428170000) / RRHH-RECON.md checklist: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — absence_types
ALTER TABLE absence_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY absence_types_isolation ON absence_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — absence_types
GRANT SELECT, INSERT, UPDATE, DELETE ON absence_types TO app_user;

-- Audit trigger — absence_types
CREATE TRIGGER audit_absence_types
  AFTER INSERT OR UPDATE OR DELETE ON absence_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — absences
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY absences_isolation ON absences
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — absences
GRANT SELECT, INSERT, UPDATE, DELETE ON absences TO app_user;

-- Audit trigger — absences
CREATE TRIGGER audit_absences
  AFTER INSERT OR UPDATE OR DELETE ON absences
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
