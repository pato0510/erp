-- MARKETING CALENDAR UPGRADE (DEMO) — additive schema. Hand-authored to contain
-- ONLY the new Marketing enums/columns/tables/indexes/FKs. Touches NO Finance /
-- Operations / Comercial objects. The auto-diff against this dev DB would also
-- surface unrelated drift (a budgets branch leftover + index renames), which is
-- intentionally excluded here.
--
-- ENUM VALUES: the new "CampaignStatus" values are added with
-- "ADD VALUE IF NOT EXISTS" (each statement run OUTSIDE a transaction by the
-- operator), so re-applying this migration is safe.

-- AlterEnum: extend CampaignStatus (additive — keeps PLANIFICADA/ACTIVA/FINALIZADA)
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'BORRADOR';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'EN_PRODUCCION';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PROGRAMADA';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSADA';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'ANALIZADA';

-- CreateEnum
CREATE TYPE "CalendarItemType" AS ENUM ('CAMPANA', 'PUBLICACION', 'CONTENIDO_SEO', 'EMAIL', 'CAMPANA_PAGADA', 'EVENTO', 'TAREA', 'ACCION_CRM');

-- CreateEnum
CREATE TYPE "CalendarItemStatus" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'PROGRAMADO', 'PUBLICADO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CampaignTaskType" AS ENUM ('CONTENIDO', 'DISENO', 'APROBACION', 'CONFIGURACION', 'PUBLICACION', 'REVISION', 'CONTACTO_LEADS');

-- AlterTable: commercial-brief columns on marketing_campaigns
ALTER TABLE "marketing_campaigns" ADD COLUMN "objective" TEXT;
ALTER TABLE "marketing_campaigns" ADD COLUMN "serviceAssociated" TEXT;
ALTER TABLE "marketing_campaigns" ADD COLUMN "targetSegment" TEXT;
ALTER TABLE "marketing_campaigns" ADD COLUMN "zone" TEXT;
ALTER TABLE "marketing_campaigns" ADD COLUMN "ownerName" TEXT;
ALTER TABLE "marketing_campaigns" ADD COLUMN "ctaType" TEXT;
ALTER TABLE "marketing_campaigns" ADD COLUMN "kpiTarget" TEXT;

-- CreateTable
CREATE TABLE "calendar_items" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "type" "CalendarItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "endDate" DATE,
    "channel" TEXT,
    "status" "CalendarItemStatus" NOT NULL DEFAULT 'PENDIENTE',
    "ownerName" TEXT,
    "serviceId" UUID,
    "serviceName" TEXT,
    "targetSegment" TEXT,
    "zone" TEXT,
    "campaignId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_tasks" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CampaignTaskType" NOT NULL,
    "dueDate" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_metrics" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "leadsGenerated" INTEGER NOT NULL DEFAULT 0,
    "leadsQualified" INTEGER NOT NULL DEFAULT 0,
    "meetingsBooked" INTEGER NOT NULL DEFAULT 0,
    "quotesIssued" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesCreated" INTEGER NOT NULL DEFAULT 0,
    "salesClosed" INTEGER NOT NULL DEFAULT 0,
    "costPerLead" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "attributedRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_items_companyId_date_idx" ON "calendar_items"("companyId", "date");

-- CreateIndex
CREATE INDEX "calendar_items_companyId_type_idx" ON "calendar_items"("companyId", "type");

-- CreateIndex
CREATE INDEX "calendar_items_companyId_campaignId_idx" ON "calendar_items"("companyId", "campaignId");

-- CreateIndex
CREATE INDEX "campaign_tasks_companyId_campaignId_idx" ON "campaign_tasks"("companyId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_metrics_campaignId_key" ON "campaign_metrics"("campaignId");

-- AddForeignKey
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_tasks" ADD CONSTRAINT "campaign_tasks_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_metrics" ADD CONSTRAINT "campaign_metrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
