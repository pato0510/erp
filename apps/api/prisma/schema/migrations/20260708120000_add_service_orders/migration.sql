-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('RECIBIDA', 'EN_EJECUCION', 'COMPLETADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'RECIBIDA',
    "clientName" TEXT NOT NULL,
    "counterpartyId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scopeLines" JSONB NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "ownerId" UUID,
    "sourceOpportunityId" UUID,
    "sourceQuoteId" UUID,
    "notes" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_orders_companyId_idx" ON "service_orders"("companyId");
-- Fast idempotency lookup for the COM-013b handoff handler (guard on sourceOpportunityId).
CREATE INDEX "service_orders_companyId_sourceOpportunityId_idx" ON "service_orders"("companyId", "sourceOpportunityId");
-- Per-company sequential number (OS-0001…).
CREATE UNIQUE INDEX "service_orders_companyId_orderNumber_key" ON "service_orders"("companyId", "orderNumber");

-- AddForeignKey — OPTIONAL counterparty link. ON DELETE SET NULL: a won deal may not have
-- a fiscal counterparty linked yet (AGS sometimes wins first, formalizes later), and
-- deleting a counterparty must NOT delete the order — only unlink it. Soft cross-module
-- provenance (sourceOpportunityId / sourceQuoteId) is deliberately kept as bare UUID
-- columns with NO foreign key, so Comercial and Operaciones stay decoupled (same pattern
-- as accounts.sourceCampaignId).
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-013a — platform invariant for every business table, templated VERBATIM
-- from work_permits / operational tables: company-isolation RLS policy + audit
-- trigger (reusing the platform audit_trigger_function) + the app_user GRANT.
-- Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_order_isolation ON service_orders
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON service_orders TO app_user;

-- Audit trigger
CREATE TRIGGER audit_service_orders
  AFTER INSERT OR UPDATE OR DELETE ON service_orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
