-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('CLIENT', 'SUPPLIER', 'BANK', 'GOVERNMENT', 'OTHER');

-- CreateTable
CREATE TABLE "counterparties" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CounterpartyType" NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_companyId_taxId_key" ON "counterparties"("companyId", "taxId");

-- RLS policy
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;

CREATE POLICY counterparty_isolation ON counterparties
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grant to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON counterparties TO app_user;

-- Audit trigger
CREATE TRIGGER audit_counterparties
  AFTER INSERT OR UPDATE OR DELETE ON counterparties
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
