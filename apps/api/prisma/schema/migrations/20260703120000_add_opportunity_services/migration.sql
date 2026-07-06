-- CreateTable
CREATE TABLE "opportunity_services" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_services_companyId_idx" ON "opportunity_services"("companyId");
CREATE INDEX "opportunity_services_opportunityId_idx" ON "opportunity_services"("opportunityId");
CREATE INDEX "opportunity_services_serviceId_idx" ON "opportunity_services"("serviceId");

-- CreateIndex — the same catalog service appears at most ONCE per opportunity
-- (adjust quantity on the existing line instead of duplicating it).
CREATE UNIQUE INDEX "opportunity_services_opportunityId_serviceId_key" ON "opportunity_services"("opportunityId", "serviceId");

-- AddForeignKey — bundle lines are DEPENDENT CHILDREN of an opportunity. ON DELETE
-- CASCADE: deleting an opportunity removes its bundle lines (same rationale as
-- contacts — a line has no life of its own without its deal).
ALTER TABLE "opportunity_services" ADD CONSTRAINT "opportunity_services_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — the catalog service a line references. ON DELETE RESTRICT: a
-- catalog service referenced by any line CANNOT be hard-deleted; deactivation
-- (isActive=false) is the normal path and never touches existing lines, so the
-- per-deal price snapshot stays intact.
ALTER TABLE "opportunity_services" ADD CONSTRAINT "opportunity_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "service_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- COM-006 — platform invariant for every business table, templated VERBATIM
-- from opportunities (20260702150000) / accounts / contacts: company-isolation
-- RLS policy + audit trigger (reusing the platform audit_trigger_function) + the
-- app_user GRANT. Kept in the migration so production gets it on `migrate deploy`.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE opportunity_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunity_service_isolation ON opportunity_services
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON opportunity_services TO app_user;

-- Audit trigger
CREATE TRIGGER audit_opportunity_services
  AFTER INSERT OR UPDATE OR DELETE ON opportunity_services
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
