-- CreateEnum
CREATE TYPE "OpportunityDocumentKind" AS ENUM ('COTIZACION', 'ACTA_REUNION', 'OTRO');

-- CreateTable
CREATE TABLE "opportunity_documents" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "kind" "OpportunityDocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "opportunity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_documents_companyId_idx" ON "opportunity_documents"("companyId");
CREATE INDEX "opportunity_documents_opportunityId_createdAt_idx" ON "opportunity_documents"("opportunityId", "createdAt" DESC);

-- AddForeignKey — a document is a DEPENDENT CHILD of the opportunity. ON DELETE CASCADE:
-- deleting the deal removes its document rows (same rationale as opportunity_notes).
-- Soft-deleted rows (deletedAt set) stay for the audit story; the storage object is
-- retained either way (hard purge is V2).
ALTER TABLE "opportunity_documents" ADD CONSTRAINT "opportunity_documents_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-017 — platform invariant for every business table, templated VERBATIM
-- from opportunity_notes (20260916120000) / activities / opportunities:
-- company-isolation RLS policy + audit trigger (reusing the platform
-- audit_trigger_function) + the app_user GRANT. Kept in the migration so
-- production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE opportunity_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunity_document_isolation ON opportunity_documents
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON opportunity_documents TO app_user;

-- Audit trigger
CREATE TRIGGER audit_opportunity_documents
  AFTER INSERT OR UPDATE OR DELETE ON opportunity_documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
