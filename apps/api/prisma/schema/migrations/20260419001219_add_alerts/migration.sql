-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('COMMITMENT_DUE', 'LOW_CASH_BALANCE', 'DRAFT_MOVEMENTS', 'PERIOD_CLOSING', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'RESOLVED');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "dismissedAt" TIMESTAMP(3),
    "dismissedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_thresholds" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lowCashThreshold" DECIMAL(18,2) NOT NULL DEFAULT 1000000,
    "commitmentDaysWarning" INTEGER NOT NULL DEFAULT 7,
    "commitmentDaysCritical" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_companyId_status_idx" ON "alerts"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alert_thresholds_companyId_key" ON "alert_thresholds"("companyId");

-- RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_isolation ON alerts
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_threshold_isolation ON alert_thresholds
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON alerts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_thresholds TO app_user;

CREATE TRIGGER audit_alerts
  AFTER INSERT OR UPDATE OR DELETE ON alerts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
