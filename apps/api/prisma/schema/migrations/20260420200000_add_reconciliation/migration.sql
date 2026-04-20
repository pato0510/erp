-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'SUGGESTED', 'CONFIRMED', 'REJECTED', 'MANUAL');

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalPeriodId" UUID,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "confidenceScore" DECIMAL(5,4),
    "externalMovementId" UUID,
    "taxDocumentId" UUID,
    "movementId" UUID,
    "matchType" TEXT NOT NULL,
    "amountDifference" DECIMAL(18,2),
    "notes" TEXT,
    "confirmedBy" UUID,
    "confirmedAt" TIMESTAMP(3),
    "rejectedBy" UUID,
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_matches_companyId_fiscalPeriodId_status_idx" ON "reconciliation_matches"("companyId", "fiscalPeriodId", "status");

-- RLS
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_match_isolation ON reconciliation_matches
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_matches TO app_user;

-- Audit trigger
CREATE TRIGGER audit_reconciliation_matches
  AFTER INSERT OR UPDATE OR DELETE ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
