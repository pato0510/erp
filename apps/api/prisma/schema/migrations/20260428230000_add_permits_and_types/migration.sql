-- CreateEnum
CREATE TYPE "PermitCategory" AS ENUM (
    'MUNICIPAL',
    'SANITARY',
    'ENVIRONMENTAL',
    'FIRE_DEPT',
    'LABOR',
    'ELECTRICAL',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'REPLACED',
    'ARCHIVED'
);

-- CreateTable: permit_types
CREATE TABLE "permit_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "PermitCategory" NOT NULL,
    "issuingAuthority" TEXT,
    "hasExpiration" BOOLEAN NOT NULL DEFAULT true,
    "defaultValidityDays" INTEGER,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "criticalAlertDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "criticality" "DocumentCriticality" NOT NULL,
    "blocksOperation" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "permit_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permit_types_companyId_code_key" ON "permit_types"("companyId", "code");
CREATE UNIQUE INDEX "permit_types_companyId_name_key" ON "permit_types"("companyId", "name");
CREATE INDEX "permit_types_companyId_category_idx" ON "permit_types"("companyId", "category");

-- CreateTable: permits
CREATE TABLE "permits" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "permitTypeId" UUID NOT NULL,
    "assetId" UUID,
    "locationId" UUID,
    "permitNumber" TEXT NOT NULL,
    "issuingAuthority" TEXT,
    "issueDate" DATE,
    "expirationDate" DATE,
    "scope" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "filePath" TEXT,
    "fileData" BYTEA,
    "status" "PermitStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedBy" UUID,
    "uploadedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" UUID,
    "rejectedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacedByPermitId" UUID,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "permits_companyId_assetId_idx" ON "permits"("companyId", "assetId");
CREATE INDEX "permits_companyId_locationId_idx" ON "permits"("companyId", "locationId");
CREATE INDEX "permits_companyId_permitTypeId_idx" ON "permits"("companyId", "permitTypeId");
CREATE INDEX "permits_companyId_status_idx" ON "permits"("companyId", "status");
CREATE INDEX "permits_companyId_expirationDate_idx" ON "permits"("companyId", "expirationDate");

ALTER TABLE "permits" ADD CONSTRAINT "permits_permitTypeId_fkey"
  FOREIGN KEY ("permitTypeId") REFERENCES "permit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "permits" ADD CONSTRAINT "permits_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "permits" ADD CONSTRAINT "permits_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "permits" ADD CONSTRAINT "permits_replacedByPermitId_fkey"
  FOREIGN KEY ("replacedByPermitId") REFERENCES "permits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one target must be set. We guard with a CHECK constraint so
-- bad rows can't land via raw INSERT outside the application layer.
ALTER TABLE "permits"
  ADD CONSTRAINT "permits_target_one_only"
  CHECK (("assetId" IS NOT NULL) <> ("locationId" IS NOT NULL));

-- AlertInstance schema evolution: documentTypeId and assetId become
-- nullable so a single row can describe either a document-driven or a
-- permit-driven alert. Existing rows keep their values.
ALTER TABLE "alert_instances" ALTER COLUMN "documentTypeId" DROP NOT NULL;
ALTER TABLE "alert_instances" ALTER COLUMN "assetId" DROP NOT NULL;

-- Drop the existing FK on assetId so we can re-add it as ON DELETE
-- CASCADE for nullable columns; behavior is unchanged for non-null
-- rows.
ALTER TABLE "alert_instances" DROP CONSTRAINT IF EXISTS "alert_instances_assetId_fkey";
ALTER TABLE "alert_instances" DROP CONSTRAINT IF EXISTS "alert_instances_documentTypeId_fkey";

ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_documentTypeId_fkey"
  FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New columns linking permit-driven alerts back to their source.
ALTER TABLE "alert_instances" ADD COLUMN "permitTypeId" UUID;
ALTER TABLE "alert_instances" ADD COLUMN "permitId" UUID;
ALTER TABLE "alert_instances" ADD COLUMN "locationId" UUID;

ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_permitTypeId_fkey"
  FOREIGN KEY ("permitTypeId") REFERENCES "permit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "permits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "alert_instances_companyId_permitId_status_idx"
  ON "alert_instances"("companyId", "permitId", "status");

-- Permit-side idempotency. The original (companyId, assetId,
-- documentTypeId, triggerType, days, status) constraint stays in place
-- but treats NULLs as distinct, so it doesn't cover permit alerts.
-- This partial index gives permit alerts their own dedupe key.
CREATE UNIQUE INDEX "alert_instances_permit_dedupe"
  ON "alert_instances"("companyId", "permitId", "triggerType", "daysBeforeExpiration", "status")
  WHERE "permitId" IS NOT NULL;

-- RLS for permit_types
ALTER TABLE permit_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY permit_type_isolation ON permit_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- RLS for permits
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY permit_isolation ON permits
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON permit_types TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON permits TO app_user;

-- Audit triggers
CREATE TRIGGER audit_permit_types
  AFTER INSERT OR UPDATE OR DELETE ON permit_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_permits
  AFTER INSERT OR UPDATE OR DELETE ON permits
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
