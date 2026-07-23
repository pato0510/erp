-- CAL-014 — the `kind` lens on calendar_activities (ACTIVIDAD | SERVICIO). Creating a FRESH enum
-- type and using it in the SAME transaction is fine — the CAL-008 in-transaction caveat applies
-- ONLY to `ALTER TYPE ... ADD VALUE` on a pre-existing enum, not to a brand-new CREATE TYPE.
-- The NOT NULL DEFAULT backfills every existing row to ACTIVIDAD (they were all activities).
-- Nothing else changes: the RLS policy, audit trigger and app_user GRANT on calendar_activities
-- (migration 20260715130000) are UNTOUCHED.
CREATE TYPE "ActivityKind" AS ENUM ('ACTIVIDAD', 'SERVICIO');

ALTER TABLE "calendar_activities" ADD COLUMN "kind" "ActivityKind" NOT NULL DEFAULT 'ACTIVIDAD';
