# Excelsia ERP — Technical Ownership Report

**Prepared by:** Incoming Senior Software Engineer (technical ownership handover)
**Date:** 2026-06-18
**Method:** Read-only verification of the repository against `CLAUDE.md` and `docs/EXCELSIA-TECHNICAL-HANDOFF.md`, executed as a 9-agent parallel workflow (6 discovery workers + adversarial SII worker + red-team) plus orchestrator-level independent confirmation of the highest-stakes findings.
**Source-of-truth hierarchy used:** repository code > `CLAUDE.md` > handoff. Every divergence is flagged with `file:line` evidence and severity.
**Scope of DB findings:** All database findings below are from the **LOCAL** repo (migration SQL, `.env.example`, schema). **No production database access was available** — every check that depends on live data is marked `NOT VERIFIED — owner must run` with the exact read-only SQL.

> This report is **REPORT ONLY**. Nothing was modified, fixed, or remediated. No git state was changed. This file is left on disk for the owner to review and commit; it has not been `git add`-ed.

---

## 1. Executive Summary

Excelsia ERP is a well-structured Nx modular monolith (NestJS + Next.js) with two production-complete modules (Finance, Operations) and disciplined conventions. Build is green: TypeScript compiles cleanly on both apps; lint is 78 warnings / 0 errors (matches the handoff); git tree is clean; no FIN-001/budget code reached `develop`. **However, the audit surfaced one CRITICAL security defect that contradicts the handoff's central security claim**, plus two CRITICAL latent SII landmines and several deploy/role issues:

1. **🔴 CRITICAL — Cross-tenant data disclosure on the Operations dashboard.** `PoliciesGuard` fails _open_, the 9 dashboard read endpoints have no `@CheckPolicies`, the tenant is taken from the attacker-controllable `x-company-id` header, and the queries hit materialized views (which are **not** subject to RLS) — so any authenticated user can read another company's compliance dashboard by changing one header, _independent of the RLS/BYPASSRLS question_.
2. **🔴 CRITICAL — RLS is not actually enforced at runtime.** The app connects as `excelsia`, which holds `BYPASSRLS`; the intended least-privilege role `app_user` is created but never used. Tables use `ENABLE` (not `FORCE`) RLS. Tenant isolation today rests on app-level `WHERE companyId` + the (fail-open) membership guard, not the database.
3. **🔴 CRITICAL (latent) — SII mock provider.** BaseAPI _is_ the runtime default and mock-sii is unreachable today, but the `tax_sync_runs.provider` DB default is still `'mock-sii'` and `MockSiiProvider` is registered with no `NODE_ENV` guard.
4. **🟠 Deploy gate unresolved** (Railway CI-wait is a dashboard setting, not in the repo) and a `railway.json` start command marks the RLS migration `--rolled-back` on every boot.

Biggest risks, in order: (1) the dashboard cross-tenant leak; (2) the runtime BYPASSRLS posture; (3) the SII mock landmines; (4) absence of any test safety net + unverified CI→Railway gate.

---

## 2. Verified Architecture Map

**Monorepo (Nx 22.6.5, branch `develop`)**

- `apps/api` — NestJS 11, webpack build (`type:app`, `scope:backend`)
- `apps/web` — Next.js **16.1.6** + React **19** (`type:app`, `scope:frontend`)
- `libs/` — `config`, `types`, `utils` (`scope:shared`), `ui` (`scope:frontend`)
- `infra/` — `docker/` (Dockerfile.api, Dockerfile.web), `nginx/prod.conf`, `scripts/`
- `docs/` — handoff, verification protocol, runbook, deployment, user guide, this report
- Module boundaries enforced via `@nx/enforce-module-boundaries` (error) in `eslint.config.mjs:22`

**Backend domains** (`apps/api/src/modules/`): `iam`, `tenancy`, `companies`, `common` (rls/casl/guards/prisma), `catalogs`, `movements`, `cashflow`, `banking`, `reconciliation`, `closing`, `alerts`, `reports`, `dashboard`, `tax`, `finance` (cross-module listeners), `operations` (19 submodules), `health`, `jobs`.

**Database** (Prisma `prismaSchemaFolder`, PostgreSQL): 16 `.prisma` files, **40 migrations** in `apps/api/prisma/schema/migrations/` (`20260417160227_init_audit_log` → `20260429160000_add_audit_packages`). Multi-tenancy via RLS + `SET LOCAL rls.company_id`; audit via `audit_trigger_function()` triggers; 4 Operations materialized views; BullMQ (9 repeatable crons).

**Frontend route groups** (`apps/web/src/app/`): `(auth)/login`, `(dashboard)/*` (flat finance routes + `operaciones/*`), `modulos/` (selector), `p/asset/[qrToken]/` (public QR page, outside all groups), `api/hello` (stub BFF).

---

## 3. Confirmations (handoff/CLAUDE.md claims verified TRUE)

| #   | Claim verified                                                                                                   | Evidence (file:line)                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1  | Nx monorepo, apps/web (Next) + apps/api (Nest), module-boundary ESLint                                           | `apps/web/project.json`, `apps/api/project.json`, `eslint.config.mjs:22`                                 |
| C2  | Prisma split by module; 40 migrations; **no `*add_budgets*` migration anywhere**                                 | `apps/api/prisma/schema/migrations/` (40 dirs); `grep budget` → 0 hits                                   |
| C3  | Operations module = **20** migrations (not the handoff's 24) — MIGRATION_HISTORY.md is correct                   | `operations/MIGRATION_HISTORY.md:30`; migrations `20260427*`–`20260429*` = 20                            |
| C4  | `executeWithRls` issues `SET LOCAL rls.company_id` / audit context inside a `$transaction`                       | `common/rls/rls.service.ts:22-34`                                                                        |
| C5  | `audit_trigger_function()` exists; ~44 triggers across business tables                                           | `migrations/20260417172748_add_audit_triggers/migration.sql:8`                                           |
| C6  | 4 Operations MVs with UNIQUE indexes (REFRESH CONCURRENTLY-ready)                                                | `migrations/20260429140000_add_dashboard_materialized_views/migration.sql`                               |
| C7  | JWT in HttpOnly cookie (8h access / 7d refresh); refresh path-scoped; Secure+SameSite=none in prod               | `iam/auth.service.ts:144-166`; `iam/strategies/jwt.strategy.ts:10-12`                                    |
| C8  | Refresh token stored as bcrypt hash, rotated on login, nulled on logout                                          | `iam/auth.service.ts:37-43, 56-58, 68-91`                                                                |
| C9  | 6 CASL roles exactly: SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT, ANALYST, VIEWER                                   | `prisma/schema/iam.prisma:1-8`; `common/casl/casl-ability.factory.ts`                                    |
| C10 | Helmet (CSP, HSTS 1y, X-Frame-Options DENY), CORS single-origin + credentials, global ThrottlerGuard             | `apps/api/src/main.ts:21-54`; `app/app.module.ts:86-89`                                                  |
| C11 | Public QR scan endpoint, throttled 30/min/IP; no other unguarded _business_ endpoint; no `@Public()` pattern     | `operations/assets/asset-qr.controller.ts:37-39`; red-team Target 3                                      |
| C12 | Upload validation: documents 10MB, photos 2MB, imports 5MB; mime/extension allow-lists                           | `operations/document-control/document-records.service.ts:35-56`; `assets/assets.service.ts:12-13`        |
| C13 | Finance routes are FLAT under `(dashboard)`; **no `/presupuestos` or `/finanzas/presupuestos` in source**        | `apps/web/src/app/(dashboard)/` listing; `grep presupuesto src/` → 0                                     |
| C14 | Banking provider-adapter + mock provider + manual cartola import                                                 | `banking/providers/provider.factory.ts:10`; `banking/cartola/cartola-import.service.ts`                  |
| C15 | Monthly closing: 5-rule checklist, IN_REVIEW→CLOSED lock, ADMIN-only reopen                                      | `closing/closing.service.ts:45-51, 62-70, 101-110`                                                       |
| C16 | Requirements-matrix specificity resolution `asset(3) > subtype(2) > type(1)`                                     | `operations/document-requirements/document-requirements.service.ts:154-158`                              |
| C17 | Immutable supersession: REPLACED blocked from edit/delete; excluded from compliance; 409 on duplicate            | `operations/document-control/document-records.service.ts:626-645, 962-969, 1036-1039`                    |
| C18 | Auto-block: expired CRITICAL+blocksOperation → BLOCKED_DOCUMENTAL; unblock + exception path                      | `operations/alerts/asset-blocking.service.ts:81-86, 300-388, 433-458`                                    |
| C19 | QR: `randomBytes(24).toString('base64url')`; throttle 30/min; atomic scan counter; regenerate resets             | `operations/assets/asset-qr.service.ts:617-630, 366-379, 182-190`                                        |
| C20 | Audit packages: SHA-256 per file in MANIFIESTO.json + master signature                                           | `operations/audit/audit-package.service.ts:897-899, 948-957`                                             |
| C21 | 9 BullMQ repeatable crons (6 alert-engine, 1 work-permits, 2 dashboard-mv); matches `health/crons` expectedMin=9 | `operations/alerts/alert-engine.processor.ts:17-41`; `dashboard/dashboard-mv-refresh.processor.ts:17-21` |
| C22 | Operations→Finance: `domain_events` persisted (PENDING) before emit; renewal handlers create commitments         | `operations/events/domain-events.service.ts:40-91`; `finance/operations-listeners.service.ts:41-93`      |
| C23 | Public `/p/asset/[qrToken]` page lives outside `(dashboard)`; no sidebar/auth                                    | `apps/web/src/app/p/asset/[qrToken]/page.tsx:9-18`                                                       |
| C24 | apiClient sends `x-company-id` + `credentials:'include'`; 401 → `/login`                                         | `apps/web/src/lib/api.ts:43-60`                                                                          |
| C25 | SII idempotency via `@@unique(companyId,type,folio,direction)` + `taxDoc.movementId` guard                       | `prisma/schema/tax.prisma:48`; `tax/tax.service.ts:380-394, 540`                                         |
| C26 | Lint = 78 warnings / 0 errors (api 40, web 38); tsc clean; git clean; no budget/AEROPROTECHNIK/55555555 in code  | `nx lint api/web`; `tsc --noEmit`; grep → docs only                                                      |

---

## 4. Discrepancies (repo ≠ handoff/CLAUDE.md)

| #   | Discrepancy                                                                                                                                                                                                                                                                                                                                    | Evidence                                                                                                 | Severity                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| D1  | **Cross-tenant read leak (see §6.1).** Handoff §2.3 / `CLAUDE.md` and the dashboard's own comment claim "RLS still scopes data to the company"; in fact the dashboard read endpoints skip membership validation and read MVs that bypass RLS.                                                                                                  | `operations/dashboard/operations-dashboard.controller.ts:19-92`; `common/guards/policies.guard.ts:16-20` | **critical**                   |
| D2  | **Runtime role has BYPASSRLS.** Handoff §2.3/§11 says "`app_user` has BYPASSRLS in some environments." Actually `app_user` is created **without** bypass and is **never** the runtime role; the app connects as `excelsia`, and the migration grants BYPASSRLS to `current_user` (= `excelsia`). RLS is bypassed at runtime (confirmed LOCAL). | `.env.example:24,35`; `migrations/20260417171836_add_rls_policies/migration.sql:26-46`                   | **critical**                   |
| D3  | **`tax_sync_runs.provider` DB default is still `'mock-sii'`** (FASE-0 #1). Inert today (every INSERT passes provider explicitly) but a latent landmine.                                                                                                                                                                                        | `prisma/schema/tax.prisma:59`; `migrations/20260420190000_add_tax_models/migration.sql:46`               | **critical**                   |
| D4  | **`MockSiiProvider` registered with no `NODE_ENV` guard** — any future caller passing `'mock-sii'` runs the mock in prod.                                                                                                                                                                                                                      | `tax/providers/sii-provider.factory.ts:16`                                                               | **critical**                   |
| D5  | **Railway CI gate undeterminable from repo.** No deploy step in `ci.yml`, no `railway.toml`; per-app `railway.json` has no CI-wait. "Wait for CI" is a Railway dashboard setting — leans Scenario B (deploy on push, parallel to CI).                                                                                                          | `apps/api/railway.json`, `apps/web/railway.json`; `ci.yml`; handoff:163                                  | **critical** (operational)     |
| D6  | `railway.json` startCommand runs `prisma migrate resolve --rolled-back 20260417171836_add_rls_policies` on **every** boot — unusual; can mask migration-state drift.                                                                                                                                                                           | `apps/api/railway.json:8`                                                                                | warning                        |
| D7  | **5 business tables have RLS + GRANT but NO audit trigger:** `asset_subtypes`, `alert_thresholds`, `bank_sync_runs`, `external_bank_movements`, `tax_sync_runs` — violates the "RLS+trigger+GRANT" invariant.                                                                                                                                  | migrations `20260419001219`, `20260420151830`, `20260427120000`, `20260420190000`                        | warning                        |
| D8  | **`$executeRawUnsafe` string-interpolates** `companyId`/`userId` into `SET LOCAL`; the `x-company-id` header is never UUID-validated before injection. Low risk (server-issued UUIDs) but unsafe pattern.                                                                                                                                      | `common/rls/rls.service.ts:23-30`                                                                        | warning                        |
| D9  | **No startup env validation.** `JWT_SECRET`/`REFRESH_TOKEN_SECRET` passed straight to `JwtModule`; if unset, tokens sign with the string `"undefined"` (forgeable). No ConfigModule/Joi/Zod.                                                                                                                                                   | `iam/iam.module.ts:17`; `iam/strategies/jwt.strategy.ts:12`                                              | warning                        |
| D10 | **No CSRF protection** with `SameSite=none` in prod; Helmet present but no `csurf`/double-submit. CORS blocks XHR but not HTML form POSTs.                                                                                                                                                                                                     | `apps/api/src/main.ts:21-54`; `iam/auth.service.ts:147-149`                                              | warning                        |
| D11 | **"Terminal Noir" tokens do not exist in code.** Handoff §2.6 accent `#4ECDC4` teal → actual `--color-accent: #2563eb` (blue); `Syne` font not loaded (actual heading font is `Outfit`); `#0C0F1A` is not a panel token. `CLAUDE.md` DISEÑO VISUAL matches code; handoff §2.6 is stale.                                                        | `apps/web/src/styles/tokens.css:3,7`; `apps/web/src/app/layout.tsx:2-9`; `grep 4ECDC4` → 0               | warning (→ critical doc drift) |
| D12 | **Operations endpoint count is ~226–240, not "~130."** The doc figure predates Sprint 5-8 additions.                                                                                                                                                                                                                                           | `operations/API_REFERENCE.md` (226 rows); `grep @Get/@Post/...` = 240; `CLAUDE.md` says ~130             | warning                        |
| D13 | **Stale `.next` cache contains compiled `/presupuestos` artifacts** (source fully removed). `routes.d.ts` lists `/presupuestos`. Needs `rm -rf apps/web/.next`.                                                                                                                                                                                | `apps/web/.next/dev/server/app/(dashboard)/presupuestos/page.js`                                         | warning                        |
| D14 | **`seed.ts` commits dev password `Admin1234!`** (also in README/handoff/DEPLOYMENT). Dev-only, but production rotation is unverified.                                                                                                                                                                                                          | `apps/api/prisma/seed.ts:38`                                                                             | warning                        |
| D15 | **`NEXT_PUBLIC_APP_URL` used but absent from `.env.example`;** falls back silently to hardcoded `https://app.excelsia.cl` for QR links in non-prod envs.                                                                                                                                                                                       | `operations/assets/asset-qr.service.ts:639` (+3 sites)                                                   | warning                        |
| D16 | **Next.js is 16.1.6 / React 19**, not "Next.js 14" as `CLAUDE.md:22` states.                                                                                                                                                                                                                                                                   | `package.json:105,111`                                                                                   | warning                        |
| D17 | `.github/workflows/README.md` documents `develop→Staging`, `main→Production` — contradicts reality (`develop` IS production, no staging).                                                                                                                                                                                                      | `.github/workflows/README.md:33-36` vs `CLAUDE.md:34`, handoff:133                                       | warning                        |
| D18 | **Handoff "6 Chilean banks" for cartola is overstated** — code defines 3 formats (`bancochile_bci`, `santander_itau`, `generic`); BancoEstado/Scotiabank fall through to generic.                                                                                                                                                              | `banking/cartola/cartola-import.service.ts:11, 224-230`                                                  | info                           |
| D19 | **SUPER_ADMIN ≡ ADMIN** — both get `can('manage','all')`; no differentiation exists yet.                                                                                                                                                                                                                                                       | `common/casl/casl-ability.factory.ts:237-243`                                                            | info                           |
| D20 | **BaseAPI endpoint paths**: code uses `/sii/rcv/{YYYY-MM}/venta` & `/compra` (matches `CLAUDE.md`), but handoff §8.1 documents plural `/sii/rcv/ventas` & `/compras`. Doc drift.                                                                                                                                                               | `tax/providers/baseapi/baseapi-sii.provider.ts:116,130,152`                                              | info                           |
| D21 | Asset status enum is `NON_OPERATIONAL` (code), handoff §6.3 wrote `NOT_OPERATIONAL` (it self-flagged "verify").                                                                                                                                                                                                                                | `prisma/schema/operations.prisma:13`                                                                     | info                           |
| D22 | `users` table has audit trigger but **no RLS** (intentional — global table); invariant should note the exception.                                                                                                                                                                                                                              | `migrations/20260417172748_add_audit_triggers/migration.sql:48`                                          | info                           |
| D23 | `mv_compliance_by_category` is refreshed by cron but **never queried** by the service (live fallback used instead).                                                                                                                                                                                                                            | `operations/dashboard/operations-dashboard.service.ts:1233-1239`                                         | info                           |
| D24 | `GET /api` root returns `"Hello API"` unauthenticated (benign); `/app/api/hello` is the only BFF route (stub) — Next.js is not really used as a BFF.                                                                                                                                                                                           | `app/app.controller.ts`; `apps/web/src/app/api/hello/route.ts`                                           | info                           |
| D25 | Procedures main-file upload allows **25MB** vs 10MB elsewhere (undocumented).                                                                                                                                                                                                                                                                  | `operations/procedures/procedures.service.ts:37`                                                         | info                           |
| D26 | 100% relative imports; `@web/*`/`@erp/*` tsconfig aliases defined but unused (known V2 item).                                                                                                                                                                                                                                                  | `apps/web/src/**`; `tsconfig.base.json`                                                                  | info                           |
| D27 | FIN-001 prototype exists as **local-only** branch `wip/fin-001-budgets-reference` (commit `25780af`, no remote). Risk of accidental `git push --all`.                                                                                                                                                                                          | `git branch --contains 25780af`                                                                          | info                           |
| D28 | **Audit-package error-recovery bug**: `REPORT_FILES.REPORTS[out.length]` mis-indexes when `includedReports` filter is active.                                                                                                                                                                                                                  | `operations/audit/audit-package.service.ts:655-664`                                                      | warning                        |

---

## 5. SII / BaseAPI Verdict (Phase 5) + FASE-0 Fix Plan

### 5.1 Verdict

> **BaseAPI integration is FULLY IMPLEMENTED and IS the effective runtime default. The mock provider is NOT reachable through any current production code path.** Two CRITICAL _latent_ landmines remain.

**Evidence the real provider is the runtime default and mock is currently unreachable** (LOCAL, code-authoritative; corroborated by the red-team, Target 2 = UPHELD):

- Factory default is `'baseapi'`, and unknown names **throw** (no silent mock fallback): `tax/providers/sii-provider.factory.ts:6, 23-30`.
- Service default resolves to `baseapi`: `tax/tax.service.ts:18, 73`; `syncAll` inherits it: `:187-188`.
- The only entrypoints — `POST /tax/sync`, `POST /tax/sync-all` — accept **only** `{fiscalPeriodId, direction}`; no `provider` param: `tax/tax.controller.ts:39-83`. Frontend sends no provider: `apps/web/src/app/(dashboard)/tributario/page.tsx:374,400`.
- **No cron/queue calls tax sync**; the only external `TaxService` consumer is the read-only dashboard `getSummary`: `dashboard.service.ts:737`.
- `tax_sync_runs.provider` is **written, never read back** to select a provider (`tax.service.ts:90`; the only reads `select: {completedAt}` at `:330-339`). The DB default is therefore a **log column**, not a provider selector.
- BaseAPI wiring confirmed: `https://api.baseapi.cl/api/v1` + `X-API-Key` header, paths `/sii/rcv/{YYYY-MM}/venta|compra`, `/sii/contribuyente/informacion` (`baseapi-sii.provider.ts:95,116,130,152,190`). SII-003 movement auto-creation `source=TAX_SYNC` + "Productos no categorizados" fallback confirmed (`tax.service.ts:21,482,573`).

**The two landmines** (CRITICAL): `tax_sync_runs.provider @default("mock-sii")` still in schema + migration (`tax.prisma:59`; `migrations/20260420190000_add_tax_models/migration.sql:46`, never altered later); and `MockSiiProvider` registered unconditionally with no `NODE_ENV` gate (`sii-provider.factory.ts:16`). A future raw INSERT or any new caller passing `'mock-sii'` would reproduce the AEROPROTECHNIK fake-data class with no safeguard.

> _Reconciliation note:_ the SII worker's literal schema pick was "implemented but not default" — that wording refers **only** to the stale DB column default. At the level that matters (provider _selection_ at runtime), `baseapi` is unambiguously the default. The adjudicated verdict above is the authoritative one.

### 5.2 FASE-0 tickets (proposed — DO NOT IMPLEMENT; for owner approval)

**FIX-SII-1 — Migrate `tax_sync_runs.provider` default off `'mock-sii'`**
_Rationale:_ removes the FASE-0 #1 landmine so the DB can never silently attribute/default a run to the mock.
_Acceptance criteria:_ new Prisma migration sets `ALTER COLUMN provider SET DEFAULT 'baseapi'` **or** `DROP DEFAULT` (keep NOT NULL); `tax.prisma:59` updated to match; an INSERT omitting `provider` yields `baseapi` (or fails) and never `mock-sii`; `nx build api` green; existing rows untouched.

**FIX-SII-2 — Production guard refusing `mock-sii` when `NODE_ENV=production`**
_Rationale:_ converts a silent data-corruption path into a loud, safe failure.
_Acceptance criteria:_ in production either (a) `MockSiiProvider` is not registered, or (b) `getProvider('mock-sii')` throws; a bootstrap assertion refuses to boot if the resolvable default/selectable provider would be mock in production; mock stays fully usable in dev/test; unit test covers both `NODE_ENV` branches.

### 5.3 Production-only verification the owner must run (NOT VERIFIED here)

Run against the **PRODUCTION** Railway Postgres (`railway connect postgres`) — read-only:

```sql
-- (a) Which provider have recent runs actually used?
SELECT provider, status, COUNT(*) AS runs, MAX("startedAt") AS last_started
FROM tax_sync_runs GROUP BY provider, status ORDER BY provider, status;

-- (b) Was a run EVER recorded as mock?
SELECT id, "companyId", provider, direction, status, "startedAt"
FROM tax_sync_runs WHERE provider = 'mock-sii' ORDER BY "startedAt" DESC LIMIT 50;

-- (c) Residual fake DTEs — all-same-digit RUTs (AEROPROTECHNIK 55555555-5 signature)
SELECT id, "companyId", folio, "issuerRut", "receiverRut", "totalAmount", "issueDate"
FROM tax_documents
WHERE "issuerRut" ~ '^(\d)\1{6,}-?[0-9kK]$' OR "receiverRut" ~ '^(\d)\1{6,}-?[0-9kK]$';

-- (d) Residual fake DTEs — DTE-math-impossible rows (neto=0 AND iva=0 AND total>0)
SELECT id, "companyId", folio, "issuerName", "netAmount", "taxAmount", "totalAmount"
FROM tax_documents WHERE "netAmount"=0 AND "taxAmount"=0 AND "totalAmount">0 LIMIT 200;

-- (e) Confirm FIN-001 budget tables never reached production
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'budget%';
```

Also confirm in the Railway dashboard that `BASEAPI_KEY` is the **new** account's key (handoff §8.3) and run one live `test-connection`.

---

## 6. Security Findings

### 6.1 🔴 CRITICAL — Cross-tenant data disclosure on the Operations dashboard (red-team Target 1: FALSIFIED)

**A user authenticated for company A can read company B's entire operations dashboard by sending `x-company-id: <company-B-uuid>`.** Chain, each link confirmed at file:line:

1. **`PoliciesGuard` fails open.** It returns `true` _before_ any membership check when a route has no `@CheckPolicies` metadata: `common/guards/policies.guard.ts:16-20`. The membership-in-company validation lives _after_ that early return (`:22-37`).
2. **The 9 dashboard read endpoints carry no `@CheckPolicies`.** Controller-level `@UseGuards(JwtAuthGuard, PoliciesGuard)` only; only `POST /refresh-views` has a policy: `operations/dashboard/operations-dashboard.controller.ts:30-102`. The controller comment (`:19-29`) explicitly designs for this and **wrongly** asserts "RLS still scopes data to the company."
3. **Tenant comes from the attacker-controlled header**, not the JWT: `common/decorators/current-company.decorator.ts` returns `request.headers['x-company-id']`; the JWT carries only `{id,email}` (`iam/strategies/jwt.strategy.ts:16-18`).
4. **The reads have no RLS context and hit MVs that bypass RLS entirely.** `operations-dashboard.service.ts:144-147, 616-623, 1175-1178` run `$queryRawUnsafe('… WHERE company_id = $1::uuid', companyId)` against materialized views (MVs are **never** subject to RLS), and live-fallback paths use plain `prisma.*.findMany({ where: { companyId } })` — none wrapped in `executeWithRls`.

**Why this is environment-independent for the MV paths:** even if the production role were fully RLS-constrained, materialized views are not covered by RLS, so the _only_ tenant filter on the MV-backed endpoints (`overview`, `asset-distribution`, `top-assets-at-risk`) is the app-level `WHERE company_id = <attacker header>`, with the membership check skipped. The ORM live-fallback paths additionally leak whenever the connection role holds `BYPASSRLS` (confirmed LOCAL; production NOT VERIFIED).

**Same class, also unguarded:** `operations/calendar/operations-calendar.controller.ts:28-29` uses `@UseGuards(JwtAuthGuard)` only (no PoliciesGuard at all) and its service does not use `executeWithRls`. `operations/notifications/notification.controller.ts` is a _documented_ per-user-RLS exception (lower risk, but still trusts the header for company).

**FIX-SEC-1 (proposed, FASE-0, DO NOT IMPLEMENT):** Make tenant isolation independent of CASL. Acceptance criteria: (a) `PoliciesGuard` fails **closed** when `x-company-id` is present but no policy is declared, _or_ a dedicated global tenant guard validates `membership(userId, companyId)` on every authenticated request before controllers run; (b) every dashboard/calendar read endpoint validates membership (e.g. add a read-level `@CheckPolicies`), and/or those reads are wrapped in `executeWithRls`; (c) an integration test asserts that company-A's session with `x-company-id: <company-B>` receives 403 on dashboard + calendar endpoints.

### 6.2 🔴 CRITICAL — RLS not enforced at runtime (role + FORCE posture)

- `app_user` is created **without** BYPASSRLS and granted table privileges (`migrations/20260417171836_add_rls_policies/migration.sql:28-34`) — but it is **never the runtime connection role.** The app's `DATABASE_URL` connects as `excelsia` (`.env.example:35`), and the migration grants `BYPASSRLS` to `current_user` = `excelsia` (`:42-43`; `.env.example:24` literally: _"The DATABASE_URL user (excelsia) has BYPASSRLS"_). **So, locally, RLS is bypassed for all app queries.**
- All tables use `ENABLE ROW LEVEL SECURITY` (49×) but **`FORCE ROW LEVEL SECURITY` is never used (0×)** — so even without BYPASSRLS, a table-owner/superuser connection would bypass RLS.
- Net: tenant isolation today rests on app-level `WHERE companyId` + the (fail-open, §6.1) membership guard — **not** the database. The handoff's "never trust application-level WHERE filters alone" invariant is, in practice, not backed by the DB.

**FIX-SEC-2 (proposed):** route the runtime app through `app_user` (no BYPASSRLS); add `FORCE ROW LEVEL SECURITY` to business tables; ensure read paths establish RLS context. _Requires a coordinated deploy and the production verification below._ The public-QR lookup (`asset-qr.service.ts:352`, no RLS context) currently **depends on** BYPASSRLS to return rows — removing bypass without a dedicated bypass path would break public QR scans (`SECURITY` note from Worker C). Plan for that explicitly.

**NOT VERIFIED — owner must run on PRODUCTION:**

```sql
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
WHERE rolname IN (current_user, 'excelsia', 'app_user');
```

### 6.3 Other security findings

- **JWT_SECRET has no startup validation** — unset ⇒ tokens signed with `"undefined"` (forgeable). `iam/iam.module.ts:17`. Owner must confirm `JWT_SECRET` is set in Railway. _(→ FIX-SEC-3: add boot-time env validation.)_
- **No CSRF protection** with `SameSite=none` (D10). Consider double-submit/`csurf` for state-changing POSTs.
- **5 tables missing audit triggers** (D7) — restores the RLS+trigger+GRANT invariant. _(→ FIX-SEC-4.)_
- **`$executeRawUnsafe` interpolation** of an unvalidated header (D8) — add UUID validation at the guard/middleware. Low risk today.
- **Public endpoint inventory is clean** (red-team Target 3 UPHELD): `GET /api` (benign), `GET /api/health`, the throttled QR scan, `POST /auth/login` (LocalAuthGuard), `POST /auth/refresh` (RefreshGuard). No `@Public()` pattern; `tenancy.controller.ts` is an empty stub.
- **Secrets hygiene OK**: `.env` untracked, `.gitignore` correct, no hardcoded API keys in source. Open item: rotate the seeded `Admin1234!` admin in production (D14).

---

## 7. Hygiene Findings

- **Build/type:** `tsc --noEmit` clean on both apps. **Lint: 78 warnings, 0 errors** (api 40 / web 38) — exactly the handoff's "~78." API concentration: `operations-calendar.service.ts` (13), `operations-dashboard.service.ts` (5), `work-permits.generator.ts` (2). Dominant rule: `no-non-null-assertion`. (Web warnings are spread across ~20 Operations pages/components, not a single "calendar/dashboard" page — minor mischaracterization in the handoff.)
- **TODO/FIXME/HACK:** **zero** in `.ts/.tsx/.js/.prisma/.sql`. Only in docs prose.
- **Dead/stale code:** stale `.next` `/presupuestos` artifacts (D13); `mv_compliance_by_category` refreshed-but-unqueried (D23); empty `tenancy.controller.ts`; `LibreDteClient` still wired into `TaxModule` though BaseAPI is the active path (clarify dead vs alternate).
- **Git:** clean tree; last 10 commits match the handoff narrative (OPS-037 closure → OPS-034 MVs → Sprint 7). No FIN-001/budget commit on `develop`; the prototype is local-only branch `wip/fin-001-budgets-reference` (D27).
- **Leftover scan:** `budget`/`presupuesto`/`AEROPROTECHNIK`/`55555555` appear **only in documentation**, never in code/schema/migrations.
- **Known functional bug (non-security):** audit-package error-recovery mis-indexing (D28).

---

## 8. Updated Mental Model — How a Request Flows

A typical authenticated write (e.g., confirm a movement) flows like this:

1. **Browser → Next.js.** `apiClient` (`apps/web/src/lib/api.ts`) calls the NestJS API directly (no rewrites/BFF proxy), with `credentials:'include'` (sends the HttpOnly `access_token` cookie) and an `x-company-id` header read from `localStorage['selectedCompanyId']` (the active company the user picked at `/modulos`).
2. **NestJS pipeline.** `NullByteSanitizerMiddleware` strips `\0`; the global `ThrottlerGuard` enforces 100 req/min; `TenantMiddleware` stashes the `x-company-id` header into `AsyncLocalStorage`. Helmet/CORS already set on the app.
3. **Authentication.** `JwtAuthGuard` (passport-jwt) reads the `access_token` cookie, verifies it with `JWT_SECRET`, and attaches `req.user = {id,email}`. _The JWT does not carry a company claim._
4. **Authorization + tenant binding.** On routes that declare `@CheckPolicies`, `PoliciesGuard` looks up `membership(userId, x-company-id)`, throws 403 if absent/inactive, and builds the CASL ability from `membership.role`, then evaluates the policy. **⚠️ On routes _without_ `@CheckPolicies`, this guard returns `true` immediately — the membership check is skipped (the root cause of §6.1).**
5. **Service + RLS.** The controller reads the company via `@CurrentCompany()` (the raw header) and calls a service. For mutations, `RlsService.executeWithRls(companyId,userId,fn)` opens a `$transaction` and issues `SET LOCAL rls.company_id/audit.*` so PostgreSQL RLS policies (`companyId = current_setting('rls.company_id')::uuid`) filter rows — **provided the connection role is not BYPASSRLS.** Today the role (`excelsia`) _is_ BYPASSRLS, so RLS is inert and the effective guard is the app-level `WHERE companyId` plus the (fail-open) membership check. Many read paths do not use `executeWithRls` at all.
6. **Database + audit.** The write hits PostgreSQL; an `AFTER INSERT/UPDATE/DELETE` trigger calls `audit_trigger_function()`, writing an immutable row to `audit_logs` using the `SET LOCAL audit.*` context — DB-level, independent of the application AuditService.
7. **Cross-module events.** Domain changes (e.g., document renewal imminent) are persisted to `domain_events` (status PENDING) and emitted; Finance's `OperationsListenersService` reacts by creating auto-commitments via `executeWithRls`.

The chain is sound **when** `@CheckPolicies` is present and the connection role honors RLS. The two breaks — fail-open policy guard and a BYPASSRLS runtime role — are exactly §6.1 and §6.2.

---

## 9. Open Questions for the Owner

1. **CI ↔ Railway gate (Scenario A vs B).** Confirm in Railway → each service → Settings → Source whether "Wait for CI checks to pass" is enabled. Repo can't tell; leans Scenario B. (D5)
2. **Production RLS posture.** Run the `pg_roles` query in §6.2 — does the production runtime role hold `BYPASSRLS`? This determines whether _any_ DB-level tenant isolation exists in prod. (Top priority.)
3. **Cross-tenant leak (§6.1)** — please confirm whether you want FIX-SEC-1 prioritized as the first FASE-0 item ahead of the SII fixes (recommended).
4. **`railway.json` start command** marks `20260417171836_add_rls_policies` `--rolled-back` on every boot (D6) — intentional permanent workaround, or an artifact to remove? What is the actual `_prisma_migrations` state of that migration in production?
5. **SII production data** — run the §5.3 SELECTs to confirm recent runs are `baseapi` and no AEROPROTECHNIK residue remains; confirm `BASEAPI_KEY` is the new account's key.
6. **`JWT_SECRET`/`REFRESH_TOKEN_SECRET` set in Railway?** (D9) And was the seeded `Admin1234!` admin rotated in prod? (D14)
7. **LibreDTE** (`LibreDteClient` in `TaxModule`) — dead code, or an intended alternate SII path alongside BaseAPI?
8. **Doc reconciliation** — update `CLAUDE.md` (Next.js 16 not 14), retire the stale "Terminal Noir" §2.6 in the handoff (code uses Outfit/#2563eb), correct the "24 migrations"/"6 banks"/"~130 endpoints" figures, and fix `.github/workflows/README.md` (no staging).

### Checks marked NOT VERIFIED (require production DB / Railway access)

- Production role `BYPASSRLS`/superuser status (§6.2).
- Recent `tax_sync_runs.provider` values + residual mock-data scans (§5.3).
- `budget_*` tables absent in production (§5.3e).
- `JWT_SECRET`/`REFRESH_TOKEN_SECRET` set; `BASEAPI_KEY` is the new account's key; seeded admin rotated.
- Whether the Railway production `.next` build is clean of `/presupuestos` artifacts (D13).

---

_End of report. No files were modified; this document is the sole artifact and has not been committed._
