-- CreateTable
CREATE TABLE "company_goals" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "incomeGoal" DECIMAL(18,2),
    "expenseLimit" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_goals_companyId_year_key" ON "company_goals"("companyId", "year");

-- RLS
ALTER TABLE company_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_goal_isolation ON company_goals
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON company_goals TO app_user;

-- Audit trigger
CREATE TRIGGER audit_company_goals
  AFTER INSERT OR UPDATE OR DELETE ON company_goals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
