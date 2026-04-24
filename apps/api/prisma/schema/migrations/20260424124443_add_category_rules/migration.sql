-- CreateEnum
CREATE TYPE "CategoryRuleType" AS ENUM ('RUT', 'KEYWORD', 'DEFAULT');

-- CreateEnum
CREATE TYPE "CategoryRuleMovementType" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');

-- CreateTable
CREATE TABLE "category_rules" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "ruleType" "CategoryRuleType" NOT NULL,
    "matchValue" TEXT,
    "categoryId" UUID NOT NULL,
    "movementType" "CategoryRuleMovementType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_rules_companyId_ruleType_matchValue_movementType_key" ON "category_rules"("companyId", "ruleType", "matchValue", "movementType");

-- CreateIndex
CREATE INDEX "category_rules_companyId_isActive_priority_idx" ON "category_rules"("companyId", "isActive", "priority");

-- RLS
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY category_rule_isolation ON category_rules
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grant to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON category_rules TO app_user;

-- Audit trigger (per CLAUDE.md: every new table needs audit trigger)
CREATE TRIGGER audit_category_rules
  AFTER INSERT OR UPDATE OR DELETE ON category_rules
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
