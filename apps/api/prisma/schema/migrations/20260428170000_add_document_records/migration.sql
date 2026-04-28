-- CreateEnum
CREATE TYPE "DocumentRecordStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REPLACED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "document_records" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" TEXT,
    "fileData" BYTEA,
    "issueDate" DATE,
    "expirationDate" DATE,
    "status" "DocumentRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedBy" UUID,
    "uploadedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" UUID,
    "rejectedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacedByDocumentId" UUID,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_records_companyId_assetId_idx" ON "document_records"("companyId", "assetId");

-- CreateIndex
CREATE INDEX "document_records_companyId_documentTypeId_idx" ON "document_records"("companyId", "documentTypeId");

-- CreateIndex
CREATE INDEX "document_records_companyId_status_idx" ON "document_records"("companyId", "status");

-- CreateIndex
CREATE INDEX "document_records_companyId_expirationDate_idx" ON "document_records"("companyId", "expirationDate");

-- AddForeignKey
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_replacedByDocumentId_fkey" FOREIGN KEY ("replacedByDocumentId") REFERENCES "document_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS for document_records
ALTER TABLE document_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_record_isolation ON document_records
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON document_records TO app_user;

-- Audit trigger
CREATE TRIGGER audit_document_records
  AFTER INSERT OR UPDATE OR DELETE ON document_records
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
