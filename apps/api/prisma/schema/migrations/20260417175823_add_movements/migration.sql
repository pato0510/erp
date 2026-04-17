-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'RECONCILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementSource" AS ENUM ('MANUAL', 'IMPORT', 'BANK_SYNC', 'TAX_SYNC');

-- CreateTable
CREATE TABLE "movements" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalPeriodId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "counterpartyId" UUID,
    "costCenterId" UUID,
    "type" "MovementType" NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "MovementSource" NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "exchangeRate" DECIMAL(10,6),
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movements_companyId_date_idx" ON "movements"("companyId", "date");

-- CreateIndex
CREATE INDEX "movements_companyId_fiscalPeriodId_idx" ON "movements"("companyId", "fiscalPeriodId");

-- CreateIndex
CREATE INDEX "movements_companyId_type_status_idx" ON "movements"("companyId", "type", "status");

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS policy
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY movement_isolation ON movements
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grant to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON movements TO app_user;

-- Audit trigger
CREATE TRIGGER audit_movements
  AFTER INSERT OR UPDATE OR DELETE ON movements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
