-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'PENDING');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerCredentials" JSONB,
    "status" "BankConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_sync_runs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankConnectionId" UUID NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "balancesSynced" INTEGER NOT NULL DEFAULT 0,
    "movementsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_bank_movements" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "bankConnectionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "type" TEXT NOT NULL,
    "balance" DECIMAL(18,2),
    "metadata" JSONB,
    "movementId" UUID,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_bank_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_bank_movements_bankConnectionId_externalId_key" ON "external_bank_movements"("bankConnectionId", "externalId");

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "bank_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_bank_movements" ADD CONSTRAINT "external_bank_movements_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "bank_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_connection_isolation ON bank_connections USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE bank_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_sync_run_isolation ON bank_sync_runs USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE external_bank_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY external_bank_movement_isolation ON external_bank_movements USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON bank_connections TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_sync_runs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON external_bank_movements TO app_user;

CREATE TRIGGER audit_bank_connections AFTER INSERT OR UPDATE OR DELETE ON bank_connections FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
