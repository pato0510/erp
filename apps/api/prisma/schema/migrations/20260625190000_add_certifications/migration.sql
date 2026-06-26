-- CreateEnum
CREATE TYPE "CertificationCategory" AS ENUM ('CERTIFICACION', 'HABILITACION_CLIENTE', 'HABILITACION_FAENA');

-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('VIGENTE', 'POR_VENCER', 'VENCIDA', 'ANULADA');

-- CreateTable
CREATE TABLE "certification_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CertificationCategory" NOT NULL DEFAULT 'CERTIFICACION',
    "defaultValidityDays" INTEGER,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "issuingEntity" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "certificationTypeId" UUID NOT NULL,
    "category" "CertificationCategory" NOT NULL,
    "issueDate" DATE,
    "expiryDate" DATE,
    "status" "CertificationStatus" NOT NULL DEFAULT 'VIGENTE',
    "documentId" UUID,
    "clientOrSite" TEXT,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certification_types_companyId_name_key" ON "certification_types"("companyId", "name");

-- CreateIndex
CREATE INDEX "certification_types_companyId_idx" ON "certification_types"("companyId");

-- CreateIndex
CREATE INDEX "certifications_companyId_idx" ON "certifications"("companyId");

-- CreateIndex
CREATE INDEX "certifications_companyId_employeeId_idx" ON "certifications"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_certificationTypeId_fkey" FOREIGN KEY ("certificationTypeId") REFERENCES "certification_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HR-014 — platform invariant for BOTH new tables, templated VERBATIM from
-- document_records (20260428170000) / RRHH-RECON.md checklist: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — certification_types
ALTER TABLE certification_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY certification_types_isolation ON certification_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — certification_types
GRANT SELECT, INSERT, UPDATE, DELETE ON certification_types TO app_user;

-- Audit trigger — certification_types
CREATE TRIGGER audit_certification_types
  AFTER INSERT OR UPDATE OR DELETE ON certification_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — certifications
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY certifications_isolation ON certifications
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — certifications
GRANT SELECT, INSERT, UPDATE, DELETE ON certifications TO app_user;

-- Audit trigger — certifications
CREATE TRIGGER audit_certifications
  AFTER INSERT OR UPDATE OR DELETE ON certifications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
