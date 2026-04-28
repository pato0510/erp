-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('LEGAL', 'SAFETY', 'OPERATIONAL', 'FINANCIAL', 'TECHNICAL', 'ADMINISTRATIVE');

-- CreateEnum
CREATE TYPE "DocumentCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "hasExpiration" BOOLEAN NOT NULL DEFAULT false,
    "defaultValidityDays" INTEGER,
    "criticality" "DocumentCriticality" NOT NULL,
    "blocksOperation" BOOLEAN NOT NULL DEFAULT false,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "criticalAlertDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "assetTypeId" UUID,
    "assetSubtypeId" UUID,
    "assetId" UUID,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_requirements_single_target_check" CHECK (
        ("assetTypeId" IS NOT NULL)::int +
        ("assetSubtypeId" IS NOT NULL)::int +
        ("assetId" IS NOT NULL)::int = 1
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "document_types_companyId_code_key" ON "document_types"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_companyId_name_key" ON "document_types"("companyId", "name");

-- CreateIndex
CREATE INDEX "document_types_companyId_category_idx" ON "document_types"("companyId", "category");

-- CreateIndex
CREATE INDEX "document_requirements_companyId_documentTypeId_idx" ON "document_requirements"("companyId", "documentTypeId");

-- CreateIndex
CREATE INDEX "document_requirements_companyId_assetTypeId_idx" ON "document_requirements"("companyId", "assetTypeId");

-- CreateIndex
CREATE INDEX "document_requirements_companyId_assetSubtypeId_idx" ON "document_requirements"("companyId", "assetSubtypeId");

-- CreateIndex
CREATE INDEX "document_requirements_companyId_assetId_idx" ON "document_requirements"("companyId", "assetId");

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_assetSubtypeId_fkey" FOREIGN KEY ("assetSubtypeId") REFERENCES "asset_subtypes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS for document_types
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_type_isolation ON document_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- RLS for document_requirements
ALTER TABLE document_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_requirement_isolation ON document_requirements
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON document_types TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_requirements TO app_user;

-- Audit triggers
CREATE TRIGGER audit_document_types
  AFTER INSERT OR UPDATE OR DELETE ON document_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_document_requirements
  AFTER INSERT OR UPDATE OR DELETE ON document_requirements
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
