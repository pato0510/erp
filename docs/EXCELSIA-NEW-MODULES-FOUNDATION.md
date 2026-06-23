# Excelsia — New Modules: Foundation & Cross-Module Contracts

**Scope:** RRHH · Comercial · Marketing (the three new V1 modules)
**Status:** Architecture baseline — prerequisite for the per-module development plans
**Source:** Adapts the external dev-team plan (`plan-dev-nuevosmodulos-v0`) to Excelsia's actual production stack
**Date:** 2026-06-23

> This is the load-bearing baseline that the RRHH, Comercial, and Marketing plans all inherit. It does two things: (1) reconciles the external development plan against what Excelsia **already has built**, and (2) fixes the conventions, shared entities, and cross-module integration contracts that every module plan must respect. Read this before any single-module plan.

---

## 0. The principle that rewrites the external plan

The external plan was written assuming a greenfield build. **Excelsia is not greenfield.** Finanzas V1 and Operaciones V1 are in production, and they already ship most of what the external plan's "Sprint 0" proposes to build from scratch. The single most important adaptation is therefore: **map to what exists; do not rebuild it.**

| External plan asks to build                                                            | Already exists in Excelsia                                                                                                                                                                                                    | Reuse strategy                                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Transversal document system (upload, categorize, expiry, block on critical-expired)    | Operations document-control engine: upload (MinIO + DB blob fallback, mime/size validation), immutable versioning/supersession, expiry from `defaultValidityDays`, compliance engine, approval workflow (uploader ≠ approver) | New-module documents reuse this engine, not a new one (see recon R1)       |
| Transversal alert system                                                               | Operations alert engine: `alert_rules` / `alert_instances` / `company_alert_settings`, severities INFO/WARNING/CRITICAL/BLOCKING, daily BullMQ scheduler, escalation, in-app notifications                                    | New-module alerts register their rules in this engine (recon R2)           |
| Audit / change history                                                                 | PL/pgSQL `audit_trigger_function()` on every business table — DB-level, infallible                                                                                                                                            | Every new table gets an audit trigger (invariant §1)                       |
| Reusable UI: table, filters, drawer, modal, calendar, kanban, upload, timeline, badges | `KpiCard`, `DocumentStatusBadge`, `ComplianceGauge`, the movements table pattern, modal pattern, month-grid calendar, tabbed-ficha pattern — all proven reusable in the demo                                                  | New screens reuse verbatim; the frozen demo branch is the visual reference |
| RBAC by module                                                                         | CASL (6 roles, subjects, `@CheckPolicies`, endpoint + query level)                                                                                                                                                            | New tables get CASL subjects (§1)                                          |
| Scheduled jobs for alerts                                                              | BullMQ (9 repeatable crons already running)                                                                                                                                                                                   | New jobs are BullMQ crons                                                  |
| Document storage                                                                       | MinIO (S3-compatible) + DB blob fallback                                                                                                                                                                                      | Reuse                                                                      |
| PostgreSQL with strong relations                                                       | Postgres 16 + RLS multi-tenancy                                                                                                                                                                                               | Every new table gets RLS (§1)                                              |

**Consequence:** the external plan's Sprint 0 collapses from "build the foundation" to **a short read-only recon that confirms how cleanly each engine can be reused for the new entities** (§5). Weeks saved.

---

## 1. Inherited invariants (non-negotiable for every new table/module)

From the production system, applied without exception:

1. **Every new table:** RLS policy (`"companyId" = current_setting('rls.company_id')::uuid`) + audit trigger + GRANT to `app_user`. No exceptions. Every new materialized view: explicit `company_id` filtering in the service layer (MVs do not inherit RLS).
2. **The JWT-cookie → CASL → RLS chain is never broken.** JWT in HttpOnly cookies only. CASL at endpoint (`@CheckPolicies`) **and** query level. _(Note: the demo's `JwtAuthGuard`-only endpoints were a demo shortcut. Real endpoints get `@CheckPolicies` so the membership check fires — this is exactly the fail-open gap the ownership audit found. New modules do not repeat it.)_
3. **All business logic in NestJS.** Next.js is BFF / presentation only.
4. **Design system = the real tokens:** accent `#2563eb`, headings `Outfit`, glassmorphism — per `tokens.css` and `CLAUDE.md`. NOT the handoff's stale "Terminal Noir" `#4ECDC4`/Syne. New screens match the current Finanzas/Operaciones dashboards; no new visual system.
5. **Chilean domain correctness:** RUT Módulo-11 validation, DTE math (neto + 19% IVA = total), CLP formatting, UF/UTM awareness, provisional/tax rates **parametrizable per period — never hardcoded**.
6. **Route conventions:** finance pages are flat under `(dashboard)`; operations under `/operaciones/...`. New module pages follow the per-module nested convention (`/rrhh/...`, `/comercial/...`, `/marketing/...`).
7. **Execution ritual:** one commit per ticket (conventional commits, English); update `CLAUDE.md` `# Ticket actual`; every CC prompt starts with _"Read the CLAUDE.md file carefully before doing anything. Do not run any git commands."_; validate locally before push; **develop = production**.
8. **Prisma enum gotcha:** enum members cannot contain `Ñ` — use ASCII members (e.g. `CAMPANA`, `EN_REVISION`) and map to display labels (`"Campaña"`, `"En revisión"`) in the UI. Audit every new enum so no raw code ever renders.

**FASE 0 housekeeping** (low priority — do before/around the first new migrations to `develop`): drop the redundant `railway.json --rolled-back` boot clause; rename the prod company display name "Empresa Demo" → "AGS Solutions SPA". _RLS-not-enforced-in-prod (the app connects as the `postgres` superuser) is real but deferred to the separate future multi-tenant project — single tenant today, nothing to leak to._

---

## 2. Transversal entities & ownership

The external plan lists shared entities (Cliente, Servicio, Trabajador, Documento, Alerta, Actividad, Usuario). How each maps, who owns it, and the key relationship decisions:

| Entity                            | Owner             | Decision                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trabajador (`employees`)**      | RRHH              | **Own entity with nullable FK to `users`.** Field staff (pilots, cleaners, technicians) exist as fichas without login; only ERP operators link to a `user`. ✅ **Decided.**                                                                                                                              |
| **Cliente / Cuenta (`accounts`)** | Comercial         | **References Finance `counterparties`** (which already hold RUT + tax history) — does not duplicate them. `accounts` carries CRM-specific fields (industry, priority, executive, commercial risk); fiscal identity lives in the linked `counterparty`. _Recommended — to confirm at Comercial planning._ |
| **Servicio (`service_catalog`)**  | Comercial         | Shared catalog. Comercial owns CRUD; Marketing, Operaciones, Finanzas read.                                                                                                                                                                                                                              |
| **Documento**                     | Operations engine | Reused via the doc-control engine, parameterized per entity (employee / client / …).                                                                                                                                                                                                                     |
| **Alerta**                        | Operations engine | Reused via the alert engine; each module registers its own rules.                                                                                                                                                                                                                                        |
| **Actividad**                     | Per module        | CRM activities (Comercial), campaign tasks (Marketing) — module-specific tables, not a shared one.                                                                                                                                                                                                       |
| **Usuario / Roles**               | IAM               | Existing `users` / `memberships` / CASL. New CASL subjects per module.                                                                                                                                                                                                                                   |

---

## 3. Cross-module integration contracts (REAL, not simulated)

The demo **simulated** these. The real build wires them through the existing `domain_events` table + handler pattern — the same mechanism Operations→Finance already uses for auto-commitments.

- **Marketing → Comercial (lead generation):** a campaign generates a lead; the lead persists `sourceCampaignId` (real FK). Campaign attribution / ROI is computed from won opportunities whose lead traces to the campaign.
- **Comercial → RRHH (availability / habilitation):** an opportunity for a service queries RRHH **read-only** — "are there certified, available staff for this service?" — via a dedicated endpoint (the demo's `for-service` panel, made data-driven). Realizes the spec's core rule: _do not commit a sale without habilitated staff._
- **Comercial → Operaciones (handoff on win):** a won opportunity with an accepted quote emits a `domain_event` that creates a project/service in Operaciones (copying client, service, scope, quote). Guarded by the external plan's "regla crítica": no handoff without client / service / accepted quote / commercial owner / payment terms / minimum scope.
- **Comercial → Finanzas (billing on win):** accepted quote → a Finance commitment / billing milestone, via `domain_events` (real — not the demo's simulated badge).
- **RRHH → Operaciones:** procedure acknowledgments (existing OPS feature); assignment of certified staff to assets.
- **RRHH → Finanzas:** salary mass as expense/cost input (aggregate; salary data treated as sensitive).

**Mechanism note:** reuse the existing `domain_events` table and handler pattern. Known V2 gaps in that pattern (handlers only log; manual-retry only) are inherited — flag, do not fix now.

---

## 4. Build order

One module fully to V1 before the next (Excelsia methodology), which also matches the external plan's own sprint sequencing:

1. **RRHH** _(external sprints 1–4)_ — core/ficha/docs → contracts/payroll-base/finiquito-estimate → vacations/leaves → shifts/certs/availability. **First:** next on the roadmap and the demo already exercised its reuse surface.
2. **Comercial** _(sprints 5–8)_ — clients/contacts/leads → pipeline/opportunities/activities → catalog/prices/quotes → contracts/postventa/handoff.
3. **Marketing** _(sprints 9–10)_ — master calendar/campaigns → SEO/attribution.
4. **Cross-cutting** _(sprints 11–12)_ — executive dashboards, reporting, stabilization — folds into Excelsia's existing V2 phase, not a separate effort.

---

## 5. Per-module execution pattern (every module plan follows this)

So all three plans are consistent:

1. **Targeted read-only recon** (CC; the external plan's "Sprint 0" reduced to verification) — confirm the exact reuse surface before building. Open recon questions for **RRHH**:
   - **R1 — Document control:** can the Operations doc-control engine/services be cleanly parameterized for `employees` (a non-asset entity), reusing its expiry / supersession / compliance / approval machinery? Or does it bind too tightly to `operational_assets` — in which case RRHH reuses the _components_ + a thin `employee_documents` table (as the demo did)?
   - **R2 — Alert engine:** can RRHH register its rules (contract-expiring, cert-expiring, doc-missing) in the Operations alert engine, or does it need its own thin alert path?
   - **R3 — `employees` ↔ `users`:** confirm the nullable-FK shape against the real `users`/`memberships` schema; how do CASL abilities resolve for an employee who _is_ a user vs. one who is not.
2. **Data model:** every table with RLS + audit trigger + GRANT; enums (ASCII members, display-label mapped); relations.
3. **CASL subjects** + which role can do what on each.
4. **Sprints → tickets** (`HR-001`..`HR-NNN`) with acceptance criteria, in the serial human-gated flow.
5. **Cross-module wiring** per §3 (real, via `domain_events`).
6. **Chilean domain** certified where it matters (RRHH: payroll / finiquito / vacations with exact rates, caps, and brackets — **not** the demo's "directional").
7. **Manual** at module V1 close (same 17-chapter standard as Finanzas/Operaciones).

**Visual reference:** the frozen `demo/stakeholder-preview` branch is the look-and-feel target. The demo proved the reuse works; the real build goes **deeper** (real RLS/audit/CASL, real cross-module wiring, certified domain logic) behind the same visual surface.

---

## 6. What every module defers to V2

Aligned with the external plan's own "lo que NO recomiendo construir al inicio" and Excelsia's "all modules to V1, then V2":

- Full Chilean payroll engine + Previred integration (RRHH stays MVP: gross/net registry, liquidación PDF upload, cost estimate, parametrizable rates).
- Advanced e-signature (FirmaGob).
- Email-marketing automation (Mailchimp-style); direct Google/LinkedIn Ads integration; SEO crawler.
- AI forecast / lead scoring (no data yet).
- Full worker self-service portal; native mobile app.
- Complex commissions.

These are V2+, after all three modules reach V1.

---

_Next: the RRHH module plan, built on this baseline — opening with the §5 targeted recon (R1–R3), then the data model, CASL subjects, and the `HR-001`+ sprint/ticket breakdown._
