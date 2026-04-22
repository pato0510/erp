-- CreateTable
CREATE TABLE "sii_connections" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "rut" TEXT NOT NULL,
    "certificatePath" TEXT,
    "certificatePasswordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sii_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sii_connections_companyId_key" ON "sii_connections"("companyId");

-- RLS
ALTER TABLE sii_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY sii_connection_isolation ON sii_connections
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON sii_connections TO app_user;

-- Audit trigger
CREATE TRIGGER audit_sii_connections
  AFTER INSERT OR UPDATE OR DELETE ON sii_connections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
