-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FACTURA_ELECTRONICA', 'BOLETA_ELECTRONICA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'LIQUIDACION_FACTURA', 'FACTURA_NO_AFECTA');

-- CreateEnum
CREATE TYPE "DocumentDirection" AS ENUM ('EMITIDO', 'RECIBIDO');

-- CreateEnum
CREATE TYPE "TaxDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tax_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalPeriodId" UUID,
    "type" "DocumentType" NOT NULL,
    "direction" "DocumentDirection" NOT NULL,
    "folio" INTEGER NOT NULL,
    "issuerRut" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "receiverRut" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "status" "TaxDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "xmlPath" TEXT,
    "pdfPath" TEXT,
    "metadata" JSONB,
    "movementId" UUID,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_sync_runs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalPeriodId" UUID,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'mock-sii',
    "direction" "DocumentDirection" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "documentsSynced" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_companyId_type_folio_direction_key" ON "tax_documents"("companyId", "type", "folio", "direction");

-- CreateIndex
CREATE INDEX "tax_documents_companyId_fiscalPeriodId_direction_idx" ON "tax_documents"("companyId", "fiscalPeriodId", "direction");

-- CreateIndex
CREATE INDEX "tax_documents_companyId_issuerRut_idx" ON "tax_documents"("companyId", "issuerRut");

-- CreateIndex
CREATE INDEX "tax_sync_runs_companyId_fiscalPeriodId_idx" ON "tax_sync_runs"("companyId", "fiscalPeriodId");

-- RLS
ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_document_isolation ON tax_documents
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE tax_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_sync_run_isolation ON tax_sync_runs
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax_documents TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON tax_sync_runs TO app_user;

-- Audit trigger for tax_documents (per CLAUDE.md: every new table needs audit trigger)
CREATE TRIGGER audit_tax_documents
  AFTER INSERT OR UPDATE OR DELETE ON tax_documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
