-- OPS-027 — Procedures library: internal company-published
-- instructional content. Distinct from external Documents and
-- regulatory Permits — procedures don't expire, they are
-- versioned and superseded.

CREATE TYPE "ProcedureCategory" AS ENUM (
    'OPERATION',
    'MAINTENANCE',
    'EMERGENCY',
    'SAFETY',
    'QUALITY',
    'ENVIRONMENTAL',
    'OTHER'
);

CREATE TYPE "ProcedureStatus" AS ENUM (
    'DRAFT',
    'IN_REVIEW',
    'PUBLISHED',
    'SUPERSEDED',
    'DEPRECATED'
);

CREATE TYPE "RevisionType" AS ENUM (
    'CREATED',
    'UPDATED',
    'REVIEWED',
    'PUBLISHED',
    'SUPERSEDED',
    'DEPRECATED',
    'RESTORED'
);

CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ProcedureCategory" NOT NULL,
    "authoredBy" UUID NOT NULL,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "publishedBy" UUID,
    "publishedAt" TIMESTAMP(3),
    "deprecatedBy" UUID,
    "deprecatedAt" TIMESTAMP(3),
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "replacesProcedureId" UUID,
    "replacedByProcedureId" UUID,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT,
    "fileData" BYTEA,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scope" TEXT,
    "estimatedReadingMinutes" INTEGER,
    "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgmentDeadlineDays" INTEGER,
    "applicableAssetTypeIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "applicableAssetIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "applicableLocationIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "applicableRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ProcedureStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procedures_companyId_code_version_key"
  ON "procedures"("companyId", "code", "version");
CREATE INDEX "procedures_companyId_status_category_idx"
  ON "procedures"("companyId", "status", "category");
CREATE INDEX "procedures_companyId_code_idx"
  ON "procedures"("companyId", "code");

ALTER TABLE "procedures" ADD CONSTRAINT "procedures_replacesProcedureId_fkey"
  FOREIGN KEY ("replacesProcedureId") REFERENCES "procedures"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- replacedByProcedureId is the inverse pointer; we don't add a
-- separate FK constraint to avoid a circular dependency at insert
-- time. The application layer keeps both sides in sync.

CREATE TABLE "procedure_revisions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "procedureId" UUID NOT NULL,
    "revisionType" "RevisionType" NOT NULL,
    "changedBy" UUID NOT NULL,
    "changeNotes" TEXT,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedure_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "procedure_revisions_companyId_procedureId_createdAt_idx"
  ON "procedure_revisions"("companyId", "procedureId", "createdAt");

ALTER TABLE "procedure_revisions" ADD CONSTRAINT "procedure_revisions_procedureId_fkey"
  FOREIGN KEY ("procedureId") REFERENCES "procedures"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY procedure_isolation ON procedures
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE procedure_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY procedure_revision_isolation ON procedure_revisions
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON procedures TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON procedure_revisions TO app_user;

-- Audit triggers
CREATE TRIGGER audit_procedures
  AFTER INSERT OR UPDATE OR DELETE ON procedures
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_procedure_revisions
  AFTER INSERT OR UPDATE OR DELETE ON procedure_revisions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
