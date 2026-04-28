-- CreateEnum
CREATE TYPE "StatusChangeType" AS ENUM ('MANUAL', 'AUTO_BLOCK', 'AUTO_UNBLOCK', 'EXCEPTION_GRANTED', 'EXCEPTION_EXPIRED');

-- CreateTable
CREATE TABLE "asset_status_changes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "previousStatus" "AssetStatus" NOT NULL,
    "newStatus" "AssetStatus" NOT NULL,
    "changeType" "StatusChangeType" NOT NULL,
    "reason" TEXT,
    "changedBy" UUID,
    "triggeringDocumentTypeIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "triggeringAlertInstanceIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_status_changes_companyId_assetId_createdAt_idx" ON "asset_status_changes"("companyId", "assetId", "createdAt");

-- CreateIndex
CREATE INDEX "asset_status_changes_companyId_changeType_idx" ON "asset_status_changes"("companyId", "changeType");

-- AddForeignKey
ALTER TABLE "asset_status_changes" ADD CONSTRAINT "asset_status_changes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE asset_status_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_status_change_isolation ON asset_status_changes
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_status_changes TO app_user;

-- Audit trigger
CREATE TRIGGER audit_asset_status_changes
  AFTER INSERT OR UPDATE OR DELETE ON asset_status_changes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
