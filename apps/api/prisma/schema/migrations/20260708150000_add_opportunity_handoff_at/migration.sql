-- COM-013b — add the handoff timestamp to opportunities. NULLABLE: set once when a won
-- opportunity is sent to Operaciones (the "already-sent" guard) and reused as the stable
-- occurredAt of the comercial.opportunity-won domain event. No RLS/audit/GRANT change —
-- opportunities already has its RLS policy, app_user GRANT, and the row-level
-- audit_trigger_function() trigger, which captures this new column automatically (a
-- FOR EACH ROW trigger reads the whole NEW row, so added columns need no trigger change).
ALTER TABLE "opportunities" ADD COLUMN "handoffAt" TIMESTAMP(3);
