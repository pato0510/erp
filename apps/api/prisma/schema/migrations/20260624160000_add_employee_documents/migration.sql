-- CreateEnum
CREATE TYPE "EmployeeDocCategory" AS ENUM ('CONTRATO', 'IDENTIDAD', 'PREVISIONAL', 'SALUD', 'SEGURIDAD', 'CERTIFICACION', 'AMONESTACION', 'FINIQUITO', 'OTRO');

-- CreateEnum
CREATE TYPE "EmployeeDocApprovalStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "employee_document_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EmployeeDocCategory" NOT NULL,
    "defaultValidityDays" INTEGER,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "isMandatoryDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_document_requirements" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID,
    "jobPositionId" UUID,
    "documentTypeId" UUID NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "appliesToClient" TEXT,
    "appliesToSite" TEXT,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT,
    "blobFallback" BYTEA,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "issueDate" DATE,
    "expiryDate" DATE,
    "status" "DocumentRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededById" UUID,
    "approvalStatus" "EmployeeDocApprovalStatus" NOT NULL DEFAULT 'PENDIENTE',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "uploadedBy" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_document_types_companyId_name_key" ON "employee_document_types"("companyId", "name");

-- CreateIndex
CREATE INDEX "employee_document_types_companyId_idx" ON "employee_document_types"("companyId");

-- CreateIndex
CREATE INDEX "employee_document_requirements_companyId_idx" ON "employee_document_requirements"("companyId");

-- CreateIndex
CREATE INDEX "employee_documents_companyId_idx" ON "employee_documents"("companyId");

-- CreateIndex
CREATE INDEX "employee_documents_companyId_employeeId_idx" ON "employee_documents"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "employee_document_requirements" ADD CONSTRAINT "employee_document_requirements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_document_requirements" ADD CONSTRAINT "employee_document_requirements_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "job_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_document_requirements" ADD CONSTRAINT "employee_document_requirements_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "employee_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "employee_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "employee_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Single-target CHECK — exactly one of employeeId / jobPositionId must be set
-- (copy-adapted from the Operations requirements single-target CHECK, which had
-- three targets; here the matrix is two-level: employee > jobPosition).
ALTER TABLE "employee_document_requirements"
  ADD CONSTRAINT "employee_document_requirements_single_target_chk"
  CHECK ((("employeeId" IS NOT NULL)::int + ("jobPositionId" IS NOT NULL)::int) = 1);

-- ─────────────────────────────────────────────────────────────────────────
-- HR-004a — platform invariant for ALL THREE tables, templated VERBATIM from
-- document_records (20260428170000) / RRHH-RECON.md checklist: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on deploy.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — employee_document_types
ALTER TABLE employee_document_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_document_types_isolation ON employee_document_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — employee_document_types
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_document_types TO app_user;

-- Audit trigger — employee_document_types
CREATE TRIGGER audit_employee_document_types
  AFTER INSERT OR UPDATE OR DELETE ON employee_document_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — employee_document_requirements
ALTER TABLE employee_document_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_document_requirements_isolation ON employee_document_requirements
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — employee_document_requirements
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_document_requirements TO app_user;

-- Audit trigger — employee_document_requirements
CREATE TRIGGER audit_employee_document_requirements
  AFTER INSERT OR UPDATE OR DELETE ON employee_document_requirements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — employee_documents
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_documents_isolation ON employee_documents
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants — employee_documents
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_documents TO app_user;

-- Audit trigger — employee_documents
CREATE TRIGGER audit_employee_documents
  AFTER INSERT OR UPDATE OR DELETE ON employee_documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
