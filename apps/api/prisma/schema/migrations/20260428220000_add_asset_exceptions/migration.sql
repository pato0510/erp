-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "asset_exceptions" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "requestedBy" UUID NOT NULL,
    "requestedReason" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedDocumentTypeIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "ExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" UUID,
    "approvedReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" UUID,
    "rejectedReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "previousStatus" "AssetStatus",
    "expiresHandled" BOOLEAN NOT NULL DEFAULT false,
    "revokedBy" UUID,
    "revokedReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_exceptions_companyId_status_validUntil_idx"
  ON "asset_exceptions"("companyId", "status", "validUntil");

-- CreateIndex
CREATE INDEX "asset_exceptions_companyId_assetId_status_idx"
  ON "asset_exceptions"("companyId", "assetId", "status");

-- AddForeignKey
ALTER TABLE "asset_exceptions" ADD CONSTRAINT "asset_exceptions_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE asset_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_exception_isolation ON asset_exceptions
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_exceptions TO app_user;

-- Audit trigger
CREATE TRIGGER audit_asset_exceptions
  AFTER INSERT OR UPDATE OR DELETE ON asset_exceptions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
