-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('PROSPECTO', 'CONTACTO', 'VISITA_TECNICA', 'COTIZACION', 'NEGOCIACION', 'GANADA', 'PERDIDA', 'EN_PAUSA');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRECIO', 'COMPETENCIA', 'PROYECTO_CANCELADO', 'OTRO');

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'PROSPECTO',
    "previousStage" "OpportunityStage",
    "estimatedValue" DECIMAL(18,2),
    "probability" INTEGER,
    "expectedCloseDate" DATE,
    "ownerId" UUID,
    "lostReason" "LostReason",
    "lostReasonDetail" TEXT,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunities_companyId_idx" ON "opportunities"("companyId");
CREATE INDEX "opportunities_accountId_idx" ON "opportunities"("accountId");
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");

-- AddForeignKey — REQUIRED parent account. ON DELETE RESTRICT: an account with
-- opportunities cannot be hard-deleted (the account's own soft-deactivate lifecycle
-- is unaffected). Deliberately unlike contacts' CASCADE — an opportunity is a
-- first-class pipeline record, not a disposable child.
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-005 — platform invariant for every business table, templated VERBATIM
-- from accounts (20260702130000) / contacts: company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunity_isolation ON opportunities
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON opportunities TO app_user;

-- Audit trigger
CREATE TRIGGER audit_opportunities
  AFTER INSERT OR UPDATE OR DELETE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
