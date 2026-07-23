-- CAL-015 — NEIGHBOR-TABLE SURGERY (MKT-006 discipline): ADDITIVE ONLY. ServiceOrder gains its
-- execution window — two nullable @db.Date columns + one index. Nothing pre-existing moves: the
-- status enum, the columns, the (companyId)/(companyId, sourceOpportunityId) indexes, the RLS
-- policy, the audit trigger and the app_user GRANT on service_orders (migration
-- 20260708120000_add_service_orders) are ALL UNTOUCHED. These dates are the calendar's date
-- SOURCE (recon Q1: the ServiceOrder had none) — pure scheduling data, NOT a status-machine field.
ALTER TABLE "service_orders" ADD COLUMN "executionStart" DATE;
ALTER TABLE "service_orders" ADD COLUMN "executionEnd" DATE;

CREATE INDEX "service_orders_companyId_executionStart_idx" ON "service_orders"("companyId", "executionStart");
