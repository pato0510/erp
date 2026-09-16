-- FIN-A — counterparty giro source fact and a single-criterion GIRO rule type.
-- Existing RLS policies, grants and audit triggers remain in force.
-- Historical giro is recovered by TaxService.backfillCounterpartyGiro;
-- this migration only alters the schema and never categorizes movements.
ALTER TABLE "counterparties" ADD COLUMN "giro" TEXT;
ALTER TYPE "CategoryRuleType" ADD VALUE 'GIRO';
