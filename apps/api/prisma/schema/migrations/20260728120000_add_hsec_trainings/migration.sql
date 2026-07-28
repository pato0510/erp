-- HSEC-006 — trainings (capacitaciones/charlas/inducciones) + attendees: the
-- parent + child pair in ONE hand-authored migration (the add_quotes precedent).
-- The house template (RLS + audit trigger + GRANT) is copied VERBATIM in shape
-- from the freshest table migration (20260721130000_add_calendar_activity_notes),
-- applied to EACH of the two tables.

-- CreateEnum
CREATE TYPE "HsecTrainingType" AS ENUM ('CHARLA', 'INDUCCION', 'CAPACITACION');

-- CreateTable — a training EVENT (fecha + tema + relator). `time` is a wall-clock
-- "HH:mm" TEXT (never a timestamp — the CAL doctrine); the single optional inline
-- planilla file uses the EXACT Procedure column shapes (fileName/mimeType/fileSize/
-- filePath/fileData), nullable because the file is optional here.
CREATE TABLE "hsec_trainings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "type" "HsecTrainingType" NOT NULL,
    "topic" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "durationMinutes" INTEGER,
    "instructorName" TEXT NOT NULL,
    "notes" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "filePath" TEXT,
    "fileData" BYTEA,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hsec_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable — one row per attendee per training. employeeId is a BARE uuid (no
-- FK to employees): names resolve via the RrhhEmployeeRead leaf (the two-key
-- signed contract), so a DESVINCULADO attendee keeps their name in history.
CREATE TABLE "hsec_training_attendees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "trainingId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hsec_training_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hsec_trainings_companyId_idx" ON "hsec_trainings"("companyId");
CREATE INDEX "hsec_trainings_companyId_date_idx" ON "hsec_trainings"("companyId", "date");
CREATE UNIQUE INDEX "hsec_training_attendees_trainingId_employeeId_key" ON "hsec_training_attendees"("trainingId", "employeeId");
CREATE INDEX "hsec_training_attendees_companyId_idx" ON "hsec_training_attendees"("companyId");

-- AddForeignKey — trainingId → hsec_trainings. ON DELETE CASCADE: deleting a
-- training deletes its attendee rows (decision 6 — the audit trigger keeps
-- everything).
ALTER TABLE "hsec_training_attendees" ADD CONSTRAINT "hsec_training_attendees_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "hsec_trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HSEC-006 — platform invariant for every business table, templated VERBATIM
-- from calendar_activity_notes (20260721130000): company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT — applied to EACH of the two tables. The DELETE grant on the child is
-- required so the parent-training CASCADE can remove attendee rows under RLS.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE hsec_trainings ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_training_isolation ON hsec_trainings
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE hsec_training_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_training_attendee_isolation ON hsec_training_attendees
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_trainings TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_training_attendees TO app_user;

-- Audit triggers
CREATE TRIGGER audit_hsec_trainings
  AFTER INSERT OR UPDATE OR DELETE ON hsec_trainings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_hsec_training_attendees
  AFTER INSERT OR UPDATE OR DELETE ON hsec_training_attendees
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
