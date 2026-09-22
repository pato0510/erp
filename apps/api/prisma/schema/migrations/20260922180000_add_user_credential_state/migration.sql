-- AUTH-001: global credential state; no new table is created.
-- users has no companyId and already has audit_users, so no RLS, GRANT,
-- or trigger blocks are needed. The existing audit trigger is unchanged.
ALTER TABLE "users"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NULL;
