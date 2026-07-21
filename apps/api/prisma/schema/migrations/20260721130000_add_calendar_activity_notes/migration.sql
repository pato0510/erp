-- CreateTable — the bitácora. NO "updatedAt" column: immutability is STRUCTURAL (append-only;
-- a typo gets a correcting entry, §1.6). There are also no update/delete routes anywhere.
CREATE TABLE "calendar_activity_notes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_activity_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_activity_notes_companyId_idx" ON "calendar_activity_notes"("companyId");
CREATE INDEX "calendar_activity_notes_activityId_idx" ON "calendar_activity_notes"("activityId");

-- AddForeignKey — activityId → calendar_activities. ON DELETE CASCADE: deleting an activity
-- deletes its immutable log (decision b's spirit — delete-any-status cascades its history).
ALTER TABLE "calendar_activity_notes" ADD CONSTRAINT "calendar_activity_notes_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "calendar_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- CAL-009 — platform invariant for every business table, templated VERBATIM
-- from calendar_activities (20260715130000): company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT. The DELETE grant is required so the parent-activity CASCADE can
-- remove the log rows under RLS; immutability is enforced by route ABSENCE,
-- not by withholding a DB privilege.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE calendar_activity_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_activity_note_isolation ON calendar_activity_notes
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_activity_notes TO app_user;

-- Audit trigger
CREATE TRIGGER audit_calendar_activity_notes
  AFTER INSERT OR UPDATE OR DELETE ON calendar_activity_notes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
