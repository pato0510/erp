# FASE 0 — Production Verification (Step 0)

**Date:** 2026-06-22
**Mode:** READ-ONLY against PRODUCTION. SELECT / catalog inspection only. No writes, no DDL, no `prisma migrate*`. No secret values printed.
**This file is a deliverable left on disk — NOT committed.**

---

## ⚠️ ACCESS STATUS — PRODUCTION NOT REACHABLE

The Railway CLI is installed (`railway` v4.44.0) and `psql` 18.3 is available, but **the Railway session is unauthenticated** — the stored OAuth token failed to refresh:

```
$ railway whoami
Warning: failed to refresh OAuth token: Token refresh failed: invalid_grant ...
Unauthorized. Please run `railway login` again.
```

There is no `RAILWAY_TOKEN` / `RAILWAY_API_TOKEN` in the environment for non-interactive auth. `railway login` is interactive (browser OAuth) and cannot be performed inside this agent session.

**Consequence:** every check that depends on the live database or `railway variables` is **NOT VERIFIED**. Each is written below with the exact read-only command for the owner to run. The local dev DB (`localhost:5432/excelsia_dev`, user `excelsia`) was deliberately **not** used to infer production state.

**The only check completed here is B3**, which is a static analysis of repo files (`apps/api/railway.json` + the migration SQL) and does not touch production.

### To complete this pass
1. Authenticate (interactive — run it yourself; e.g. type `! railway login` in the Claude prompt so output lands in-session):
   ```
   railway login
   railway link        # select project: erp · environment: production · service: api
   ```
2. Then either tell me to continue (I'll run the live pass), or run the commands in each section yourself.

---

## A. Runtime Role & RLS Posture — **NOT VERIFIED**

**A1 — connected DB username** (no password/URL ever printed). Once connected via `railway connect postgres`, the username is simply the connected role:
```sql
SELECT current_user AS connected_role;
```

**A2 — role privileges:**
```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole
FROM pg_roles WHERE rolname IN (current_user, 'excelsia', 'app_user') ORDER BY rolname;
```

**A3 — RLS enabled vs forced per table:**
```sql
SELECT relname, relrowsecurity AS enabled, relforcerowsecurity AS forced
FROM pg_class WHERE relrowsecurity = true ORDER BY relname;
```

**A4 — table ownership:**
```sql
SELECT tablename, tableowner FROM pg_tables
WHERE schemaname='public' ORDER BY tablename LIMIT 100;
```

**A5 — interpretation (to be filled from A1–A4):** RLS is effectively bypassed if the connected role (A1) is `rolsuper=true` OR `rolbypassrls=true`, OR if it owns the tables (A4) while `relforcerowsecurity=false` (A3).

> **Local-derived expectation (NOT a production fact — verify with A2):** the repo strongly implies the runtime role bypasses RLS. `.env.example:24` states *"The DATABASE_URL user (excelsia) has BYPASSRLS"*; migration `20260417171836_add_rls_policies/migration.sql:42-43` runs `ALTER ROLE current_user BYPASSRLS`; and across all migrations RLS is `ENABLE`d (49×) but **never** `FORCE`d (0×). If production connects as that same bypassing role, RLS provides **no** DB-level tenant isolation. Confirm with A2/A3.

---

## B. Migration State — B1/B2 NOT VERIFIED · **B3 COMPLETED**

**B1 — state of the RLS-policies migration:** *(run in prod)*
```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations WHERE migration_name LIKE '%add_rls_policies%';
```

**B2 — any failed/incomplete migrations:** *(run in prod)*
```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
```

**B3 — `apps/api/railway.json` startCommand (COMPLETED — local analysis):**

Verbatim `deploy.startCommand` (`apps/api/railway.json:8`):
```
npx prisma migrate resolve --rolled-back 20260417171836_add_rls_policies --schema=apps/api/prisma/schema && npx prisma migrate deploy --schema=apps/api/prisma/schema && node dist/apps/api/main.js
```

**What it does on every production boot:**
1. `migrate resolve --rolled-back 20260417171836_add_rls_policies` records that migration as **rolled back** in `_prisma_migrations` (sets `rolled_back_at`), so Prisma treats it as *not applied*.
2. `migrate deploy` then sees it as pending and **re-applies `migration.sql`**.
3. Only if both succeed (`&&`) does `node dist/apps/api/main.js` start.

**The hazard — the migration is NOT idempotent.** `migration.sql` contains:
- `CREATE OR REPLACE FUNCTION set_tenant_id()` — idempotent ✔
- `ALTER TABLE companies/memberships ENABLE ROW LEVEL SECURITY` — idempotent ✔
- `CREATE POLICY company_isolation ON companies …` and `CREATE POLICY membership_isolation ON memberships …` — **NOT idempotent.** PostgreSQL has no `CREATE POLICY IF NOT EXISTS` (still true in PG 18) and the migration does no `DROP POLICY IF EXISTS` first. Re-applying when the policy already exists raises `ERROR: policy "company_isolation" for table "companies" already exists` (SQLSTATE 42710).
- `CREATE ROLE app_user` (guarded `IF NOT EXISTS`), GRANTs, and `ALTER ROLE … BYPASSRLS` (in an exception block) — idempotent ✔

**Implication:** if the two policies exist in production, step 2 should fail → the `&&` chain stops → `main.js` never starts → the service cannot boot on restart. Since production is live, the prod `_prisma_migrations` state (B1/B2) must explain how this reconciles — most likely one of:
- the `resolve`/`deploy` pair is effectively a **no-op leftover** (the migration is recorded applied and `deploy` skips it), making the `resolve --rolled-back` line dead weight; **or**
- the policies are absent / the migration sits in a special state, in which case the system is one schema change away from blocking every boot.

This is a **fragile, high-risk permanent workaround** that should be removed once B1/B2 confirm the true state (report-only — do not change it now). Healthy target: `add_rls_policies` shows a single row with `finished_at` set, `rolled_back_at` NULL, and B2 returns **zero** rows; the `migrate resolve --rolled-back …` clause is then deleted from the startCommand.

---

## C. Auth Secrets — **NOT VERIFIED**

**C1 — presence + length only (never values).** After `railway link` (service api):
```bash
# Prints ONLY key + SET/NOT-SET + length for the target vars; values are never echoed.
railway variables --service api --json \
| jq -r '
  ["JWT_SECRET","REFRESH_TOKEN_SECRET","BASEAPI_KEY","SII_RUT","SII_PASSWORD","REDIS_URL","NEXT_PUBLIC_APP_URL"][] as $k
  | "\($k) = " + (if (.[$k] // "" | tostring | length) > 0
                  then "SET (len \(.[$k]|tostring|length))" else "NOT-SET" end)'
```
**Critical:** `JWT_SECRET` and `REFRESH_TOKEN_SECRET` must be SET — if unset, NestJS signs tokens with the literal string `"undefined"`, making all sessions forgeable (`iam/iam.module.ts:17`, `iam/strategies/jwt.strategy.ts:12`).

---

## D. SII Production Data Integrity — **NOT VERIFIED**

**D1 — provider/status of all sync runs (the key question):**
```sql
SELECT provider, status, COUNT(*) AS runs, MAX("startedAt") AS last_started
FROM tax_sync_runs GROUP BY provider, status ORDER BY provider, status;
```
**D2 — any run ever recorded as mock:**
```sql
SELECT id, "companyId", provider, direction, status, "startedAt"
FROM tax_sync_runs WHERE provider='mock-sii' ORDER BY "startedAt" DESC LIMIT 50;
```
**D3 — residual fake DTEs (all-same-digit RUT, AEROPROTECHNIK 55555555-5 signature):**
```sql
SELECT id, "companyId", folio, "issuerRut", "receiverRut", "totalAmount"
FROM tax_documents
WHERE "issuerRut" ~ '^(\d)\1{6,}-?[0-9kK]$'
   OR "receiverRut" ~ '^(\d)\1{6,}-?[0-9kK]$' LIMIT 200;
```
**D4 — residual fake DTEs (DTE-math-impossible: neto=0 AND iva=0 AND total>0):**
```sql
SELECT id, "companyId", folio, "issuerName", "netAmount", "taxAmount", "totalAmount"
FROM tax_documents WHERE "netAmount"=0 AND "taxAmount"=0 AND "totalAmount">0 LIMIT 200;
```
Healthy target: D1 recent rows all `provider='baseapi'`; D2/D3/D4 return **zero** rows.

---

## E. Leftovers — **NOT VERIFIED**

**E1 — budget_* tables must be absent (FIN-001 was reverted):**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'budget%';
```
Healthy target: **zero** rows.

---

## Ready-to-paste SQL block (all read-only)

After `railway connect postgres`, paste this whole block at the `psql` prompt. Every statement is `SELECT`/catalog-only.

```sql
\echo '== A1 connected role =='
SELECT current_user AS connected_role;
\echo '== A2 role privileges =='
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles
WHERE rolname IN (current_user,'excelsia','app_user') ORDER BY rolname;
\echo '== A3 RLS enabled vs forced =='
SELECT relname, relrowsecurity AS enabled, relforcerowsecurity AS forced
FROM pg_class WHERE relrowsecurity = true ORDER BY relname;
\echo '== A4 table ownership =='
SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 100;
\echo '== B1 add_rls_policies migration state =='
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations WHERE migration_name LIKE '%add_rls_policies%';
\echo '== B2 failed/incomplete migrations =='
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
\echo '== D1 tax_sync_runs by provider/status =='
SELECT provider, status, COUNT(*) AS runs, MAX("startedAt") AS last_started
FROM tax_sync_runs GROUP BY provider, status ORDER BY provider, status;
\echo '== D2 mock-sii runs =='
SELECT id, "companyId", provider, direction, status, "startedAt"
FROM tax_sync_runs WHERE provider='mock-sii' ORDER BY "startedAt" DESC LIMIT 50;
\echo '== D3 all-same-digit RUT DTEs =='
SELECT id, "companyId", folio, "issuerRut", "receiverRut", "totalAmount"
FROM tax_documents
WHERE "issuerRut" ~ '^(\d)\1{6,}-?[0-9kK]$' OR "receiverRut" ~ '^(\d)\1{6,}-?[0-9kK]$' LIMIT 200;
\echo '== D4 DTE-math-impossible DTEs =='
SELECT id, "companyId", folio, "issuerName", "netAmount", "taxAmount", "totalAmount"
FROM tax_documents WHERE "netAmount"=0 AND "taxAmount"=0 AND "totalAmount">0 LIMIT 200;
\echo '== E1 budget_* tables (should be empty) =='
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'budget%';
```

---

## Verdicts

| # | Question | Verdict |
|---|----------|---------|
| 1 | Is RLS enforced in production today? | **NOT VERIFIED** (run A2/A3). Local evidence suggests the runtime role has BYPASSRLS and tables are `ENABLE` not `FORCE` ⇒ likely **not** enforced — confirm in prod. |
| 2 | Is the RLS migration state healthy? | **NOT VERIFIED** for prod state (run B1/B2). **B3 done:** the startCommand re-applies a **non-idempotent** migration (`CREATE POLICY` has no `IF NOT EXISTS`) on every boot — a fragile workaround to clean up once B1/B2 are known. |
| 3 | Are JWT/refresh secrets set? | **NOT VERIFIED** (run C1). Must be SET or all tokens are forgeable. |
| 4 | Recent SII on `baseapi`, zero mock/residual fake DTEs? | **NOT VERIFIED** (run D1–D4). |
| 5 | Are `budget_*` tables absent? | **NOT VERIFIED** (run E1). |

*Report only — nothing was remediated; no production query was executed; no git state changed.*
