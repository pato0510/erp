-- Adds an entityType discriminator to import_logs so the same table can hold
-- audit rows for movement / asset / vehicle / document imports. Existing rows
-- get the default 'MOVEMENT' value to preserve their meaning.

ALTER TABLE "import_logs"
  ADD COLUMN "entityType" TEXT NOT NULL DEFAULT 'MOVEMENT';

CREATE INDEX "import_logs_companyId_entityType_createdAt_idx"
  ON "import_logs" ("companyId", "entityType", "createdAt");
