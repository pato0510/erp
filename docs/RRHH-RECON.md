# RRHH Module — Sprint 0 Recon (read-only)

**Date:** 2026-06-23
**Purpose:** Ground the RRHH V1 data model + tickets in facts. For each of the three systems, decide: can RRHH **reuse the engine** cleanly, or must it **reuse only the components**?
**Method:** read-only inspection of the real `develop` codebase (Operations engine + platform conventions). Every finding cites `file:line`. Nothing was modified; this file is the only artifact and is **not committed**.

> Context confirmed during recon: there is **no `employees` model yet** (`operations.prisma` has none; RRHH is "siguiente prioridad" in CLAUDE.md). The frontend has **no `comercial`/demo screens, no `#4ECDC4`/`Syne`, no `formatRUT`** — i.e. this is the clean production code, the correct basis for the _real_ RRHH plan.

---

## Executive summary — three verdicts

| Q      | System                            | Verdict                                                  | One-liner                                                                                                                                                                                                                                                                                                                                                |
| ------ | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | Document-control engine           | **REUSE COMPONENTS + COPY-ADAPT the service logic**      | Persistence is hard-bound to `operational_assets` (non-null `assetId` FK + CASCADE + single-target CHECK + ~30 hard-codes + asset-blocking). Reuse `StorageService` + the two frontend gauges/badges + the proven algorithms; build thin `employee_documents` / `employee_document_requirements` tables. **Do not** generalize the in-production engine. |
| **R2** | Alert engine                      | **RRHH runs its own thin reminder cron + generic inbox** | The engine enumerates `operational_assets`+`permits` by hard-coded queries; `AlertRule` is bound to `OperationalDocumentType` and rejects unknown ids. Reuse only `AlertSeverity`, the `user_notifications` inbox, `NotificationService.createGeneric()`, and the cron _pattern_.                                                                        |
| **R3** | Platform (users/CASL/conventions) | **REUSE THE ENGINE WHOLESALE**                           | `RlsService`, the generic `audit_trigger_function`, the CASL factory + `PoliciesGuard`, and the per-table RLS+GRANT+audit boilerplate are all generic. `employees.userId` = nullable hard relation (`onDelete: SetNull`).                                                                                                                                |

---

## R1 — Document Control Engine

### Evidence

- **Hard-bound owner.** `DocumentRecord.assetId` is **non-nullable** with `onDelete: Cascade` → `operations.prisma:234` (`assetId String @db.Uuid`), `:259` (`asset OperationalAsset @relation(... onDelete: Cascade)`); DB FK at `20260428170000_add_document_records/migration.sql:52`.
- **No polymorphic owner anywhere** — grep for `ownerType|ownerId|entityType|employeeId|polymorphic` in `operations.prisma` → **0 matches**.
- **Requirements matrix also asset-bound** with a DB CHECK forcing exactly one target: `operations.prisma:275-277` (`assetTypeId? / assetSubtypeId? / assetId?`); CHECK at `20260427130000:46` (`...= 1`). Specificity resolver `asset(3)>subtype(2)>type(1)` at `document-requirements.service.ts:155`.

### Machinery inventory (generic vs asset-specific)

| Machinery                                            | Verdict                                                                           | Evidence                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StorageService` (MinIO + DB-blob fallback)          | **GENERIC** — reuse as-is                                                         | `storage.service.ts:32` `uploadFile(bucket,key,buffer,mimetype)` — no asset param                                                                           |
| MIME/size validation (allow-list, 10MB)              | **GENERIC**                                                                       | `document-records.service.ts:517` `validateFile`, consts `:29/:35/:46`                                                                                      |
| Expiry from `defaultValidityDays`                    | **GENERIC** (keyed on documentType)                                               | `document-records.service.ts:654-656`                                                                                                                       |
| Immutable supersession/versioning                    | generic shape, **writes `assetId`**                                               | `document-records.service.ts:720` `supersedeDocument`, `:791` `assetId: old.assetId`, nextVersion `:587-596`                                                |
| Approval workflow (uploader≠approver)                | generic, **but calls asset-blocking**                                             | `document-records.service.ts:1131` (uploader≠approver) → couples at `:1180` `blockingService.processBlocking(...assetId)` + `:1198` commitment auto-fulfill |
| Compliance engine                                    | **ASSET-SPECIFIC** (iterates `operationalAsset`, merges byType/bySubtype/byAsset) | `document-records.service.ts:284`, `:358`, `:383-387`                                                                                                       |
| `OperationalDocumentType` catalog                    | **owner-agnostic** (no asset FK)                                                  | `operations.prisma:190-218`                                                                                                                                 |
| `DocumentRecordStatus` enum                          | **GENERIC** — reuse                                                               | `operations.prisma:221`                                                                                                                                     |
| CASL `DocumentRecordSubject` (own actions)           | **GENERIC pattern** — add an Employee one                                         | `casl-ability.factory.ts:86`                                                                                                                                |
| `DocumentStatusBadge` / `ComplianceGauge` (frontend) | **GENERIC** — reuse                                                               | `DocumentStatusBadge.tsx:99`, `ComplianceGauge.tsx:19`                                                                                                      |

### VERDICT R1 → **Reuse components + copy-adapt the service logic.** Do NOT parameterize the live engine.

In-place generalization (nullable `ownerType/ownerId`) would touch the non-null FK + CASCADE, the single-target CHECK, ~30 `assetId` hard-codes, the asset-blocking coupling, and the alerts/exceptions subsystem — too invasive and risky to the in-production Operations module (`risks` below). The clean path:

- **Reuse verbatim:** `StorageService`, `RlsService`, `DocumentStatusBadge`, `ComplianceGauge`, the `DocumentRecordStatus` enum.
- **Copy-adapt** (`assetId`→`employeeId`, drop the asset-blocking call): `validateFile/storeFile/deriveStatus/nextVersion/create/supersede/approve/reject/resubmit`, and rewrite `getCompliance` for `employee>position>department`; `resolveRequirementsForAsset`→`resolveRequirementsForEmployee`.
- **New thin tables** (`rrhh.prisma`): `employee_documents` (mirror of `DocumentRecord`, `employeeId` FK) + `employee_document_requirements` (department/position/employee three-level matrix with the same single-target CHECK). Models drafted in the checklist section below.

---

## R2 — Alert Engine

### Evidence

- **Rule scope is `OperationalDocumentType`-only.** `AlertRule.documentTypeId` is the single domain FK (`operations.prisma:305,321`); `AlertRulesService.create/update` reject any `documentTypeId` not in `operationalDocumentType` (`alert-rules.service.ts:39-46`) → RRHH **cannot register a rule** for an employee cert via the existing API.
- **`AlertInstance` owner FKs are a fixed enumeration** of Operations entities (`assetId, documentTypeId, documentRecordId, permitTypeId, permitId, locationId`) — `operations.prisma:357-368`. No generic owner.
- **The daily engine hard-codes its sources:** `alert-engine.service.ts:79` loads `operationalAsset`, `:291` loads permits, `:302` runs `AssetBlockingService.processCompanyBlocking`. **No registry/interface/event** extension point.
- **The DB would accept rows** (RLS policy is companyId-only: `20260428190000_add_alert_instances/migration.sql:65-66`) — the binding is in application code, not the schema.
- **Reusable generics:** `AlertSeverity {INFO,WARNING,CRITICAL,BLOCKING}` (`alerts.prisma:12-17`, already cross-module); `user_notifications` is a **generic per-user inbox** (only optional `alertInstanceId`; scope is companyId+userId — `operations.prisma:472-496`); `NotificationService.createGeneric()` is the public push API (`notification.service.ts:152`), with `resolveRoleUsers()` role→userId fan-out (`:317`). The BullMQ cron pattern to clone is the procedure-ack reminder at `alert-engine.processor.ts:128`.

### VERDICT R2 → **RRHH runs its own thin reminder cron, pushing to the generic inbox.**

Build an `RrhhReminderProcessor` (clone the repeatable-cron pattern) that computes RRHH expiry/missing/pending state and calls `NotificationService.createGeneric(userIds, sourceType, title, severity, linkPath)`. Reuse `AlertSeverity` + (optionally) `AlertTriggerType/AlertInstanceStatus` as **vocabulary** for an RRHH-owned alert table — but do **not** route through `AlertEngineService.processCompany()` (it would also fire the asset-blocking sweep, a meaningless side effect for HR). Note: "evaluation-pending" has no analog in `AlertTriggerType` (only EXPIRING_SOON/EXPIRED/MISSING/BLOCKING — `operations.prisma:335-340`), reinforcing an RRHH-owned model.

---

## R3 — Platform: users↔employees, CASL, conventions

### (a) `employees.userId` FK shape

- `User.id` = `String @id @default(uuid()) @db.Uuid`; only unique is `email` (`iam.prisma:11-12`). `Membership` = role-per-company, `@@unique([userId, companyId])` (`iam.prisma:40`); `UserRole {SUPER_ADMIN,ADMIN,MANAGER,ACCOUNTANT,ANALYST,VIEWER}` (`iam.prisma:1-8`) — **one shared role taxonomy, no RRHH-specific roles**.
- A person who is **both** employee and user = one `Employee` row with a **nullable** `userId` → `users.id`. **Recommended: hard relation with `onDelete: SetNull`** (removing a login user nulls the link, never deletes the ficha). Two precedents exist and the codebase is _inconsistent_: decoupled raw column `operations.prisma:114` (`assignedToUserId String? @db.Uuid`, no `@relation`) vs hard relation `operations.prisma:489` (but non-nullable, `onDelete: Cascade`). Pick hard + nullable + SetNull (see checklist).

### (b) CASL — minimal RRHH subject addition (4 edit sites)

Subjects union `casl-ability.factory.ts:5-39`; subject classes `:41-147` (e.g. `:86` `DocumentRecordSubject`); export block `:197-229`; role rules in `defineAbilityFor(role)` switch `:233-392` (ADMIN/SUPER_ADMIN `can('manage','all')`; MANAGER `can('read','all')` + explicit grants). `PoliciesGuard` resolves role from `membership.findUnique({userId_companyId})` (`policies.guard.ts:33-40`). Exact additions in the checklist below.

### (c) New-table checklist — see the copy-paste block.

> **Cross-reference (corroborates the prod verification of 2026-06-23):** recon found `FORCE ROW LEVEL SECURITY` on **0 tables** and isolation depends on `app_user` not holding BYPASSRLS + every write going through `RlsService`. The production DB check confirmed prod actually connects as the **`postgres` superuser** — so RLS provides **no** isolation in prod today. **Implication for RRHH:** do not treat RLS as the safety net; every RRHH endpoint MUST carry `@CheckPolicies` (the guard is fail-open without it — risk below), and every RRHH table must still ship the policy + audit trigger for when the role is eventually fixed.

---

## R3 (d) — Reusable frontend building blocks + tokens

**GENERIC — import directly:**

- `KpiCard` → `components/operations/dashboard/KpiCard.tsx` → `{ label, value, subtitle?, icon?:LucideIcon, valueColor?, href? }`
- `ComplianceGauge` → `components/operations/ComplianceGauge.tsx` → `{ percentage(0-100), size?=180, subtitle?, caption? }` (green≥90 `#15803d` / yellow≥70 `#a16207` / red `#b91c1c`)
- `apiClient` → `lib/api.ts` → `get/post/patch/delete/uploadFile/postBlob/fetchBlob`; auto `x-company-id` (from `localStorage.selectedCompanyId`) + `credentials:'include'`
- formatters → `lib/formatters.ts` → `formatCLP`, `formatDate` (es-CL dd/mm/yyyy), `formatRelativeDate` — **`formatRUT` MISSING, must add** (snippet in checklist)
- design tokens → `styles/tokens.css:7,40-41,36` → `--color-accent #2563eb`, `--font-display/--font-body 'Outfit'`, active `#60a5fa`. **No `#4ECDC4`, no `Syne`** anywhere (grep = 0) — keep it that way.

**CLONE (operations-coupled — copy markup, swap enum/endpoint):**

- `DocumentStatusBadge` (`DocumentStatusBadge.tsx:7-17`) — 10 status values: `VIGENTE/POR_VENCER/VENCIDO/BORRADOR/PENDIENTE_REVISION/APROBADO/RECHAZADO/REEMPLAZADO/ARCHIVADO/FALTANTE`. _(Visually generic; coupling is only the enum — safe to import for an HR doc badge if RRHH reuses the same status vocabulary.)_
- `DocumentUploadModal` (`DocumentUploadModal.tsx:45-57,190`) — posts `/api/operations/documents`; clone → `/api/rrhh/...`
- `AssetFormModal` (`AssetFormModal.tsx:85-93`) — the canonical modal/form scaffold (Section/Grid/Field)
- LIST/TABLE pattern → `(dashboard)/movimientos/page.tsx:460-493` (card>table, gray-50 thead, divide-y, Chevron pagination)
- TABBED ficha → `(dashboard)/operaciones/configuracion/page.tsx:141-164` (`TABS` + `searchParams('tab')` + `router.replace`, **wrap in `<Suspense>`**). _(Note: `equipos/[id]` ficha is a CARD-GRID, not tabs — `equipos/[id]/page.tsx:917`.)_
- MONTH-GRID → `components/operations/calendar/MonthView.tsx:54,83` — visual reference only; **clone, do not import** (it's the operational calendar).

---

## ✅ New-table checklist (copy-paste, per RRHH migration)

**Real example (verbatim, `document_records`) → template.** Source: `20260428170000_add_document_records/migration.sql:57-68` (identical in `...add_alert_instances:63-74`). Requires `<table>` to carry `companyId UUID NOT NULL`.

```sql
-- 1. RLS
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <name>_isolation ON <table>
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- 2. GRANT (global GRANT+DEFAULT PRIVILEGES already cover it, but every migration re-grants — keep the convention)
GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_user;

-- 3. Audit trigger (reuse the platform function — never redefine it)
CREATE TRIGGER audit_<table>
  AFTER INSERT OR UPDATE OR DELETE ON <table>
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
-- audit_trigger_function defined in 20260417172748_add_audit_triggers/migration.sql:8
-- OPTIONAL defense-in-depth (deviates from current convention, flag in PR):
--   ALTER TABLE <table> FORCE ROW LEVEL SECURITY;
```

**`employees.userId` (Prisma):**

```prisma
// rrhh.prisma, model Employee:
companyId String  @db.Uuid          // REQUIRED for the RLS policy above
userId    String? @db.Uuid          // nullable: field staff have no login
user      User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
@@index([companyId, userId])
// iam.prisma, model User — add the back-relation:
//   employee Employee?
```

**CASL (4 sites in `casl-ability.factory.ts`):** add `| typeof EmployeeSubject` to the union (`:5-39`); declare `class EmployeeSubject { static readonly modelName = 'Employee' as const }` (~`:147`); add `EmployeeSubject,` to the export block (`:197-229`); grant in `defineAbilityFor` (e.g. MANAGER ~`:245`: `can(['create','update'], EmployeeSubject)`). Controller: `@CheckPolicies((a)=>a.can('create', EmployeeSubject))`.

**`employee_documents` model (R1 thin table)** — mirror of `DocumentRecord` with `employeeId` FK, reusing `DocumentRecordStatus`; plus `employee_document_requirements` with `departmentId?/positionId?/employeeId?` + the single-target CHECK and a `req.employeeId?3:req.positionId?2:1` resolver. (Full draft in the recon transcript; key swap = `assetId→employeeId`, drop `processBlocking`/`autoFulfill`.)

**`formatRUT` (add to `lib/formatters.ts` before RRHH):**

```ts
export function formatRUT(rut: string): string {
  const c = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (c.length < 2) return rut;
  return `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${c.slice(-1)}`;
}
```

---

## ⚠️ Risks & discrepancies found (report-only)

| Sev         | Finding                                                                                                                                                                                                                                                                                     | Evidence                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **warning** | **`PoliciesGuard` is FAIL-OPEN** — a route with no `@CheckPolicies` returns `true` (allowed). Every RRHH endpoint MUST declare `@CheckPolicies`, or it's unauthenticated-authorized.                                                                                                        | `policies.guard.ts:17-20`                                                         |
| **warning** | **5 tables have RLS but NO audit trigger:** `alert_thresholds, asset_subtypes, bank_sync_runs, external_bank_movements, tax_sync_runs` — the invariant has been missed before. RRHH must attach the audit trigger to **every** table.                                                       | comm of ENABLE-RLS vs CREATE-TRIGGER across migrations                            |
| **warning** | **`FORCE ROW LEVEL SECURITY` used on 0 tables**; combined with the prod check (app connects as `postgres` superuser), **RLS isolates nothing in prod today**. RRHH security must lean on `@CheckPolicies` + `executeWithRls`, and the team should fix the runtime role before multi-tenant. | grep `FORCE ROW LEVEL SECURITY` → 0; prod `pg_roles` (PROD-VERIFICATION-FASE0.md) |
| **warning** | `formatRUT` does not exist; RRHH is RUT-centric and will assume it does → add it first.                                                                                                                                                                                                     | `lib/formatters.ts:1-29`                                                          |
| **warning** | Importing `DocumentUploadModal`/`AssetFormModal`/`MonthView` directly hard-codes `/api/operations/*` + operations enums → **clone, don't import** these.                                                                                                                                    | `DocumentUploadModal.tsx:98-99,190`                                               |
| **info**    | `RlsService` uses `$executeRawUnsafe` with string-interpolated `companyId/userId` (trusted UUIDs, but unparameterized).                                                                                                                                                                     | `rls.service.ts:23-30`                                                            |
| **info**    | Codebase inconsistent on user-FK style (decoupled raw col vs hard relation) — pick one (hard + SetNull) for RRHH.                                                                                                                                                                           | `operations.prisma:114` vs `:489`                                                 |
| **info**    | No shared generic `Modal`/`DataTable` primitive — scaffolds are duplicated inline per feature; RRHH will duplicate too (acceptable, but a candidate for a shared lib).                                                                                                                      | `AssetFormModal.tsx:644-688` ≈ `DocumentUploadModal.tsx:604-651`                  |

## Open questions (uncertain — confirm during RRHH design)

- **Share `OperationalDocumentType` catalog or make `employee_document_types`?** The model is owner-agnostic, but its `DocumentCategory` enum may be asset-flavored (SOAP/REVTEC vehicle packs). Inspect the `DocumentCategory` enum before deciding (`operations.prisma:195`). _Recommendation: a separate `employee_document_types` to avoid HR/asset doc-type bleed._
- **Does RRHH need "blocking" semantics?** (e.g. employee blocked from assignment when a critical doc/cert is missing). The asset-blocking logic is asset-only; an RRHH equivalent would be net-new.
- **`employees` model doesn't exist yet** — the `employeeId` FK targets in the R1 thin tables assume the RRHH `Employee` table this plan will create; confirm its PK type (`String @db.Uuid`) matches.

_Read-only recon — nothing modified; `docs/RRHH-RECON.md` is the only artifact, left uncommitted for the owner._
