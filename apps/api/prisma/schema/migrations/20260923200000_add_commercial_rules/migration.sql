-- COM-023 — enum additions are not used as data in this migration.
ALTER TYPE "LostReason" ADD VALUE 'PLAZO' AFTER 'PRECIO';
ALTER TYPE "LostReason" ADD VALUE 'SIN_RESPUESTA' AFTER 'COMPETENCIA';
ALTER TYPE "CommercialActivityEvent" ADD VALUE 'RESPONSABLE' AFTER 'PROBABILIDAD';
ALTER TYPE "CommercialActivityEvent" ADD VALUE 'CUENTA_CLIENTE' AFTER 'REAPERTURA';

-- Table + indexes + business CHECKs (lazy defaults: no seed rows).
CREATE TABLE "opportunity_stage_probabilities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "stage" "OpportunityStage" NOT NULL,
    "probability" INTEGER NOT NULL,
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_stage_probabilities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opportunity_stage_probabilities_probability_check"
      CHECK ("probability" BETWEEN 0 AND 100 AND "probability" % 10 = 0),
    CONSTRAINT "opportunity_stage_probabilities_stage_check"
      CHECK ("stage" NOT IN ('GANADA', 'PERDIDA'))
);
CREATE UNIQUE INDEX "opportunity_stage_probabilities_companyId_stage_key"
  ON "opportunity_stage_probabilities"("companyId", "stage");
CREATE INDEX "opportunity_stage_probabilities_companyId_idx"
  ON "opportunity_stage_probabilities"("companyId");

-- RLS: same expression as activity_isolation.
ALTER TABLE opportunity_stage_probabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunity_stage_probability_isolation ON opportunity_stage_probabilities
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON opportunity_stage_probabilities TO app_user;

-- Audit trigger
CREATE TRIGGER audit_opportunity_stage_probabilities
  AFTER INSERT OR UPDATE OR DELETE ON opportunity_stage_probabilities
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
