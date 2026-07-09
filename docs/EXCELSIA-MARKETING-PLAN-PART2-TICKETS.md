# Excelsia — Marketing Module: Plan Part 2 — Ticket Breakdown

**Status:** Validated by founder — 2026-07-09. Execute strictly in order, one ticket at a time.
**References:** `docs/EXCELSIA-MARKETING-PLAN-PART1-DATAMODEL.md` (data model & decisions), `docs/MARKETING-RECON.md`, `CLAUDE.md`.

## Flow rules (unchanged from RRHH/Comercial)

- Serial execution, one ticket per CC run, one conventional commit per ticket (English).
- Every CC prompt begins with: _"Read the CLAUDE.md file carefully before doing anything. Do not run any git commands."_
- Founder human-gates every ticket: approves plan → runs CC → validates locally → commits. Director reviews CC reports against real code before issuing the commit block.
- Tickets containing a migration: `npx prisma migrate deploy --schema=apps/api/prisma/schema` before commit.
- Platform invariants apply to every ticket (RLS + audit + GRANT in same hand-authored migration; `@CheckPolicies` on every endpoint; writes via `executeWithRls`; ASCII enum members; current design tokens).

---

## MKT-001 — Module shell: Nest module, CASL floor, routes, module cards

Backend: `marketing` aggregator module (COM-001 scaffold) + guarded ping; CASL subjects `Campaign`, `MarketingExpense`, `PresenceSnapshot` added to the default-deny floor and re-granted per the Part 1 matrix; `GET /marketing/permissions` endpoint (Comercial pattern).
Frontend: `/marketing` layout + sidebar (Campañas · Calendario · Presencia digital) with placeholder pages; in `/modulos` repurpose the "calendario" card as **Marketing** (`href: '/marketing'`, `active: false` — gated until MKT-010) and add the new gated card **"Calendario de Actividades"** (`href: null, active: false`).
No schema changes, no migration.

**AC:** ping 200 for MANAGER / 403 for VIEWER; permissions endpoint matches the matrix (MANAGER full, ACCOUNTANT read-only Campaign+MarketingExpense, VIEWER all false); floor extended without touching existing subjects; `/modulos` shows both new cards and no plain "Calendario" card remains; placeholder pages reachable by direct URL.

## MKT-002 — Campaigns: migration + CRUD backend + status machine

Hand-authored migration: `CampaignChannel` + `CampaignStatus` enums, `campaigns` table exactly per Part 1 §2.1, with RLS policy + audit trigger + GRANT to `app_user`. Service/controller/DTOs: create (draft, dates optional), update, list (filters: status, channel), detail; canonical `PATCH /:id/status` implementing the machine (free among BORRADOR/ACTIVA/PAUSADA; FINALIZADA/CANCELADA semi-terminal; explicit reopen → ACTIVA; **activation requires `startDate`**); `DELETE` only for pristine BORRADOR (no expenses, no attributed accounts), else 409 with a clear message. All writes via `executeWithRls`; every endpoint `@CheckPolicies`.

**AC:** transition matrix tested incl. rejected jumps (BORRADOR→FINALIZADA) and activation-without-startDate → 400; ACCOUNTANT gets 200 on reads and 403 on all writes; RLS verified (company B cannot read/write company A's campaign); audit rows present for insert/update; delete policy enforced.

## MKT-003 — Campaigns: frontend (list, form, detail, status actions)

`/marketing/campanas`: list with status/channel filters and status badges; create/edit form (draft needs no dates; channel select with Spanish labels); detail page (Datos section) with status action buttons (Activar / Pausar / Finalizar / Cancelar / Reabrir) driven by `useCanWrite` + backend validation surfaced. ACCOUNTANT sees everything read-only (budget included). Design tokens identical to Comercial.

**AC:** full lifecycle operable from the UI; activation without startDate shows the backend error cleanly; ACCOUNTANT sees no write affordances; empty states present.

## MKT-004 — Campaign calendar (view extraction + page)

Per recon M3: extract/parameterize the Operations month-grid views (MonthView etc.) into a shared, props-driven component WITHOUT changing Operations behavior (explicit regression check). New feed `GET /marketing/campaigns/calendar?month=` returning ranged events from `startDate`/`endDate` (status-colored). Page `/marketing/calendario`; click-through to campaign detail.

**AC:** Operations calendar renders byte-identical behavior (manual regression pass listed in report); campaign spanning month boundaries renders on both months; gated statuses legend; UTC date arithmetic (HR-004b) — no off-by-one at month edges.

## MKT-005 — Expenses: migration + backend + frontend + derived badges

Migration: `marketing_expenses` per Part 1 §2.2 (+ RLS/audit/GRANT). Nested CRUD under campaign (`/marketing/campaigns/:id/expenses`). Campaign detail gains **Gastos** section: table + form (amount caption: "monto neto, sin IVA"), derived `spent = Σ amounts`, budget-vs-spent bar. Derived badges in list + detail: **"Sobre presupuesto"**, **"Termina en 7 días"** (Part 1 §6). No Finance writes of any kind.

**AC:** spent/badges are computed live (no stored columns — verify schema); CASCADE on campaign delete verified for pristine-draft path; ACCOUNTANT reads expenses, cannot write; RLS + audit verified on the new table.

## MKT-006 — Attribution: FK micro-migration + lookup expose + Comercial selector

Migration on `accounts`: orphan pre-check, `ADD CONSTRAINT` FK `sourceCampaignId → campaigns(id) ON DELETE SET NULL`, `CREATE INDEX`. Marketing exposes `CampaignLookupService` (read-only `{id, name, status}`); Comercial account form gains "Campaña de origen" select consuming it via DI (EXPOSE/CONSUME — Comercial never queries `campaigns` directly). Service-level rejection of cross-company campaign ids (FK doesn't check tenant). Account detail shows the campaign name.

**AC:** setting/clearing attribution works from the account form; cross-company id → 4xx; deleting is impossible for campaigns with accounts (pristine rule) and `ON DELETE SET NULL` documented as the safety net; index exists; Comercial writers edit, ACCOUNTANT sees read-only.

## MKT-007 — ROI: Comercial aggregate expose + Retorno section

Comercial exposes `CampaignAttributionReadService.getCampaignReturn(companyId, campaignId)` → `{ accountsCount, wonCount, wonNetAmount }` with an explicit field map (COM-012 style): counts accounts by `sourceCampaignId`, opportunities **currently** `GANADA`, sums `netAmount` of their `ACEPTADA` quotes. Marketing campaign detail gains **Retorno** section: cuentas generadas · negocios ganados · retorno neto vs gasto (from MKT-005) · simple ROI figure. Live computation, no rollups.

**AC:** reopened GANADA drops out of the numbers; campaign with zero attribution shows a clean empty state; amounts formatted CLP; ANALYST/VIEWER never reach this screen (floored), ACCOUNTANT sees it read-only.

## MKT-008 — Presence: migration + backend

Migration: `presence_snapshots` per Part 1 §2.3 (+ RLS/audit/GRANT, `@@unique([companyId, period])`). Upsert endpoint (service normalizes `period` to day 01 UTC; second submit for the same month updates, never duplicates) + range list endpoint for charting. `@CheckPolicies` per matrix (MANAGER+ only; ACCOUNTANT has no grant here).

**AC:** upsert idempotence proven (two submits, one row); period normalization tested with mid-month input; ACCOUNTANT → 403 on read and write; RLS + audit verified.

## MKT-009 — Presence: dashboard frontend

`/marketing/presencia` per the approved mockup: latest-month KPI cards with delta vs previous month, 6–12 month evolution chart per metric, "Registrar datos del mes" form (month picker + three nullable numeric fields + notes) with the manual-entry caption. Nullable metrics render as "—", deltas only when both months have data.

**AC:** chart handles gaps (missing months) without interpolation lies; form pre-fills when the month already has a snapshot (upsert UX); write affordances gated by `useCanWrite`.

## MKT-010 — Module close: un-gate + docs

Flip the Marketing card to `active: true` (COM-015 analog). Update `CLAUDE.md`: Marketing V1 summary block (same format as RRHH/Comercial blocks) + refresh "Próximos pasos". Quick QA pass: permissions matrix spot-check per role, one end-to-end walkthrough (create campaign → activate → expense → attribute account → win deal → Retorno shows it → presence snapshot).

**AC:** card live; CLAUDE.md updated; walkthrough documented in the report with results per step.

---

## V2 backlog seeds (record only — do not build)

Campaign sub-tasks · expense↔Movement reconciliation link · marketing notifications via own thin alert path · ads/analytics API integrations + SEO crawler · additional presence metrics (e.g. Instagram) · Calendario de Actividades module (own scope doc).
