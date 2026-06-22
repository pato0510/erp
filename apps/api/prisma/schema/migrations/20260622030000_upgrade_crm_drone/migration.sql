-- COMERCIAL / CRM (DEMO) upgrade — Salesforce/Monday-style drone CRM. ADDITIVE,
-- hand-authored to contain ONLY the new CRM enums/tables/columns/indexes/FKs.
-- The auto-diff against this dev DB also surfaces unrelated drift (a FIN-001
-- budgets branch leftover + index renames), which is intentionally excluded here
-- so this migration never touches Finance or Operations objects.
--
-- Cross-module references (counterpartyId → Finance Counterparty,
-- sourceCampaignId → Marketing MarketingCampaign, serviceId → ServiceCatalog,
-- convertedFromLeadId → CrmLead, leadId → CrmLead) are PLAIN columns with NO
-- foreign keys, by design. The only FK created here is CRM-internal
-- (crm_quote_items.quoteId → crm_quotes.id, ON DELETE CASCADE).
--
-- All ADD COLUMN statements are IF NOT EXISTS / carry defaults so the migration
-- is safe to re-apply and never rewrites existing rows.

-- CreateEnum
CREATE TYPE "CrmLeadSource" AS ENUM ('WEB', 'SEO', 'CAMPANA', 'REFERIDO', 'LINKEDIN', 'LLAMADA', 'FERIA');

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NUEVO', 'CONTACTADO', 'CALIFICADO', 'DESCARTADO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "CrmLeadPriority" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('DRONE', 'LIMPIEZA', 'INSPECCION', 'AUDIOVISUAL', 'INDUSTRIAL');

-- CreateEnum
CREATE TYPE "BillingUnit" AS ENUM ('HORA', 'JORNADA', 'M2', 'EVENTO', 'PROYECTO', 'MENSUAL');

-- CreateEnum
CREATE TYPE "CrmQuoteStatus" AS ENUM ('BORRADOR', 'EN_REVISION', 'APROBADA', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA', 'REEMPLAZADA');

-- AlterTable — extend crm_opportunities (drone/industrial commercial detail).
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "serviceId" UUID;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "needDetected" TEXT;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "serviceZone" TEXT;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "requiresVisit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "requiresDrone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "requiresCertifiedStaff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "lossReason" TEXT;
ALTER TABLE "crm_opportunities" ADD COLUMN IF NOT EXISTS "convertedFromLeadId" UUID;

-- AlterTable — extend crm_activities (pin an activity to a lead).
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "leadId" UUID;

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "contactName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "serviceInterest" TEXT,
    "source" "CrmLeadSource" NOT NULL,
    "sourceCampaignId" UUID,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NUEVO',
    "ownerName" TEXT NOT NULL,
    "priority" "CrmLeadPriority" NOT NULL DEFAULT 'MEDIA',
    "discardReason" TEXT,
    "createdDate" DATE NOT NULL,
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "description" TEXT,
    "billingUnit" "BillingUnit" NOT NULL,
    "basePrice" DECIMAL(14,2) NOT NULL,
    "requiresEquipment" BOOLEAN NOT NULL DEFAULT false,
    "requiresCertifiedStaff" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quotes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID,
    "counterpartyId" UUID NOT NULL,
    "status" "CrmQuoteStatus" NOT NULL DEFAULT 'BORRADOR',
    "validUntil" DATE,
    "executionTerm" TEXT,
    "commercialConditions" TEXT,
    "technicalNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ivaAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_quote_items" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "serviceId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "crm_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_leads_companyId_status_idx" ON "crm_leads"("companyId", "status");

-- CreateIndex
CREATE INDEX "service_catalog_companyId_category_idx" ON "service_catalog"("companyId", "category");

-- CreateIndex
CREATE INDEX "crm_quotes_companyId_status_idx" ON "crm_quotes"("companyId", "status");

-- CreateIndex
CREATE INDEX "crm_quote_items_companyId_quoteId_idx" ON "crm_quote_items"("companyId", "quoteId");

-- AddForeignKey
ALTER TABLE "crm_quote_items" ADD CONSTRAINT "crm_quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "crm_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
