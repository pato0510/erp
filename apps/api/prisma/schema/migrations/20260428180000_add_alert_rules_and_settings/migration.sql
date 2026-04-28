-- AlterEnum: extend existing AlertSeverity (financial alerts only used INFO/WARNING/CRITICAL).
-- BLOCKING is added for the operational alert engine (OPS-018) and asset auto-blocking (OPS-020).
ALTER TYPE "AlertSeverity" ADD VALUE 'BLOCKING';

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "documentTypeId" UUID,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "daysBeforeExpiration" INTEGER NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "channels" JSONB NOT NULL DEFAULT '{"inApp":true,"email":false}',
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyAssignedUser" BOOLEAN NOT NULL DEFAULT true,
    "notifyOperationalSupervisor" BOOLEAN NOT NULL DEFAULT false,
    "escalateAfterDays" INTEGER,
    "escalateToRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_companyId_documentTypeId_isActive_idx" ON "alert_rules"("companyId", "documentTypeId", "isActive");

-- CreateIndex
CREATE INDEX "alert_rules_companyId_daysBeforeExpiration_idx" ON "alert_rules"("companyId", "daysBeforeExpiration");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "company_alert_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "defaultDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "defaultCriticalDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "defaultBlockingDaysBefore" INTEGER NOT NULL DEFAULT 0,
    "enableAutoBlocking" BOOLEAN NOT NULL DEFAULT true,
    "enableEmailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "defaultEscalationDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID NOT NULL,

    CONSTRAINT "company_alert_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_alert_settings_companyId_key" ON "company_alert_settings"("companyId");

-- RLS for alert_rules
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_rule_isolation ON alert_rules
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- RLS for company_alert_settings
ALTER TABLE company_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_alert_settings_isolation ON company_alert_settings
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_rules TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON company_alert_settings TO app_user;

-- Audit triggers
CREATE TRIGGER audit_alert_rules
  AFTER INSERT OR UPDATE OR DELETE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_company_alert_settings
  AFTER INSERT OR UPDATE OR DELETE ON company_alert_settings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
