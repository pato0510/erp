-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'CLP',
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "invoicePrefix" TEXT,
    "decimalSeparator" TEXT NOT NULL DEFAULT ',',
    "thousandSeparator" TEXT NOT NULL DEFAULT '.',
    "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0.19,
    "extraSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS policy for company_settings
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_settings_isolation ON company_settings
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grant permissions to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON company_settings TO app_user;

-- Audit trigger for company_settings
CREATE TRIGGER audit_company_settings
  AFTER INSERT OR UPDATE OR DELETE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
