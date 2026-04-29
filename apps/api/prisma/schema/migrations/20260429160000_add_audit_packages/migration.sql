-- OPS-036 — packaged compliance evidence. One row per generated
-- audit package: stores the manifest JSON (with per-file SHA-256
-- hashes) and the file bytes (MinIO when configured, DB blob
-- fallback). Distinct surface from `audit_logs` (PostgreSQL
-- trigger row history), which keeps tracking every CRUD as before.

CREATE TABLE "audit_packages" (
    "id"               UUID NOT NULL,
    "companyId"        UUID NOT NULL,
    "generatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy"      UUID NOT NULL,
    "scope"            JSONB NOT NULL,
    "manifest"         JSONB NOT NULL,
    "packageSignature" TEXT NOT NULL,
    "filePath"         TEXT,
    "fileData"         BYTEA,
    "fileSize"         INTEGER NOT NULL,
    "reason"           TEXT NOT NULL,
    "expiresAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_packages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_packages_companyId_generatedAt_idx"
  ON "audit_packages" ("companyId", "generatedAt" DESC);
CREATE INDEX "audit_packages_generatedBy_idx"
  ON "audit_packages" ("generatedBy");

-- RLS — same posture as the rest of the operations schema.
ALTER TABLE audit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_package_isolation ON audit_packages
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON audit_packages TO app_user;

-- Audit trigger — captures the create / regenerate / delete trail
-- for the packages table itself (auditors auditing the auditors).
CREATE TRIGGER audit_audit_packages
  AFTER INSERT OR UPDATE OR DELETE ON audit_packages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
