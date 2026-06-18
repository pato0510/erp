# EXCELSIA ERP — Technical Handoff Document

**Version:** 1.0 — June 2026
**Prepared for:** Incoming development team (Claude Code + Fable 5 agents, autonomous workflow)
**Prepared from:** Complete development history (8 documented sessions, April 15 – May 20, 2026)
**Source of truth hierarchy:** (1) The repository code itself, (2) `CLAUDE.md` in repo root, (3) This document, (4) User manuals (DOCX)

> ⚠️ **READ THIS ENTIRE DOCUMENT BEFORE WRITING ANY CODE.** Then run the companion repo verification protocol (`REPO-VERIFICATION-PROMPT.md`) to cross-check this document against the actual repository state. Where this document and the repo disagree, **the repo wins** — but flag the discrepancy to the product owner before proceeding.

---

## 1. PROJECT OVERVIEW

### 1.1 What Excelsia is

Excelsia ERP is a **multi-tenant management platform for Chilean companies**, built as a modular monolith. It consolidates financial management (bank movements, SII tax data, commitments, monthly closing) and operational compliance (assets, vehicles, document control, permits, procedures, alerts, operational blocking).

- **Production frontend:** https://app.excelsia.cl
- **Production API:** https://api.excelsia.cl
- **Repository:** https://github.com/pato0510/erp (working branch: `develop`)
- **Local path (owner's machine):** `~/Desktop/excelsia-erp/erp`
- **First client:** AGS Solutions SPA, RUT 77.004.647-5 (engineering/mining services, Antofagasta, Chile)
- **Admin login (dev):** admin@excelsia.dev / Admin1234!
- **Project started:** April 15, 2026. Finance module V1 complete ~April 24. Operations module V1 complete (37/37 tickets) ~April 29.

### 1.2 Module status

| Module                   | Status                                            | Tickets                    |
| ------------------------ | ------------------------------------------------- | -------------------------- |
| Finanzas (Finance)       | ✅ V1 COMPLETE                                    | ~30 tickets, Sprints 1–8   |
| Operaciones (Operations) | ✅ V1 COMPLETE                                    | 37/37 tickets, Sprints 1–8 |
| RRHH (HR)                | 🔜 NEXT — plan exists as separate file from owner | 0/N                        |
| HSEC                     | Planned                                           | 0/N                        |
| Comercial / CRM          | Planned                                           | 0/N                        |

### 1.3 Strategic decision (CRITICAL for prioritization)

**Build ALL modules in V1 before doing any V2 work.** The only exception: **critical fixes** (data integrity, security, SII integration correctness) are addressed immediately. The consolidated V2 backlog (~70 items) lives in section 11 and in the DOCX `Backlog-Excelsia-V1-a-V2.docx`.

---

## 2. STACK & ARCHITECTURE

### 2.1 Stack

- **Monorepo:** Nx with module-boundary enforcement
- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui — `apps/web`
- **Backend:** NestJS + TypeScript, domain modules — `apps/api`
- **Database:** PostgreSQL 16 with **Row Level Security (RLS)** for multi-tenancy
- **ORM:** Prisma with `prismaSchemaFolder` (one `.prisma` file per domain in `apps/api/prisma/schema/`)
- **Queues/jobs:** Redis + BullMQ
- **Object storage:** MinIO (S3-compatible) with **DB blob fallback**
- **Auth:** JWT in **HttpOnly cookies** (never localStorage) + Passport.js
- **Authorization:** RBAC + CASL (guards at endpoint level AND query level)
- **Audit:** PostgreSQL PL/pgSQL triggers (`audit_trigger_function()`) on all business tables — infallible, DB-level
- **Observability:** Sentry + distributed tracing (configured Sprint 1)
- **Local infra:** Docker Compose (PostgreSQL, Redis, MinIO)
- **CI/CD:** GitHub Actions → Railway auto-deploy on push to `develop`
- **DNS:** Cloudflare (app.excelsia.cl / api.excelsia.cl)

### 2.2 Architectural decisions (non-negotiable invariants)

1. **Modular monolith, NOT microservices.**
2. **Multi-tenancy = shared database + PostgreSQL RLS.** Never trust application-level WHERE filters alone.
3. **JWT never in localStorage.** Always HttpOnly Secure cookie.
4. **Audit via PL/pgSQL triggers**, complemented (not replaced) by app-level AuditService.
5. **Next.js is a BFF** (presentation/orchestration). All heavy business logic lives in NestJS.
6. Prisma schema split by module via `prismaSchemaFolder`.
7. Complex transactions always explicit: `prisma.$transaction()`.
8. Modules never import another module's entities/repositories directly — only public facades. Nx `enforce-module-boundaries` checks this in CI.

### 2.3 Multi-tenant security flow (CRITICAL)

```
JWT (cookie) → TenantMiddleware extracts companyId →
AsyncLocalStorage propagates through the request →
On every DB transaction: SET LOCAL rls.company_id = '<uuid>' →
PostgreSQL RLS policies filter every SELECT/UPDATE/DELETE automatically
```

- RLS policies follow the pattern: `USING ("companyId" = current_setting('rls.company_id')::uuid)`
- Mutations go through `RlsService.executeWithRls(companyId, userId, fn)`.
- **Every new table requires: RLS policy + audit trigger + GRANT to `app_user`.** This is the single most repeated convention in the project. Missing any of the three has caused bugs before.
- ⚠️ Known V2 item: the `app_user` DB role currently has `BYPASSRLS` in some environments — lowering this privilege is pending and requires coordinated deploy.
- ⚠️ **Materialized views do NOT inherit RLS.** Every query against an MV must filter by `company_id` explicitly in the service layer (parameterized `$queryRaw`). This is already done for the 4 Operations MVs — preserve this pattern for any new MV.

### 2.4 Roles (CASL / RBAC)

Six system roles: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `ANALYST`, `VIEWER`.
Permissions enforced at endpoint level (guards/`@CheckPolicies`) and reflected in UI (buttons hidden). A VIEWER calling the API directly receives 403.

### 2.5 Frontend conventions

- Feature folders; React Hook Form + Zod; consistent loading/error/empty states.
- **Stable useEffect pattern:** primitive deps only, no object state in deps (an infinite re-render bug in Movements — DASH-003 — was caused by violating this).
- All money amounts formatted with `formatCLP()` from `lib/formatters.ts`.
- API calls via `apiClient` (in `apps/web/src/lib/api.ts`) which sends the `x-company-id` header. There are **no rewrites** in `next.config.js` — web (port 3000) calls the API (port 3001) directly in dev.
- ⚠️ **Route convention quirk:** Finance pages live directly under `(dashboard)` WITHOUT a `/finanzas/` prefix in the file system (`/movimientos`, `/caja`, `/banco`, `/conciliacion`, `/contrapartes`, `/tributario`), while Operations pages live under `/operaciones/...`. New finance-area screens must follow the flat convention. (This inconsistency bit us once: a budgets screen was generated at `/finanzas/presupuestos`, broke, and had to be moved.)

### 2.6 Design system — "Terminal Noir"

Custom design system. Tokens:

```
--color-dark: #0C0F1A        (dark panels, sidebar, primary button)
--color-accent: #4ECDC4      (teal — accents, links, checkmarks; THE ONLY accent color)
--color-accent-dim: rgba(78,205,196,0.15)
--color-surface: #fafafa     (inputs, cards)
--color-border: #e8eaed
--color-border-dark: #1a2535
--color-text-muted: #9aa0ad
```

Fonts: `JetBrains Mono` (labels, data, sidebar nav, terminal blocks), `Syne` (titles/headlines), `Inter` (body). Note: some later screens also used `Outfit` for titles — verify current usage in the repo.

Rules: never another accent color (no purple/blue/orange); never Inter on dark panels (always JetBrains Mono); **never gradients**; icons lucide-react (16px nav, 20px content); all CLP amounts via `formatCLP()`.

---

## 3. INFRASTRUCTURE & DEPLOYMENT

### 3.1 Railway (production)

- Services: **Postgres** (with `postgres-volume`, image `ghcr.io/railwayapp-templates/postgres-ssl`), **api** (Node, deployed from GitHub `develop`), **web** (deployed from GitHub `develop`), **Redis**.
- Build: Railway build commands (not Dockerfiles) — Railway's Railpack/Nixpacks flow.
- Auto-deploy: every push to `develop` triggers production deployment. **There is no separate staging environment.** Local dev = staging. CI must be green before push.
- Plan: **Hobby Plan (USD $5/mo)** since May 2026 (trial expired and caused a full production outage — see §12 incidents).
- Internal DB URL: `postgres.railway.internal:5432`, database `railway`.
- DB access from CLI: `railway link` then `railway connect postgres`.

### 3.1.1 Deploy pipeline (read this carefully)

> 🚨 **`develop` IS the production branch. There is NO staging environment.** Local dev is the de-facto staging. Every push to `develop` ends up in front of the live client at app.excelsia.cl. Validate locally before every push.

```
  ┌─────────────────────────────────────────────────────────────┐
  │  LAYER 1 — Local validation (the developer's real "staging") │
  │  nx serve api + nx serve web → test on localhost:3000/3001    │
  │  migrations applied & checked in local psql FIRST            │
  └───────────────────────────┬─────────────────────────────────┘
                              │ git commit (one per ticket) + git push origin develop
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  LAYER 2 — GitHub Actions CI (lint + build)                   │
  │  nx lint + nx build (api & web). NO robust test suite today;  │
  │  no E2E setup (Playwright is a V2 backlog item).              │
  └───────────────────────────┬─────────────────────────────────┘
                              │ CI green
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  Railway — build (Railpack/Nixpacks) + IMMUTABLE deploy       │
  │  Traffic switches to the new build ONLY if the build succeeds.│
  │  A failed build does NOT replace the running version.         │
  └───────────────────────────┬─────────────────────────────────┘
                              ▼
                   Production (app/api.excelsia.cl)
```

**Does a failed build take production down? No.** Railway uses immutable deploys: the live container keeps serving the last successful deploy, and a failed build is just marked as a failed deploy. In the entire project history, the only thing that ever took production down was the Railway trial expiring (infra/billing — see §12), never a broken commit or failed build.

**What the build does NOT catch (caught by Layer 1 local validation instead):** a bad DB migration (build is just TypeScript compiling — the migration only runs against the live DB), a missing Railway env var (compiles fine, crashes on boot), or a logic error that compiles but behaves wrong (e.g. mock-sii inserting fake data). This is why local validation before pushing is non-negotiable.

> ⚠️ **TO VERIFY against the repo (Phase 1 of the verification protocol):** Is Railway configured to **wait for the GitHub Actions check** before deploying (Scenario A — CI is a gate), or does it deploy **in parallel** the moment it detects the push, independent of CI (Scenario B)? And confirm exactly what CI runs (lint + build only, or any tests). This distinction determines how much the team can trust CI as a safety net. It is not confirmable from the development history alone.

### 3.2 Cloudflare

DNS for `excelsia.cl`: `app` → Railway web service, `api` → Railway api service.

### 3.3 Environment variables (api service, key ones)

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET / REFRESH_TOKEN_SECRET   (generated with openssl)
BASEAPI_KEY        (BaseAPI — SII integration; ⚠️ see §8, key belongs to a NEW account, may need rotation)
SII_RUT=77004647-5
SII_PASSWORD       (client's SII portal password)
DASHBOARD_USE_MATERIALIZED_VIEWS=true   (feature flag, Operations dashboard; false = live-query fallback)
NEXT_PUBLIC_APP_URL (used for QR public URLs)
```

### 3.4 Local development

```
docker compose up -d                                   # Postgres + Redis + MinIO
npx prisma generate --schema=apps/api/prisma/schema
npx prisma migrate deploy --schema=apps/api/prisma/schema
npx nx serve api                                       # port 3001 (API_PORT in .env)
npx nx serve web                                       # port 3000
Local DB: postgresql://excelsia:excelsia_dev_password@localhost:5432/excelsia_dev
```

---

## 4. DEVELOPMENT METHODOLOGY & CONVENTIONS

### 4.1 The workflow that built this project

1. **`CLAUDE.md` in repo root is the operational source of truth.** Claude Code reads it at session start. It contains: project context, stack, conventions, completed tickets per sprint, V2 backlog, and a `# Ticket actual` section.
2. Per ticket: update `CLAUDE.md` (`# Ticket actual`) → commit → hand a detailed spec prompt to Claude Code (prompts forbid Claude Code from running git) → human validates locally → **one commit per ticket** → push to `develop` → Railway auto-deploys.
3. Commit format: `tipo(scope): description` — types: feat, fix, chore, refactor, test, docs. English always. Typical close: `git add . && git commit -m "feat(module): ... + update CLAUDE.md" && git push origin develop`.
4. Branching: early work used `feature/TICKET-ID-description` branches merged to `develop`; from the Operations module onward, work was committed directly to `develop` (single developer). No force pushes, no rebases of pushed commits.
5. Every Claude Code prompt begins with: _"Read the CLAUDE.md file carefully before doing anything. Do not run any git commands."_

### 4.2 Definition of Done per ticket

Code implemented; validations complete; CASL permissions applied; audit where relevant; states correctly modeled; manual tests passed; multi-tenancy not broken; builds pass (`npx nx build api` and `npx nx build web`); migration runs cleanly; `CLAUDE.md` updated.

### 4.3 Known process risks (learned the hard way)

- Claude Code occasionally diverges from spec in small ways (real schema names vs. spec names). It usually verifies the real schema — its divergences have generally been correct. **Always read its completion report.**
- After adding new controllers/modules, NestJS hot reload is unreliable → **restart `nx serve api`**.
- After moving page folders in Next.js, relative imports break and `.next` cache must be cleared (`rm -rf apps/web/.next`). V2 item: adopt `@/` path aliases.
- New screens must check the existing route convention before placing files (see §2.5).

---

## 5. FINANCE MODULE (V1 COMPLETE) — HISTORY & CAPABILITIES

### 5.1 Sprint/ticket history

**Sprint 1 — Base platform:** ARC-001 Nx monorepo · ARC-002 Docker Compose (PG/Redis/MinIO) · ARC-003 Prisma prismaSchemaFolder · ARC-004 Redis+BullMQ · ARC-005 ESLint/Prettier/Husky/Nx boundaries · ARC-006 Sentry+tracing · ARC-007 GitHub Actions CI.

**Sprint 2 — Identity, security, multi-tenancy:** TEN-001 Tenant/Company/User/Membership models · IAM-001 JWT auth HttpOnly cookies · IAM-002 logout/expiration/refresh token · IAM-005 roles+CASL · TEN-003 PostgreSQL RLS · AUD-001 audit triggers.

**Sprint 3 — Configuration & catalogs:** CFG-001 company financial settings · CAT-001 income/expense categories CRUD · CAT-002 counterparties CRUD · CAT-003 cost centers & fiscal periods.

**Sprint 4 — Financial core:** MOV-001 movements CRUD · CASH-001 bank accounts, opening balances & commitments · MOV-002 bulk import CSV/Excel · DASH-001 main dashboard KPIs · DASH-002 movements screens · DASH-003 fix infinite re-render · CASH-002 cashflow screen.

**Sprint 5 — Dashboard, alerts, reports:** DASH-004 enhanced dashboard (charts, period selector) · ALR-001 alerts system (rules + screen) · REP-001 Excel export & reports.

**Sprint 6 — Banking integration:** BNK-001 banking adapter with mock provider · BNK-002 automatic sync BullMQ + sync history · BNK-003 manual cartola (bank statement) import as fallback. Six Chilean banks supported for cartola parsing: BancoEstado, Banco de Chile, Santander, BCI, Itaú, Scotiabank.

**Sprint 7 — Tax & reconciliation:** TAX-001 SII integration **with mock provider** · REC-001 reconciliation engine (exact matching bank↔documents).

**Sprint 8 — Closing & hardening:** CLS-001 monthly closing (5-rule checklist, period lock, ADMIN-only reopen, OPEN → IN_REVIEW → CLOSED flow) · SEC-001 security hardening · QA-001 critical tests · REL-001 go-live checklist.

**Post-V1 additions:** SII-002 (replace mock with **BaseAPI** real provider — see §8), SII-003 (auto-create movements from synced SII documents, with "Productos no categorizados" fallback category), multi-year fiscal configuration, dashboard multi-year view, design overhaul (Terminal Noir), módulos selection screen at login.

### 5.2 Key Finance domain tables (verify names in repo)

`tenants, companies, company_settings, company_goals, users, memberships, categories, category_rules, counterparties (taxId = RUT, UNIQUE(companyId, taxId)), cost_centers, fiscal_periods, movements, bank_accounts, account_balances, bank_connections, bank_sync_runs, external_bank_movements, reconciliation_matches, commitments, commitment_templates, alerts, alert_thresholds, tax_documents, tax_sync_runs, sii_connections, user_notifications, import_logs, audit_logs, domain_events`.

`movements` highlights: single `amount Decimal(18,2)` (no separate neto/IVA — those live in `tax_documents`), `type (MovementType)`, `status (DRAFT/CONFIRMED/...)`, `source (MANUAL/TAX_SYNC/...)`, `counterpartyId FK`, `fiscalPeriodId FK`, `metadata JSONB`, full audit columns.

`tax_documents` highlights: `type (DocumentType: FACTURA_ELECTRONICA=33, BOLETA_ELECTRONICA=39, NOTA_CREDITO=61, NOTA_DEBITO=56, LIQUIDACION_FACTURA=43, FACTURA_NO_AFECTA=34)`, `direction (EMITIDO/RECIBIDO)`, `folio`, `issuerRut/issuerName/receiverRut/receiverName` (plain strings, NO FK to counterparties), `netAmount/taxAmount/totalAmount Decimal(18,2)`, `status`, `movementId` nullable FK (SET NULL), `@@unique(companyId, type, folio, direction)` — this unique constraint is the idempotency mechanism for sync.

`tax_sync_runs`: per-sync log; **`provider` column has DB default `'mock-sii'`** ⚠️ (see §8.4).

### 5.3 Finance user-facing capabilities

Dashboard with KPIs/charts/period & multi-year selector; movements (create, confirm, cancel, bulk CSV/Excel import); cash (consolidated balance + commitments with templates and recurring); bank (accounts, mock-provider sync, manual cartola import for 6 Chilean banks); reconciliation (exact matching engine); tax (`/tributario`: SII connection status, sync emitidos/recibidos per fiscal period, documents table); monthly closing (checklist + lock + executive summary); alerts (rules + in-app notification center); Excel reports; counterparties; categories with auto-categorization rules; fiscal config multi-year.

---

## 6. OPERATIONS MODULE (V1 COMPLETE, 37/37) — HISTORY & CAPABILITIES

### 6.1 Concept

Operational & documentary compliance: the company knows at all times what assets it has, what documents each one needs/has/lacks, what expires when, and which assets must be **automatically blocked** for non-compliance. Core flow: _Asset → required docs (requirements matrix) → uploaded docs → expirations → alerts → operational status → reports → Finance commitments._

### 6.2 Sprint/ticket history (all ✅)

**Sprint 1 — Foundation:** OPS-001 module-selection panel at login · OPS-002 `/operaciones` structure (sidebar+routes) · OPS-003 base schema (`operational_assets`, `asset_types`, `asset_subtypes`, `locations`) · OPS-004 document types + **requirements matrix with specificity resolution engine (asset > subtype > type)**; 12 default Chilean document types via seed.

**Sprint 2 — Equipment:** OPS-005 equipment CRUD (photo, parent-child hierarchy, JSONB dynamic attributes, tags, user assignment) · OPS-006 ficha 360 · OPS-007 unified config screen (3 tabs) · OPS-008 bulk CSV/Excel import (ImportLog, max 1000 rows/5MB).

**Sprint 3 — Vehicles:** OPS-009 vehicles CRUD (extends OperationalAsset; AssetType must be category VEHICLE; endpoints `/api/operations/fleet/vehicles`; odometer non-decreasing validation) · OPS-010 **Chile document pack** (auto-associates SOAP, PERMCIRC, REVTEC, PADRON on VEHICLE asset types; `POST /asset-types/:id/apply-vehicle-defaults`) · OPS-011 vehicle ficha 360 · OPS-012 bulk import (Spanish fuel-name mapping).

**Sprint 4 — Document control:** OPS-013 central screen `/operaciones/documentos` (global compliance KPIs) · OPS-014 upload with metadata (MinIO + DB blob fallback; auto-expiration from `defaultValidityDays`; max 10MB; pdf/jpg/png/webp/doc/docx/xls/xlsx) · OPS-015 approval workflow (approve/reject ADMIN/MANAGER only; **uploader ≠ approver**; reject reason ≥10 chars; resubmit by original uploader; pending queue screen + sidebar badge) · OPS-016 **immutable versioning/supersession** (supersede creates new + marks old REPLACED; 409 on duplicate upload offering supersession; REPLACED docs immutable; compliance engine excludes REPLACED) · OPS-017 per-asset document folder with detailed compliance (ComplianceGauge; grouping by criticality; **PDF report + ZIP export** via pdfkit + archiver).

**Sprint 5 — Alerts & blocking:** OPS-018 configurable alert rules per document type (`alert_rules`, `company_alert_settings`; severities INFO/WARNING/CRITICAL/BLOCKING; dynamic default rules computed at query time, overridable) · OPS-019 daily BullMQ scheduler recalculating expirations · OPS-020 **automatic operational blocking** (CRITICAL + blocksOperation expired → asset status `BLOCKED_DOCUMENTAL`) · OPS-021 alert center UI · OPS-022 severity escalation (in-app notifications) · OPS-023 approved temporary exceptions (`asset_exceptions`: admin releases block with justification + validity date, full audit).

**Sprint 6 — Permits & procedures:** OPS-024 external permits · OPS-025 internal work permits (height, hot work, confined space...) · OPS-026 permit approval workflow (`permit_approvals`, `permit_approval_steps`) · OPS-027 procedures library with versioning (`procedures`, `procedure_revisions`) · OPS-028 read-acknowledgment for critical procedures (`procedure_acknowledgments`).

**Sprint 7 — Calendar, reports, Finance integration:** OPS-029 operational calendar · OPS-030 Excel/PDF reports · OPS-031 **domain events Operations → Finance** (`domain_events` table, handlers in Finance) · OPS-032 **automatic commitments** (SOAP/permits/insurance renewals become Finance commitments automatically).

**Sprint 8 — Hardening:** OPS-034 **4 materialized views** (`mv_asset_compliance_snapshot`, `mv_company_compliance_summary`, `mv_compliance_by_category`, `mv_asset_status_distribution`; migration 20260429140000 pure SQL; MaterializedViewsService refresh fast/slow + 5-min throttle; BullMQ crons `*/15` fast + hourly slow; `POST /refresh-views` ADMIN; `GET /freshness`; feature flag `DASHBOARD_USE_MATERIALIZED_VIEWS`; freshness indicator + "Avanzado" tab in config) · OPS-035 **QR per asset** (4 fields on OperationalAsset: `qrToken @unique` 32-char base64url, `qrGeneratedAt`, `qrLastScannedAt`, `qrScanCount`; AssetQrService idempotent ensure/regenerate; PNG/SVG via `qrcode`, printable PDF label 10cm/5cm via pdfkit; public endpoint `GET /api/operations/public/asset/:qrToken` throttled 30/min; public mobile-first page `/p/asset/[qrToken]` hybrid public/authenticated; bulk generation; migration 20260429150000) · OPS-036 **audit packages** (`audit_packages` table; screen `/operaciones/auditoria` ~1100-line single file; cryptographically signed ZIP: 00-PORTADA.pdf + MANIFIESTO.json with per-file SHA-256 + global signature + MARCO-LEGAL.pdf + 7 Excel reports; 7 endpoints; jszip; migration 20260429160000) · OPS-037 module closure (ESLint cleanup; `Map<string, ReportDef>` refactor; health endpoint `/api/operations/health` with 5 parallel checks; `/health/crons` lists 9+ repeatables; 6 docs in `apps/api/src/modules/operations/`: README.md, MODULE_OVERVIEW.md, API_REFERENCE.md (~130 endpoints), SECURITY_AUDIT.md, KNOWN_ISSUES.md, MIGRATION_HISTORY.md).

### 6.3 Operations key facts

- ~130 endpoints under `/api/operations/...` (see API_REFERENCE.md in repo).
- 24 migrations for the module (20260417171836 → 20260429160000).
- 8 asset statuses: OPERATIONAL, WITH_OBSERVATIONS, IN_MAINTENANCE, NOT_OPERATIONAL, BLOCKED_DOCUMENTAL, BLOCKED_PERMIT, OUT_OF_SERVICE, DECOMMISSIONED (verify exact enum names in schema).
- The daily alert cron (06:00 UTC) produces benign `duplicate key` errors on `alert_instances` — that is **idempotency working correctly**, not a bug. Do not "fix" it by removing the unique constraint.

---

## 7. CROSS-MODULE INTEGRATION (Operations → Finance)

- `domain_events` table + event handlers: document/permit renewal-imminent events create **automatic Finance commitments** with estimated cost and due date (e.g., SOAP renewal for a vehicle becomes a future commitment).
- Known V2 gaps: Finance event handlers only log (no metrics); no automatic retry for failed handlers (manual retry endpoint only).

---

## 8. SII INTEGRATION (⚠️ CONTAINS THE #1 CRITICAL OPEN ISSUE)

### 8.1 History

1. **TAX-001** (Finance Sprint 7): provider-adapter architecture with `ISiiProvider` interface (`getEmitidos`, `getRecibidos`, `getDocumentXml`, `validateRut`, `getProviderName`) + **MockSiiProvider** generating realistic fake Chilean documents. Factory: `'mock-sii' → MockSiiProvider; 'sii' → throws not-implemented`.
2. **LibreDTE was evaluated and DISCARDED** (cost ~$40.000 CLP+IVA/month).
3. **SII-002**: BaseAPI (baseapi.cl) integration built. `BaseApiSiiProvider` implements `ISiiProvider`. Endpoints: `POST https://api.baseapi.cl/api/v1/sii/rcv/ventas` (emitidos), `/sii/rcv/compras` (recibidos), `/sii/contribuyente/informacion` (connection test). Auth header `X-API-Key: {BASEAPI_KEY}`; body carries `{ rut, password, periodo: "YYYY-MM" }`. The spec said to make `'baseapi'` the **default** provider in the factory.
4. **SII-003**: auto-create movements from synced documents (source=`TAX_SYNC`), uncategorized go to "Productos no categorizados".
5. Historical re-sync from 2019 was performed in production — real, coherent data confirmed.

### 8.2 The AEROPROTECHNIK incident (resolved, instructive)

Production contained 13 fake DTEs + 13 linked movements for `AEROPROTECHNIK - AEREAL ENGINEERING LDA`, RUT **55555555-5** (structurally impossible Chilean RUT), period Jun-2020→Nov-2022, fake total $58.397.304.674 CLP, all `netAmount=0, taxAmount=0, totalAmount>0` (impossible in a real DTE: neto + 19% IVA = total). These were mock-provider artifacts. **Deleted from production on ~May 20, 2026** in a transaction (tax_documents by RUT, movements by description ILIKE), no backup of movements per owner decision. Detection heuristics worth keeping: all-same-digit RUTs, zero neto+IVA with nonzero total, absurd totals, foreign company suffixes (LDA, GmbH).

### 8.3 BaseAPI account churn

The owner **deleted his original BaseAPI account by mistake** and created a new one. The old API key kept working for a while (soft-delete grace). **Open task: confirm `BASEAPI_KEY` in Railway and local `.env` is the NEW account's key.**

### 8.4 ⚠️ CRITICAL OPEN ISSUE — provider default

`tax_sync_runs.provider` has DB column default `'mock-sii'`. SII-002 specified making `'baseapi'` the runtime default, and real 2019+ data did sync — but the residual mock data proves mock ran against production at some point. **FASE 0 verification required (do this BEFORE any new module work):**

1. `grep -ri "baseapi" apps/api/src/modules/tax/` — confirm `BaseApiSiiProvider` exists and is registered.
2. Inspect the provider factory: what is the actual default when no provider is specified? Trace every call site of `syncDocuments`/`syncAll`.
3. In production: `SELECT provider, status, COUNT(*), MAX("startedAt") FROM tax_sync_runs GROUP BY provider, status;` — verify recent runs say `baseapi`.
4. Check whether any remaining mock data exists: scan `tax_documents` for all-same-digit RUTs and `netAmount=0 AND taxAmount=0 AND totalAmount>0`.
5. Create a migration changing the `tax_sync_runs.provider` column default away from `'mock-sii'` (to `'baseapi'` or no default), coordinated with code.
6. Verify `BASEAPI_KEY` is the new account's key in Railway + `.env`; run a manual sync of one period and confirm clean real data.

---

## 9. DOCUMENTATION INVENTORY

- **`CLAUDE.md`** (repo root) — operational source of truth, updated per ticket.
- **In-repo Operations docs** (`apps/api/src/modules/operations/`): README, MODULE_OVERVIEW, API_REFERENCE (~130 endpoints), SECURITY_AUDIT, KNOWN_ISSUES, MIGRATION_HISTORY.
- **User manuals (DOCX, delivered to client):** Manual de Operaciones v1.1 (17 chapters, incl. QR field verification, audit packages, FAQ) · Manual de Finanzas v1.0 (17 chapters) · Backlog Excelsia V1→V2 (7 chapters, full V2 inventory + roadmap + 12–15 month timeline).
- **Pending manuals:** System Administration, RRHH, HSEC, Comercial (one per future module, same 17-chapter standard, 60–90 KB DOCX).

---

## 10. ABANDONED / REVERTED WORK (do not be confused by references to it)

**FIN-001 — Annual Budgets ("Presupuestos")**: fully built locally in May 2026 (4 tables `budgets/budget_groups/budget_items/budget_alerts`, migration `20260504100000_add_budgets`, suggestion engine `avg×0.4 + lastYear×(1+growth)×0.4 + commitments×0.2, ×(1+UF 4%)`, screen `/presupuestos`, 10 components, alerts cron 06:30). **NEVER committed/pushed. Reverted entirely** (owner chose a fresh re-clone). The client saw a demo and wants it **redesigned differently in the future** — treat the old design as reference only, not as a base. If `budget_*` tables ever appear in a local DB, they are leftovers to drop.

---

## 11. V2 BACKLOG (consolidated, ~70 items — execute ONLY after all V1 modules)

### Operations (~25)

Granular domain events for selective MV refresh; extend `mv_compliance_by_category` (expiringSoon/expired/missing); public asset page auto-upgrade when authenticated; public asset photo (signed URLs); professional logo in QR PDF; bulk PDF download; audit multi-select locations/assetTypes; AssetComplianceReport `string[]` filters; extract audit page components (~1100-line file); cron cleanup of expired audit packages; async package generation (BullMQ + WebSocket + email); ~78 pre-existing ESLint warnings (calendar/dashboard/work-permits); drop BYPASSRLS from `app_user`; Swagger/OpenAPI; autocomplete dropdowns in Reports; cross-screen links from reports; report re-download history; industry template packs; inline PDF editor; Word/Google Docs integration; AI procedure-draft assistant; native e-signature (FirmaGob); bitemporal modeling; offline PWA; OCR; native QR mobile app. Architecture debt: AlertEngine parallelize per-company; Finance event handlers metrics; retry logic for failed handlers; MinIO connection pool.

### Finance (~20)

Email/Slack/Teams/webhook notifications (V1 in-app only); dashboard widget personalization + drill-down; scheduled recurring reports + previews + BI integration; SII auto-complete on counterparties; config export/import between companies; duplicate counterparty detection; more banks (Falabella, Ripley, BICE, Security, Internacional); partial reconciliation (split movements); bank-API direct reconciliation; duplicate cartola detection; closing approval workflow + snapshot-vs-current diff + annual close; recurring commitment templates + estimation-accuracy analytics; **complete/validate real BaseAPI integration (FASE 0, not V2)**; optional real-time SII sync; Form 29 flat-file generator; redundancy SII provider.

### Cross-cutting (~30)

Redis caching, CDN, lazy loading, pagination, N+1 fixes; Prometheus/Grafana, OpenTelemetry, health dashboards, on-call alerts, structured logging; pentest, 2FA for admins, secret rotation, access audit, at-rest encryption; **Playwright E2E (no E2E setup exists today)**, k6 load tests, visual regression, >80% unit coverage on core; production-grade Railway plan or migration, blue-green deploys, automated DB backups (30-day retention), DR plan, WAF; WCAG 2.1 AA, dark mode, i18n (EN), keyboard shortcuts; public OAuth2 API, outgoing webhooks, Defontana/Nubox/Buk, Transbank/Webpay, Google/Outlook calendar sync; updated architecture diagrams, dev onboarding, ops runbook, per-endpoint API docs with examples. Frontend: adopt `@/` path aliases.

---

## 12. PRODUCTION INCIDENT HISTORY (lessons that must inform operations)

1. **Railway trial expiration (May 18, 2026):** Postgres + api containers stopped when the trial ended (PostgreSQL logs simply went silent after routine checkpoints; api looped on Prisma P1001). **Data survived** on `postgres-volume`. Recovery required: paying Hobby Plan → **permissions did not propagate automatically** → logout/login + hard refresh → explicit **Redeploy** (not Restart) of Postgres FIRST, then api. A `catatonit: failed to exec pid1` error during restarts was a Railway volume-mount race, resolved by redeploy after the plan activated. Lesson: after any Railway plan change, expect to redeploy services manually, DB before API.
2. **Daily 06:00 UTC `duplicate key` on `alert_instances`:** benign idempotency, expected noise.
3. **Mock data leaked into production** (§8.2): mock providers + production must never mix; provider defaults matter.

---

## 13. IMMEDIATE ROADMAP (agreed with owner, June 2026)

1. **FASE 0 (critical, before anything):** SII/BaseAPI verification & fix (§8.4). Estimated 1–5 days depending on whether the real provider needs work.
2. **Improvements to Operations module** (owner will provide the list; structure them as OPS-038+ tickets).
3. **RRHH module V1** — owner has the development plan as a separate file. Consolidate into HR-001..HR-NNN tickets following the same sprint methodology. Probable scope: employee records/contracts, org structure, payroll (Chilean legal deductions), legal docs, vacations/permissions, training, performance, integration with Finance (salaries as expenses) and Operations (procedure acknowledgments).
4. **HSEC module V1**, then **Comercial/CRM V1** (plans to be provided as files).
5. **Manuals** per module at each V1 close.
6. **V2 consolidated phase** at the end (§11).

---

## 14. OPERATING RULES FOR THE INCOMING AGENT TEAM

1. Repo is truth; `CLAUDE.md` is the live operational state — **keep updating it per ticket** exactly as before (completed sections + `# Ticket actual`).
2. One commit per ticket, conventional commits, English, push to `develop` only with green builds. Every push deploys to production — act accordingly.
3. Every new table: RLS policy + audit trigger + GRANT to `app_user`. Every new MV: explicit company_id filtering.
4. Never break the JWT-cookie/CASL/RLS chain. Never put business logic in the frontend.
5. Follow Terminal Noir; never introduce new accent colors or gradients.
6. Chilean domain correctness matters: RUT validation (Módulo 11), DTE math (neto + 19% IVA = total), CLP formatting, UF awareness.
7. Before "fixing" anything that looks odd (mock providers, duplicate-key logs, route conventions), check this document's incident/quirk sections — several oddities are intentional or known.
8. When this document conflicts with the repo, trust the repo, flag the conflict.
