-- CreateEnum
CREATE TYPE "AlertTriggerType" AS ENUM ('EXPIRING_SOON', 'EXPIRED', 'MISSING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "AlertInstanceStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'DISMISSED');

-- CreateTable
CREATE TABLE "alert_instances" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "alertRuleId" UUID,
    "documentTypeId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "documentRecordId" UUID,
    "triggerType" "AlertTriggerType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "daysBeforeExpiration" INTEGER NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" DATE,
    "status" "AlertInstanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledgedBy" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolvedReason" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "notifiedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifiedUsers" UUID[] DEFAULT ARRAY[]::UUID[],
    "title" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotency key — prevents duplicate ACTIVE alerts at the same threshold)
CREATE UNIQUE INDEX "alert_instances_companyId_assetId_documentTypeId_triggerType_daysBefore_status_key"
  ON "alert_instances"("companyId", "assetId", "documentTypeId", "triggerType", "daysBeforeExpiration", "status");

-- CreateIndex
CREATE INDEX "alert_instances_companyId_status_triggeredAt_idx" ON "alert_instances"("companyId", "status", "triggeredAt");

-- CreateIndex
CREATE INDEX "alert_instances_companyId_assetId_status_idx" ON "alert_instances"("companyId", "assetId", "status");

-- CreateIndex
CREATE INDEX "alert_instances_companyId_severity_status_idx" ON "alert_instances"("companyId", "severity", "status");

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_documentRecordId_fkey" FOREIGN KEY ("documentRecordId") REFERENCES "document_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS for alert_instances
ALTER TABLE alert_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_instance_isolation ON alert_instances
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_instances TO app_user;

-- Audit trigger
CREATE TRIGGER audit_alert_instances
  AFTER INSERT OR UPDATE OR DELETE ON alert_instances
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
