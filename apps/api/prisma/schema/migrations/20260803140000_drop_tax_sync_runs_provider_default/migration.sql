-- TAX-001 — drop the latent 'mock-sii' column default on tax_sync_runs.provider.
-- FASE 0 (verified against production, 2026-08-03) proved the SII integration runs
-- 100% against the real BaseAPI provider — zero 'mock-sii' rows ever. The column
-- still carried DEFAULT 'mock-sii', which no app code relies on (TaxService always
-- supplies `provider` explicitly) but which would let a raw INSERT omitting the
-- column silently label real fiscal data as mock. With the default gone and the
-- column still NOT NULL, such an INSERT now FAILS LOUDLY instead of lying.
-- Existing rows are untouched by DROP DEFAULT.
--
-- NO new table is created here, so the house per-table template (RLS policy +
-- audit trigger + app_user GRANT) does NOT apply to this migration.

ALTER TABLE "tax_sync_runs" ALTER COLUMN "provider" DROP DEFAULT;
