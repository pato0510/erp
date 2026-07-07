-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'SUPERSEDIDA');

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'BORRADOR',
    "validUntil" DATE,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "serviceName" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotes_companyId_idx" ON "quotes"("companyId");
CREATE INDEX "quotes_opportunityId_idx" ON "quotes"("opportunityId");
-- Per-company sequential number (COT-0001…) and per-opportunity version (1,2,3…).
CREATE UNIQUE INDEX "quotes_companyId_quoteNumber_key" ON "quotes"("companyId", "quoteNumber");
CREATE UNIQUE INDEX "quotes_opportunityId_version_key" ON "quotes"("opportunityId", "version");
-- ONE-ACCEPTED invariant, enforced at the DB level: AT MOST ONE quote per opportunity
-- may be in ACEPTADA. This is the hard backstop against a concurrent double-accept that
-- slips past the in-transaction pre-check; the service catches the unique violation and
-- returns a clean 409. Prisma cannot express a partial (filtered) unique index, so this
-- lives only in raw SQL — the same accepted pattern as OPS-035's qrToken partial unique.
CREATE UNIQUE INDEX "quotes_one_accepted_per_opportunity" ON "quotes"("opportunityId") WHERE "status" = 'ACEPTADA';

CREATE INDEX "quote_lines_companyId_idx" ON "quote_lines"("companyId");
CREATE INDEX "quote_lines_quoteId_idx" ON "quote_lines"("quoteId");
CREATE INDEX "quote_lines_serviceId_idx" ON "quote_lines"("serviceId");

-- AddForeignKey — a quote's opportunity. ON DELETE RESTRICT: an opportunity that has
-- quotes CANNOT be hard-deleted (quotes are commercial documents). This TIGHTENS the
-- COM-005 delete rule; the service surfaces it as a friendly 409 pre-check.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — quote lines are DEPENDENT CHILDREN of a quote. ON DELETE CASCADE:
-- deleting a (draft) quote removes its lines.
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — the catalog service a line references. ON DELETE RESTRICT (same
-- rationale as bundle lines): a catalog service referenced by any quote line cannot be
-- hard-deleted; deactivation is the normal path. The denormalized serviceName snapshot
-- means the document still reads correctly even if the catalog entry is later renamed.
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-010 — platform invariant for every business table, templated VERBATIM
-- from opportunities / accounts / contacts / activities: company-isolation RLS
-- policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT, for BOTH new tables. Kept in the migration so production gets it
-- on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_isolation ON quotes
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON quotes TO app_user;
CREATE TRIGGER audit_quotes
  AFTER INSERT OR UPDATE OR DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- RLS — quote_lines
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_line_isolation ON quote_lines
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON quote_lines TO app_user;
CREATE TRIGGER audit_quote_lines
  AFTER INSERT OR UPDATE OR DELETE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
