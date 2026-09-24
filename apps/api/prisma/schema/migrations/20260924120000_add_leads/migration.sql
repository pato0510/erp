-- COM-024 — minimal lead, scoped to an account; optional existing contact.
-- Table + indexes + business CHECK. Actor UUIDs follow the no-FK convention.
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "contactId" UUID,
    "name" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leads_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 200),
    CONSTRAINT "leads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "leads_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "leads_companyId_idx" ON "leads"("companyId");
CREATE INDEX "leads_accountId_idx" ON "leads"("accountId");
CREATE INDEX "leads_contactId_idx" ON "leads"("contactId");

-- Uniqueness lives HERE, not in Prisma (it cannot express lower(name)):
-- one name per account, case-insensitive. P2002 is the service's race backstop.
CREATE UNIQUE INDEX "leads_accountId_lower_name_key" ON "leads"("accountId", lower("name"));

-- COM-024 — platform invariant, same expression as enterprise_isolation /
-- opportunity_document_isolation. Kept here for production migrate deploy.
-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_isolation ON leads
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON leads TO app_user;

-- Audit trigger
CREATE TRIGGER audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- One lead -> many opportunities. RESTRICT enforces L4 even on a raw delete.
ALTER TABLE "opportunities" ADD COLUMN "leadId" UUID;
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "opportunities_leadId_idx" ON "opportunities"("leadId");

-- Enum addition is not used as data in this migration.
ALTER TYPE "CommercialActivityEvent" ADD VALUE 'LEAD_DESVINCULADO' AFTER 'LEAD';
