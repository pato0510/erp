-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDIENTE', 'HECHA', 'CANCELADA');

-- CreateTable
CREATE TABLE "calendar_activities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "areaId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "startTime" TEXT,
    "assigneeId" UUID,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDIENTE',
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — companyId (tenant scans) + (companyId, startDate) (month-feed range scan).
CREATE INDEX "calendar_activities_companyId_idx" ON "calendar_activities"("companyId");
CREATE INDEX "calendar_activities_companyId_startDate_idx" ON "calendar_activities"("companyId", "startDate");

-- AddForeignKey — areaId → activity_areas. ON DELETE RESTRICT is the DB backstop for the
-- areas "pristine delete only" guard (an area with activities can never be dropped, even if
-- the app-side count pre-check is bypassed). ON UPDATE CASCADE is the Prisma default.
ALTER TABLE "calendar_activities" ADD CONSTRAINT "calendar_activities_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "activity_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- CAL-003 — platform invariant for every business table, templated VERBATIM
-- from activity_areas (20260715120000) / presence_snapshots: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) +
-- the app_user GRANT. Kept in the migration so production gets it on
-- `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE calendar_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_activity_isolation ON calendar_activities
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_activities TO app_user;

-- Audit trigger
CREATE TRIGGER audit_calendar_activities
  AFTER INSERT OR UPDATE OR DELETE ON calendar_activities
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
