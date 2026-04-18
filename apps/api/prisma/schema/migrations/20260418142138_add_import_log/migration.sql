-- CreateTable
CREATE TABLE "import_logs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "errorRows" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

-- RLS policy
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_log_isolation ON import_logs
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON import_logs TO app_user;

CREATE TRIGGER audit_import_logs
  AFTER INSERT OR UPDATE OR DELETE ON import_logs
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
