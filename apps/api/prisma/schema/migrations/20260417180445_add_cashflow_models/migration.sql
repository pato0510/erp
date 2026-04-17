-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'CREDIT_LINE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "type" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "bankName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_balances" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "fiscalPeriodId" UUID NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "setBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalPeriodId" UUID NOT NULL,
    "counterpartyId" UUID,
    "categoryId" UUID,
    "type" "MovementType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "dueDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidBy" UUID,
    "movementId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_companyId_accountNumber_key" ON "bank_accounts"("companyId", "accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "account_balances_bankAccountId_fiscalPeriodId_key" ON "account_balances"("bankAccountId", "fiscalPeriodId");

-- CreateIndex
CREATE INDEX "commitments_companyId_dueDate_idx" ON "commitments"("companyId", "dueDate");

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS policies
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_account_isolation ON bank_accounts
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_balance_isolation ON account_balances
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commitment_isolation ON commitments
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_accounts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_balances TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON commitments TO app_user;

-- Audit triggers
CREATE TRIGGER audit_bank_accounts
  AFTER INSERT OR UPDATE OR DELETE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_account_balances
  AFTER INSERT OR UPDATE OR DELETE ON account_balances
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_commitments
  AFTER INSERT OR UPDATE OR DELETE ON commitments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
