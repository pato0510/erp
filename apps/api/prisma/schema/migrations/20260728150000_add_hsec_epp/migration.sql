-- HSEC-008 — the EPP surface: catalog + deliveries + lines (THREE tables in one
-- hand-authored migration). The house template (RLS + audit trigger + GRANT) is
-- copied VERBATIM in shape from the freshest table migration
-- (20260721130000_add_calendar_activity_notes), applied to EACH table.

-- CreateTable — the per-company EPP catalog. Inactivate-not-delete when used:
-- the line FK below is ON DELETE RESTRICT (DB backup for the pristine-only
-- delete rule; the service turns P2003 into the Spanish 409).
CREATE TABLE "hsec_epp_items" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hsec_epp_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable — one delivery event per worker per date. employeeId is a BARE
-- uuid (leaf-resolved); the single optional acuse scan uses the Procedure-shaped
-- nullable file columns (the HsecTraining convention).
CREATE TABLE "hsec_epp_deliveries" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "filePath" TEXT,
    "fileData" BYTEA,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hsec_epp_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable — the delivered items (qty + talla), children of a delivery.
CREATE TABLE "hsec_epp_delivery_lines" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "eppItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "size" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hsec_epp_delivery_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hsec_epp_items_companyId_name_key" ON "hsec_epp_items"("companyId", "name");
CREATE INDEX "hsec_epp_items_companyId_idx" ON "hsec_epp_items"("companyId");
CREATE INDEX "hsec_epp_deliveries_companyId_idx" ON "hsec_epp_deliveries"("companyId");
CREATE INDEX "hsec_epp_deliveries_companyId_employeeId_idx" ON "hsec_epp_deliveries"("companyId", "employeeId");
CREATE INDEX "hsec_epp_deliveries_companyId_date_idx" ON "hsec_epp_deliveries"("companyId", "date");
CREATE INDEX "hsec_epp_delivery_lines_companyId_idx" ON "hsec_epp_delivery_lines"("companyId");
CREATE INDEX "hsec_epp_delivery_lines_deliveryId_idx" ON "hsec_epp_delivery_lines"("deliveryId");

-- AddForeignKey — deliveryId → hsec_epp_deliveries ON DELETE CASCADE (deleting a
-- delivery deletes its lines; the audit trigger keeps everything). eppItemId →
-- hsec_epp_items ON DELETE RESTRICT (a referenced catalog item cannot be deleted —
-- historical deliveries keep their item; the catalog inactivates instead).
ALTER TABLE "hsec_epp_delivery_lines" ADD CONSTRAINT "hsec_epp_delivery_lines_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "hsec_epp_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hsec_epp_delivery_lines" ADD CONSTRAINT "hsec_epp_delivery_lines_eppItemId_fkey" FOREIGN KEY ("eppItemId") REFERENCES "hsec_epp_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- HSEC-008 — platform invariant for every business table, templated VERBATIM
-- from calendar_activity_notes (20260721130000): company-isolation RLS policy +
-- audit trigger (reusing the platform audit_trigger_function) + the app_user
-- GRANT — applied to EACH of the three tables. The DELETE grant on the lines is
-- required so the parent-delivery CASCADE can remove them under RLS.
-- ─────────────────────────────────────────────────────────────────────────

-- RLS
ALTER TABLE hsec_epp_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_epp_item_isolation ON hsec_epp_items
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE hsec_epp_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_epp_delivery_isolation ON hsec_epp_deliveries
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE hsec_epp_delivery_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY hsec_epp_delivery_line_isolation ON hsec_epp_delivery_lines
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_epp_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_epp_deliveries TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hsec_epp_delivery_lines TO app_user;

-- Audit triggers
CREATE TRIGGER audit_hsec_epp_items
  AFTER INSERT OR UPDATE OR DELETE ON hsec_epp_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_hsec_epp_deliveries
  AFTER INSERT OR UPDATE OR DELETE ON hsec_epp_deliveries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_hsec_epp_delivery_lines
  AFTER INSERT OR UPDATE OR DELETE ON hsec_epp_delivery_lines
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
