-- COMERCIAL / CRM (DEMO) module — additive schema. Hand-authored to contain
-- ONLY the new CRM tables/enums/indexes/FKs. The auto-diff against this dev DB
-- also surfaces unrelated drift (a budgets branch leftover + index renames),
-- which is intentionally excluded here so this migration never touches Finance
-- or Operations objects.
--
-- Cross-module references (counterpartyId → Finance Counterparty,
-- sourceCampaignId → Marketing MarketingCampaign) are PLAIN columns with NO
-- foreign keys, by design. The only FKs created here are CRM-internal
-- (opportunity → stage, activity → opportunity).

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('NOTA', 'LLAMADA', 'REUNION', 'TAREA');

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_opportunities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "counterpartyId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "probability" INTEGER NOT NULL,
    "expectedCloseDate" DATE,
    "ownerName" TEXT NOT NULL,
    "stageId" UUID NOT NULL,
    "sourceCampaignId" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedCommitmentAmount" DECIMAL(14,2),
    "generatedCommitmentDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "counterpartyId" UUID,
    "opportunityId" UUID,
    "type" "CrmActivityType" NOT NULL,
    "content" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_stages_companyId_order_idx" ON "crm_stages"("companyId", "order");

-- CreateIndex
CREATE INDEX "crm_opportunities_companyId_stageId_idx" ON "crm_opportunities"("companyId", "stageId");

-- CreateIndex
CREATE INDEX "crm_opportunities_companyId_counterpartyId_idx" ON "crm_opportunities"("companyId", "counterpartyId");

-- CreateIndex
CREATE INDEX "crm_opportunities_companyId_sourceCampaignId_idx" ON "crm_opportunities"("companyId", "sourceCampaignId");

-- CreateIndex
CREATE INDEX "crm_activities_companyId_counterpartyId_idx" ON "crm_activities"("companyId", "counterpartyId");

-- CreateIndex
CREATE INDEX "crm_activities_companyId_opportunityId_idx" ON "crm_activities"("companyId", "opportunityId");

-- CreateIndex
CREATE INDEX "crm_activities_companyId_type_done_idx" ON "crm_activities"("companyId", "type", "done");

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "crm_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "crm_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
