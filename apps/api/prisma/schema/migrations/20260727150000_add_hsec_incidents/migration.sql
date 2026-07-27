-- HSEC-002 — first HSEC table: incidents. Hand-authored; the house template
-- (RLS + audit trigger + GRANT) is copied VERBATIM in shape from the freshest
-- table migration (20260721130000_add_calendar_activity_notes).

-- CreateEnum
CREATE TYPE "HsecIncidentType" AS ENUM ('ACCIDENTE_TRABAJO', 'ACCIDENTE_TRAYECTO', 'CASI_INCIDENTE', 'DANO_MATERIAL', 'AMBIENTAL');

-- CreateEnum
CREATE TYPE "HsecIncidentSeverity" AS ENUM ('LEVE', 'GRAVE', 'FATAL');

-- CreateEnum
CREATE TYPE "HsecIncidentStatus" AS ENUM ('REPORTADO', 'EN_INVESTIGACION', 'CERRADO');

-- CreateTable — the incident registry. occurredTime is a wall-clock "HH:mm" TEXT
-- (never a timestamp — the CAL doctrine); sourceWorkPermitId is a bare soft pointer
-- with NO FK (PART1 decision 8: the WorkPermit seam coexists without join in V1).
CREATE TABLE "hsec_incidents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "incidentNumber" TEXT NOT NULL,
    "type" "HsecIncidentType" NOT NULL,
    "severity" "HsecIncidentSeverity" NOT NULL,
    "status" "HsecIncidentStatus" NOT NULL DEFAULT 'REPORTADO',
    "occurredDate" DATE NOT NULL,
    "occurredTime" TEXT,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "immediateCause" TEXT,
    "correctiveActions" TEXT,
    "sourceWorkPermitId" UUID,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hsec_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the per-company number uniqueness is the numbering backstop
-- (next = max+1 computed inside the create transaction; PART1 decision 6).
CREATE UNIQUE INDEX "hsec_incidents_companyId_incidentNumber_key" ON "hsec_incidents"("companyId", "incidentNumber");
CREATE INDEX "hsec_incidents_companyId_idx" ON "hsec_incidents"("companyId");
CREATE INDEX "hsec_incidents_companyId_occurredDate_idx" ON "hsec_incidents"("companyId", "occurredDate");
CREATE INDEX "hsec_incidents_companyId_status_idx" ON "hsec_incidents"("companyId", "status");

-- ─────────────────────────────────────────────────────────────────────────
-- HSEC-002 — platform invariant for every business table, templated VERBATIM
-- from calendar_activity_notes (20260721130000): company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE hsec_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_incident_isolation ON hsec_incidents
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_incidents TO app_user;

-- Audit trigger
CREATE TRIGGER audit_hsec_incidents
  AFTER INSERT OR UPDATE OR DELETE ON hsec_incidents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
