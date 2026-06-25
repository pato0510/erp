-- HR-007 hardening (review follow-up) — make the "exactly one PRINCIPAL
-- (parentContractId NULL) VIGENTE contract per employee" invariant INFALLIBLE at
-- the DB level, matching the project's partial-unique-index convention
-- (operational_assets.qrToken WHERE qrToken IS NOT NULL — 20260429150000;
-- alert_instances permit dedupe WHERE permitId IS NOT NULL — 20260428230000) and
-- CLAUDE.md's "integrity at the database level" rule.
--
-- The service already supersedes the prior principal (→ REEMPLAZADO) before the
-- insert, so this index never trips on a single-threaded request. It exists to
-- turn the concurrent-write race into a caught unique violation (Prisma P2002 →
-- a clean 409) instead of two silent VIGENTE principals. Anexos (parentContractId
-- NOT NULL) and non-VIGENTE rows are excluded by the partial predicate.
--
-- NOTE: Prisma cannot model a partial (filtered) unique index in schema.prisma,
-- so this index lives only in SQL and shows as benign drift on `prisma migrate
-- dev` — the same accepted situation as the qrToken partial index.
CREATE UNIQUE INDEX "employee_contracts_principal_vigente_unique"
  ON "employee_contracts" ("companyId", "employeeId")
  WHERE "parentContractId" IS NULL AND status = 'VIGENTE';
