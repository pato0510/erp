-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM (
    'ALERT_INSTANCE',
    'ASSET_BLOCKED',
    'ESCALATION',
    'DOCUMENT_REJECTED',
    'DOCUMENT_APPROVED',
    'EXCEPTION_REQUESTED',
    'EXCEPTION_GRANTED',
    'GENERAL'
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "alertInstanceId" UUID,
    "sourceType" "NotificationSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "linkPath" TEXT,
    "icon" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_notifications_companyId_userId_isRead_createdAt_idx"
  ON "user_notifications"("companyId", "userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "user_notifications_companyId_userId_isDismissed_idx"
  ON "user_notifications"("companyId", "userId", "isDismissed");

-- CreateIndex
CREATE INDEX "user_notifications_alertInstanceId_idx" ON "user_notifications"("alertInstanceId");

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_alertInstanceId_fkey"
  FOREIGN KEY ("alertInstanceId") REFERENCES "alert_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS — strict per-user policy. Notifications stay private even within the
-- same tenant: a row is visible only when both companyId and userId match
-- the connection-local rls.* settings RlsService configures.
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_notification_isolation ON user_notifications
  USING (
    "companyId" = current_setting('rls.company_id', true)::uuid
    AND "userId"  = current_setting('rls.user_id', true)::uuid
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON user_notifications TO app_user;

-- Audit trigger
CREATE TRIGGER audit_user_notifications
  AFTER INSERT OR UPDATE OR DELETE ON user_notifications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
