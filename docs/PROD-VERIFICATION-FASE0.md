# FASE 0 — Production Verification (Step 0) — ✅ EXECUTED AGAINST LIVE PRODUCTION

**Date:** 2026-06-23
**Mode:** READ-ONLY against PRODUCTION. SELECT / catalog inspection only. No writes, no DDL, no `prisma migrate*`. No secret values printed.
**Access:** Railway CLI linked — project `excelsia-erp`, env `production`, service `api`. SQL via `railway connect postgres`; env presence via `railway variables --service api` (filtered so values never printed).
**This file is a deliverable left on disk — NOT committed.**

> Supersedes the earlier "NOT VERIFIED — requires owner" stub. All five sections were executed against the live production database and api-service variables.

---

## 🔑 Headline findings

1. **🔴 RLS is NOT enforced in production.** The API connects as the **`postgres` superuser** (owns all 53 tables, `rolbypassrls=t`). Superusers bypass RLS unconditionally; `FORCE` is not set anyway. The intended least-privilege role `app_user` exists (no super / no bypass) but is **unused**. _Mitigating:_ production currently has **exactly one company**, so there is no second tenant to leak to **today** — but this must be fixed **before onboarding a 2nd client**.
2. **🟢 SII data integrity is good.** Recent syncs are 100% **baseapi** (222 SUCCESS, last 2026-06-01); **zero `mock-sii`** runs; **zero** all-same-digit fake RUTs (AEROPROTECHNIK signature). The 164 "zero-neto" rows are **legitimate IVA-exempt documents** (type `FACTURA_NO_AFECTA`), not fakes.
3. **🟢 Auth secrets are set** (JWT/refresh 128 chars). Two minor env gaps: `SII_PASSWORD` is only 4 chars; `NEXT_PUBLIC_APP_URL` is absent.
4. **🟢 Migration state is healthy** (the `add_rls_policies` failure was recovered; 0 pending/failed). **🟢 No `budget_*` tables.**
5. **ℹ️ The single production company is named "Empresa Demo"** but holds **AGS's real RUT 77.004.647-5** and 1,926 real SII documents — a display-name oddity, not a data issue.

---

## A. Runtime Role & RLS Posture

| Check                                    | Result                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** DATABASE_URL role (username only) | **`postgres`** @ `postgres.railway.internal`                                                                                                                   |
| **A2** `pg_roles`                        | `app_user`: super=`f`, bypassrls=`f`, createrole=`f` · **`postgres`: super=`t`, bypassrls=`t`, createrole=`t`** · (`excelsia` role **does not exist** in prod) |
| **A3** RLS enabled vs forced             | **49** tables `ENABLE`d, **0** `FORCE`d                                                                                                                        |
| **A4** table ownership (public)          | **all 53 tables owned by `postgres`**                                                                                                                          |

**A5 verdict — RLS enforced in prod? → NO.** The app's runtime role is the `postgres` superuser, which (a) is a superuser, (b) has `BYPASSRLS`, and (c) owns every table. PostgreSQL exempts superusers from RLS unconditionally, so the 49 RLS policies have **no effect** on the application's connection. The intended `app_user` (correctly created with no super / no bypass) is **not used** by the API. Tenant isolation in production rests entirely on the application-layer `WHERE companyId` filters (and the `PoliciesGuard` membership check, which the prior ownership audit found _fail-open_). **Current exposure is latent** because only one company exists — but onboarding a second tenant without fixing the connection role would expose cross-tenant reads on any path that relies on RLS.

---

## B. Migration State (the `railway.json --rolled-back` puzzle)

| Check                               | Result                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B1** `add_rls_policies` records   | **2 rows.** (1) started `15:11:59`, `finished_at`=∅, `rolled_back_at`=`15:30:20`, steps=`0` → **failed partial apply**. (2) started+finished `15:30:24`, `rolled_back_at`=∅, steps=`1` → **clean re-apply**. |
| **B2** failed/incomplete migrations | **0 rows**                                                                                                                                                                                                   |

**B3 explanation:** On the original deploy (2026-04-21) the `add_rls_policies` migration **failed mid-apply** (row 1: `applied_steps_count=0`, never finished). The `railway.json` startCommand `prisma migrate resolve --rolled-back 20260417171836_add_rls_policies` marked that failed record **rolled back** (row 1 got `rolled_back_at`), which let the subsequent `prisma migrate deploy` **re-apply it cleanly** (row 2: finished, 1 step) ~13 s later. The migration is now in a consistent **applied** state and B2 confirms **no failed/incomplete migrations**.

**Verdict — migration state healthy? → YES.** The `--rolled-back` clause was the one-time recovery for a real partial failure and did its job. It is now **redundant and a latent footgun**: it runs on every boot, and the migration's SQL is **not idempotent** (`CREATE POLICY` has no `IF NOT EXISTS`), so if a future boot ever leaves the migration in a rolled-back state, the next `migrate deploy` would fail re-creating existing policies and block startup. _Report-only recommendation (do not apply now):_ once confirmed stable, remove the `migrate resolve --rolled-back …` clause from `apps/api/railway.json` so boots just run `migrate deploy`.

---

## C. Auth Secrets (api service — presence + length only, values never printed)

| Variable               | Status                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`           | **SET** (len 128) ✅                                                                                                                  |
| `REFRESH_TOKEN_SECRET` | **SET** (len 128) ✅                                                                                                                  |
| `BASEAPI_KEY`          | SET (len 51)                                                                                                                          |
| `SII_RUT`              | SET (len 10)                                                                                                                          |
| `SII_PASSWORD`         | SET (len **4**) ⚠️ unusually short for a SII portal password — owner should confirm it's the real current password, not a placeholder |
| `REDIS_URL`            | SET (len 76)                                                                                                                          |
| `NEXT_PUBLIC_APP_URL`  | **NOT-SET (absent)** ⚠️ — QR public URLs fall back to the hardcoded `https://app.excelsia.cl` (works in prod, but undocumented)       |

**Verdict — JWT/refresh secrets set? → YES.** Both signing secrets are present at 128 chars, so the "unset ⇒ tokens signed with the string 'undefined'" risk does **not** apply in production. Two minor gaps noted above.

---

## D. SII Production Data Integrity

| Check                                                     | Result                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** `tax_sync_runs` by provider/status                 | **baseapi SUCCESS: 222** (last `2026-06-01`) · **baseapi FAILED: 14** (last `2026-04-26`) · **mock-sii: 0**                                                                                                                                                                     |
| **D2** `provider='mock-sii'` runs                         | **0 rows** ✅                                                                                                                                                                                                                                                                   |
| **D3** all-same-digit RUT DTEs (AEROPROTECHNIK signature) | **0 rows** ✅                                                                                                                                                                                                                                                                   |
| **D4** zero-neto + zero-IVA + positive-total DTEs         | **164 rows** — but **160 = `FACTURA_NO_AFECTA`** (IVA-exempt, type 34) + **4 = `NOTA_CREDITO`**, **all RECIBIDO**, real issuers (LATAM/JetSmart, Santander, Dirección General de Aeronáutica Civil, universities, medical centers) → **legitimate exempt documents, NOT fakes** |
| context                                                   | total `tax_documents` = **1,926**; distinct companies = **1**                                                                                                                                                                                                                   |

**Interpreting D4:** the "zero-neto, zero-IVA, positive-total" heuristic was designed to catch the AEROPROTECHNIK **mock** artifacts (which were _afecta_ invoices with impossible math). For **exempt** documents (`FACTURA_NO_AFECTA`, type 34 — airline tickets, bank charges, government fees, health/education, all IVA-exempt in Chile) zero-neto/zero-IVA with a positive total is the **correct** representation. All 164 rows are exempt `FACTURA_NO_AFECTA`/`NOTA_CREDITO` from real Chilean entities — a **false positive** of the heuristic, not fraud. The signature that actually indicates mock/fake data — **all-same-digit RUT (D3) — returns 0**.

**Verdict — recent SII on baseapi, zero mock / zero fake-DTE? → YES.** Provider is exclusively `baseapi`, no `mock-sii` runs exist, and there are **no** all-same-digit fake RUTs. The 164 zero-neto rows are legitimate exempt purchase invoices. _(Minor data-quality note: BaseAPI does not populate neto/IVA for exempt docs — expected, harmless.)_

---

## E. Leftovers

| Check                                     | Result        |
| ----------------------------------------- | ------------- |
| **E1** `budget_*` tables in public schema | **0 rows** ✅ |

**Verdict — `budget_*` tables absent? → YES.** FIN-001 (Annual Budgets) never reached production, as the handoff stated.

---

## ℹ️ Additional observation (not in the original A–E set)

Production has exactly **one** company row: **`Empresa Demo`** (`id 3fa6162f…`) with **`taxId 77.004.647-5`** — which is **AGS Solutions SPA's real RUT** per the handoff. So the live tenant holds the real client's RUT and 1,926 real SII documents under a generic display name "Empresa Demo". This is a **naming oddity only** (no integrity/security impact) — the owner may want to rename the company to "AGS Solutions SPA". _(Note: this is a different database/row from the local-dev "Empresa Demo" `id 973640f1…` used by the demo-sprint seed on `localhost:5433`; the demo work did not touch production.)_

---

## Final Verdict Summary

| #   | Question                                     | Verdict                                                                                                                                                                  |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | RLS enforced in production today?            | **NO** — app connects as `postgres` superuser (owns tables + BYPASSRLS); RLS policies have no effect. Latent (single tenant today); **fix before onboarding tenant #2**. |
| 2   | RLS migration state healthy?                 | **YES** — `add_rls_policies` recovered from a failed apply; 0 pending/failed. Recommend removing the now-redundant `--rolled-back` boot clause.                          |
| 3   | JWT / refresh secrets set?                   | **YES** — both SET at 128 chars. (Minor: `SII_PASSWORD` len 4; `NEXT_PUBLIC_APP_URL` absent.)                                                                            |
| 4   | Recent SII on baseapi, zero mock / fake-DTE? | **YES** — 222 baseapi SUCCESS, 0 mock-sii, 0 all-same-digit fakes. The 164 zero-neto rows are legitimate IVA-exempt docs.                                                |
| 5   | `budget_*` tables absent?                    | **YES** — 0 budget tables.                                                                                                                                               |

_Report only — nothing was remediated; every statement above is from a read-only SELECT / catalog query or env-presence check; no secret values printed; no git state changed._
