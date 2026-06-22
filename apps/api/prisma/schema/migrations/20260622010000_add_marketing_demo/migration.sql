-- MARKETING (DEMO) module — additive schema. Hand-authored to contain ONLY the
-- new Marketing tables/enums/indexes/FKs. The auto-diff against this dev DB
-- also surfaces unrelated drift (a budgets branch leftover + index renames),
-- which is intentionally excluded here so this migration never touches Finance
-- or Operations objects.

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANIFICADA', 'ACTIVA', 'FINALIZADA');

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANIFICADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_expenses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "channel" TEXT,
    "campaignId" UUID,
    "financeCategoryId" UUID,
    "financeCategoryName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_keywords" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "currentPosition" INTEGER NOT NULL,
    "previousPosition" INTEGER NOT NULL,
    "monthlyTraffic" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_campaigns_companyId_status_idx" ON "marketing_campaigns"("companyId", "status");

-- CreateIndex
CREATE INDEX "marketing_campaigns_companyId_startDate_idx" ON "marketing_campaigns"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "marketing_expenses_companyId_date_idx" ON "marketing_expenses"("companyId", "date");

-- CreateIndex
CREATE INDEX "marketing_expenses_companyId_campaignId_idx" ON "marketing_expenses"("companyId", "campaignId");

-- CreateIndex
CREATE INDEX "seo_keywords_companyId_currentPosition_idx" ON "seo_keywords"("companyId", "currentPosition");

-- AddForeignKey
ALTER TABLE "marketing_expenses" ADD CONSTRAINT "marketing_expenses_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
