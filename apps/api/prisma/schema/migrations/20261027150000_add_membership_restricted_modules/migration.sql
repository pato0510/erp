-- ACCESS-001 (2026-10-27): per-membership module access, interim until real profiles.
-- One enum + one column on memberships. No new table, so no RLS/GRANT/trigger blocks:
-- memberships keeps its existing policies (membership_isolation, membership_self_read),
-- its GRANT to app_user and its audit trigger. No backfill: every existing membership
-- gets the empty array and keeps today's access.
CREATE TYPE "AccessModule" AS ENUM ('FINANZAS', 'RRHH');

ALTER TABLE "memberships"
  ADD COLUMN "restrictedModules" "AccessModule"[] NOT NULL DEFAULT ARRAY[]::"AccessModule"[];
