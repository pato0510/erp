-- OPS-025 — Internal Work Permits (Permisos de Trabajo).
-- Short-lived safety instruments emitted for ONE specific high-risk
-- task and CLOSED when the task ends. Tightly scoped, no renewal.

-- CreateEnum
CREATE TYPE "WorkPermitCategory" AS ENUM (
    'HEIGHT_WORK',
    'HOT_WORK',
    'CONFINED_SPACE',
    'LOCKOUT_TAGOUT',
    'EXCAVATION',
    'LIFTING',
    'ELECTRICAL_WORK',
    'CHEMICAL_HANDLING',
    'OTHER'
);

CREATE TYPE "WorkPermitStatus" AS ENUM (
    'DRAFT',
    'PENDING_AUTHORIZATION',
    'AUTHORIZED',
    'IN_EXECUTION',
    'SUSPENDED',
    'CLOSED',
    'CANCELLED',
    'EXPIRED'
);

-- Extend NotificationSourceType for work-permit lifecycle events.
ALTER TYPE "NotificationSourceType" ADD VALUE IF NOT EXISTS 'WORK_PERMIT_AUTHORIZATION';
ALTER TYPE "NotificationSourceType" ADD VALUE IF NOT EXISTS 'WORK_PERMIT_AUTHORIZED';
ALTER TYPE "NotificationSourceType" ADD VALUE IF NOT EXISTS 'WORK_PERMIT_REJECTED';
ALTER TYPE "NotificationSourceType" ADD VALUE IF NOT EXISTS 'WORK_PERMIT_STARTED';
ALTER TYPE "NotificationSourceType" ADD VALUE IF NOT EXISTS 'WORK_PERMIT_CLOSED';
ALTER TYPE "NotificationSourceType" ADD VALUE IF NOT EXISTS 'WORK_PERMIT_EXPIRED';

-- CreateTable: work_permit_types
CREATE TABLE "work_permit_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "WorkPermitCategory" NOT NULL,
    "description" TEXT,
    "maxDurationHours" INTEGER NOT NULL DEFAULT 8,
    "requiredRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "requiresMedicalAptitude" BOOLEAN NOT NULL DEFAULT false,
    "requiresSpecificTraining" BOOLEAN NOT NULL DEFAULT false,
    "requiresGasMeasurement" BOOLEAN NOT NULL DEFAULT false,
    "requiresIsolation" BOOLEAN NOT NULL DEFAULT false,
    "defaultRisks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "defaultControls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "work_permit_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_permit_types_companyId_code_key" ON "work_permit_types"("companyId", "code");
CREATE UNIQUE INDEX "work_permit_types_companyId_name_key" ON "work_permit_types"("companyId", "name");
CREATE INDEX "work_permit_types_companyId_category_idx" ON "work_permit_types"("companyId", "category");

-- CreateTable: work_permits
CREATE TABLE "work_permits" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "permitTypeId" UUID NOT NULL,
    "permitNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workLocation" TEXT,
    "assetId" UUID,
    "locationId" UUID,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "requestedBy" UUID NOT NULL,
    "supervisorId" UUID NOT NULL,
    "workTeam" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "identifiedRisks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "controlMeasures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "additionalNotes" TEXT,
    "authorizedBy" UUID,
    "authorizedAt" TIMESTAMP(3),
    "authorizationNotes" TEXT,
    "closedBy" UUID,
    "closedAt" TIMESTAMP(3),
    "closureNotes" TEXT,
    "incidentsReported" BOOLEAN NOT NULL DEFAULT false,
    "incidentDescription" TEXT,
    "status" "WorkPermitStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedBy" UUID,
    "gasMeasurements" JSONB,
    "isolationPoints" JSONB,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_permits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_permits_companyId_permitNumber_key"
  ON "work_permits"("companyId", "permitNumber");
CREATE INDEX "work_permits_companyId_status_plannedStart_idx"
  ON "work_permits"("companyId", "status", "plannedStart");
CREATE INDEX "work_permits_companyId_supervisorId_idx"
  ON "work_permits"("companyId", "supervisorId");
CREATE INDEX "work_permits_companyId_assetId_idx"
  ON "work_permits"("companyId", "assetId");
CREATE INDEX "work_permits_companyId_permitNumber_idx"
  ON "work_permits"("companyId", "permitNumber");

ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_permitTypeId_fkey"
  FOREIGN KEY ("permitTypeId") REFERENCES "work_permit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Schedule sanity: planned window must be valid.
ALTER TABLE "work_permits"
  ADD CONSTRAINT "work_permits_planned_window_chk"
  CHECK ("plannedStart" < "plannedEnd");

-- Per-company sequence used by the application layer to format
-- permitNumber as PT-{YEAR}-{NNNN}. The service reads nextval()
-- inside a transaction so concurrent inserts cannot collide.
CREATE SEQUENCE IF NOT EXISTS work_permit_number_seq START 1;

-- RLS
ALTER TABLE work_permit_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_permit_type_isolation ON work_permit_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE work_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_permit_isolation ON work_permits
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON work_permit_types TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_permits TO app_user;
GRANT USAGE ON SEQUENCE work_permit_number_seq TO app_user;

-- Audit triggers
CREATE TRIGGER audit_work_permit_types
  AFTER INSERT OR UPDATE OR DELETE ON work_permit_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_work_permits
  AFTER INSERT OR UPDATE OR DELETE ON work_permits
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
