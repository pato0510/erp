-- RRHH upgrade (DEMO) — ADDITIVE. Hand-authored to contain ONLY the new RRHH
-- certifications / service-requirements / availability objects + the new
-- employees.base column. This migration NEVER touches Finance or Operations
-- objects (the auto-diff against this dev DB also surfaces unrelated drift from
-- the budgets branch + index renames, intentionally excluded here).
-- Idempotent guards (IF NOT EXISTS / DO blocks) so re-application is safe.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CertificationType" AS ENUM ('PILOTO_DRONE', 'SEGURIDAD', 'TECNICA', 'CLIENTE', 'FAENA', 'INDUCCION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CertificationStatus" AS ENUM ('VIGENTE', 'POR_VENCER', 'VENCIDA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AvailabilityStatus" AS ENUM ('DISPONIBLE', 'VACACIONES', 'LICENCIA', 'CAPACITACION', 'ASIGNADO', 'DIA_LIBRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "base" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "certifications" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CertificationType" NOT NULL,
    "issuedDate" DATE,
    "expiryDate" DATE,
    "status" "CertificationStatus" NOT NULL DEFAULT 'VIGENTE',
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "service_requirements" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "serviceName" TEXT NOT NULL,
    "requiredCertType" "CertificationType",
    "requiresDrone" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "employee_availability" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "endDate" DATE,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "certifications_companyId_employeeId_idx" ON "certifications"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "certifications_companyId_expiryDate_idx" ON "certifications"("companyId", "expiryDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "service_requirements_companyId_serviceName_idx" ON "service_requirements"("companyId", "serviceName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_availability_companyId_date_idx" ON "employee_availability"("companyId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "employee_availability_companyId_employeeId_idx" ON "employee_availability"("companyId", "employeeId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "certifications" ADD CONSTRAINT "certifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
