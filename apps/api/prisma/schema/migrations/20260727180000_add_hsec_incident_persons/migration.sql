-- HSEC-003 — incident affected persons (afectados). Hand-authored; the house
-- template (RLS + audit trigger + GRANT) is copied VERBATIM in shape from the
-- freshest table migration (20260721130000_add_calendar_activity_notes).

-- CreateTable — one row per affected employee per incident. employeeId is a BARE
-- uuid (no FK to employees): names resolve via the RrhhEmployeeRead leaf (PART1
-- decisions 4/5 — the two-key signed contract), so a DESVINCULADO afectado keeps
-- their name in history without coupling HSEC to the RRHH schema.
CREATE TABLE "hsec_incident_persons" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "injuryType" TEXT,
    "bodyPart" TEXT,
    "medicalAttention" BOOLEAN NOT NULL DEFAULT false,
    "lostDays" INTEGER,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hsec_incident_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the pair uniqueness is the duplicate-afectado backstop (service
-- catches P2002 → 409 verbatim; the house two-layer style).
CREATE UNIQUE INDEX "hsec_incident_persons_incidentId_employeeId_key" ON "hsec_incident_persons"("incidentId", "employeeId");
CREATE INDEX "hsec_incident_persons_companyId_idx" ON "hsec_incident_persons"("companyId");

-- AddForeignKey — incidentId → hsec_incidents. ON DELETE CASCADE: deleting an
-- incident deletes its afectados (decision 6 — delete-any-status cascades its
-- children; the audit trigger keeps everything).
ALTER TABLE "hsec_incident_persons" ADD CONSTRAINT "hsec_incident_persons_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "hsec_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HSEC-003 — platform invariant for every business table, templated VERBATIM
-- from calendar_activity_notes (20260721130000): company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT. The DELETE grant is required so the parent-incident CASCADE can
-- remove the afectado rows under RLS.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE hsec_incident_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_incident_person_isolation ON hsec_incident_persons
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_incident_persons TO app_user;

-- Audit trigger
CREATE TRIGGER audit_hsec_incident_persons
  AFTER INSERT OR UPDATE OR DELETE ON hsec_incident_persons
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
