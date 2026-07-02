-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_companyId_idx" ON "contacts"("companyId");
CREATE INDEX "contacts_accountId_idx" ON "contacts"("accountId");

-- AddForeignKey — a contact is a DEPENDENT CHILD of its account. ON DELETE CASCADE:
-- deleting an account takes its contacts with it (deliberately unlike the account↔
-- counterparty SET NULL peer reference in COM-003).
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-004 — platform invariant for every business table, templated VERBATIM
-- from accounts (20260702130000) / service_catalog: company-isolation RLS policy
-- + audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_isolation ON contacts
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO app_user;

-- Audit trigger
CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
