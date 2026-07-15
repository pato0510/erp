-- CreateTable
CREATE TABLE "activity_areas" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — one area name per company (the catalog key), plus the companyId index.
-- The UNIQUE lives at the DB level (not only in the Prisma model), so a concurrent
-- duplicate-name create can never mint a second row — the service surfaces the P2002 as a
-- clean 409.
CREATE UNIQUE INDEX "activity_areas_companyId_name_key" ON "activity_areas"("companyId", "name");
CREATE INDEX "activity_areas_companyId_idx" ON "activity_areas"("companyId");

-- ─────────────────────────────────────────────────────────────────────────
-- CAL-002 — platform invariant for every business table, templated VERBATIM
-- from presence_snapshots (20260714120000) / campaigns: company-isolation RLS
-- policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- activity_areas has NO FK yet — the calendar_activities.areaId FK (ON DELETE RESTRICT)
-- is added with that table in CAL-003.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE activity_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_area_isolation ON activity_areas
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON activity_areas TO app_user;

-- Audit trigger
CREATE TRIGGER audit_activity_areas
  AFTER INSERT OR UPDATE OR DELETE ON activity_areas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
