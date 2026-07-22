-- CAL-012 — the founder REVERSED the bitácora's signed immutability (2026-07-22): activity
-- writers may now edit/delete any entry. `updatedAt` is PLAIN nullable (NOT @updatedAt) — null
-- means "never edited"; the edit path sets it explicitly, so the "editada" marker stays truthful.
-- Nothing else changes: RLS policy, audit trigger and the app_user GRANT already exist on
-- calendar_activity_notes (migration 20260721130000) and are UNTOUCHED. The audit trigger is now
-- the forensic layer — every UPDATE/DELETE preserves the prior content in audit_logs.
ALTER TABLE "calendar_activity_notes" ADD COLUMN "updatedAt" TIMESTAMP(3);
