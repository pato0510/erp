# Security Audit — Operations Module

**Date:** 2026-04-29
**Reviewer:** Claude Code (OPS-037 — module closure)
**Scope:** every controller under `apps/api/src/modules/operations/`

---

## Summary

| Layer              | Posture                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication** | JWT in HttpOnly cookie, validated by `JwtAuthGuard` per controller. Public exception is documented below.                                                                                                                                             |
| **Authorization**  | CASL via `PoliciesGuard` + `@CheckPolicies` on every write endpoint. Read endpoints either gate explicitly or document why they're open to all authenticated roles.                                                                                   |
| **Tenancy**        | All write paths run inside `RlsService.executeWithRls(companyId, userId, …)`, which sets `SET LOCAL rls.company_id`. Read paths add `WHERE companyId = ?` either via Prisma filter or, for materialized views (no RLS), via explicit query parameter. |
| **Rate limiting**  | Global `ThrottlerModule` (100 req/min/IP). Public QR endpoint tightened to 30 req/min.                                                                                                                                                                |
| **Audit**          | Two layers: (1) PostgreSQL row-level triggers writing to `audit_logs` for every operations table; (2) packaged compliance evidence with SHA-256 manifests via OPS-036.                                                                                |

---

## Public endpoints (no auth required)

### `GET /api/operations/public/asset/:qrToken`

- **Why public:** scanning QR stickers from physical assets in the field. The token printed on a sticker IS the bearer credential; if you have it, you are at the asset.
- **What it returns:** asset code/name/status, status label + color, type/subtype/location names, document compliance with derived per-doc status (VIGENTE/POR_VENCER/VENCIDO/FALTANTE) — **no document downloads, no internal IDs, no financial info, no permit details, no scan history of other assets**.
- **Mitigations:**
  - `@Throttle({ default: { limit: 30, ttl: 60_000 } })` — 30 req/min/IP. Scrapers get 429.
  - Token is 32-char base64url (192 bits of entropy). Brute force is computationally infeasible.
  - Token rotation (`POST /assets/:id/qr/regenerate`, ADMIN-only) invalidates leaked stickers.
  - The asset's `companyId` and full audit trail stay server-side; the public response never includes them.
  - Each scan increments `qrScanCount` so anomalous activity (e.g., 1000 scans in an hour) is observable in the AvanzadoTab UI.

There are no other public endpoints in the operations module.

---

## Endpoints with `@CheckPolicies` (write operations)

Comprehensive list — every POST / PATCH / DELETE in the module:

### Assets (`/operations/assets`)

| Method | Path                        | Policy                                               |
| ------ | --------------------------- | ---------------------------------------------------- |
| POST   | `/assets`                   | `create` on `OperationalAssetSubject`                |
| PATCH  | `/assets/:id`               | `update` on `OperationalAssetSubject`                |
| DELETE | `/assets/:id`               | `delete` on `OperationalAssetSubject`                |
| POST   | `/assets/:id/photo`         | `update` on `OperationalAssetSubject`                |
| DELETE | `/assets/:id/photo`         | `update` on `OperationalAssetSubject`                |
| POST   | `/assets/:id/status`        | `update` on `OperationalAssetSubject`                |
| POST   | `/assets/:id/force-unblock` | `force-unblock` on `OperationalAssetSubject` (ADMIN) |
| POST   | `/assets/import`            | `create` on `OperationalAssetSubject`                |
| POST   | `/assets/:id/qr`            | `update` on `OperationalAssetSubject` (OPS-035)      |
| POST   | `/assets/:id/qr/regenerate` | `manage` on `OperationalAssetSubject` (ADMIN)        |
| POST   | `/assets/qr/bulk-generate`  | `manage` on `OperationalAssetSubject` (ADMIN)        |

### Asset types / subtypes / locations / document types / requirements

All CRUD endpoints gated by their respective subject (`AssetTypeSubject`, `LocationSubject`, `DocumentTypeSubject`, `DocumentRequirementSubject`) with `create`/`update`/`delete` actions.

### Document control

| Method | Path                       | Policy                                      |
| ------ | -------------------------- | ------------------------------------------- |
| POST   | `/documents`               | `create` on `DocumentRecordSubject`         |
| PATCH  | `/documents/:id`           | `update` on `DocumentRecordSubject`         |
| DELETE | `/documents/:id`           | `delete` on `DocumentRecordSubject` (ADMIN) |
| POST   | `/documents/:id/approve`   | `approve` on `DocumentRecordSubject`        |
| POST   | `/documents/:id/reject`    | `reject` on `DocumentRecordSubject`         |
| POST   | `/documents/:id/resubmit`  | `resubmit` on `DocumentRecordSubject`       |
| POST   | `/documents/:id/supersede` | `supersede` on `DocumentRecordSubject`      |
| POST   | `/documents/:id/archive`   | `update` on `DocumentRecordSubject`         |

### Permits / work permits / approvals

Every state-changing endpoint gated. `WorkPermitSubject` has the richest action set: `create`, `update`, `authorize`, `reject`, `start`, `suspend`, `resume`, `close`, `cancel`. `PermitApprovalSubject` covers `read`, `approve`, `reject`, `skip` (ADMIN-only).

### Procedures

`create`, `update`, `review`, `publish`, `deprecate` (ADMIN) on `ProcedureSubject`. `acknowledge` on `ProcedureAcknowledgmentSubject` (any authenticated user, scoped server-side to their own user id).

### Exceptions

`create` on `AssetExceptionSubject` for any role. `approve`, `reject`, `revoke` only via `manage all` (ADMIN).

### Alert rules / settings

`create`, `update`, `delete` on `AlertRuleSubject`. `update` on `AlertSettingsSubject`. Recalculation trigger gated by `manage`.

### Commitment templates (OPS-033)

`manage` on `CommitmentTemplateSubject` (MANAGER + ADMIN).

### Domain events (OPS-032)

`manage` on `DomainEventSubject` for retry/test (ADMIN). `read` for audit listing.

### Operations Dashboard MV refresh (OPS-034)

`manage` on `OperationsDashboardSubject` for `POST /dashboard/refresh-views` (ADMIN-only). **CORRECTION (HARDEN-001, 2026-08-03):** the nine dashboard read endpoints are NO LONGER open — they now carry `@CheckPolicies((a) => a.can('read', OperationsDashboardSubject))`, so `PoliciesGuard` runs the membership check. Read stays granted to every role by CASL (VIEWER via an explicit grant).

### Audit packages (OPS-036)

| Method | Path                      | Policy                                              |
| ------ | ------------------------- | --------------------------------------------------- |
| POST   | `/audit/generate-package` | `create` on `AuditPackageSubject` (MANAGER + ADMIN) |
| POST   | `/audit/validate-package` | `read` on `AuditPackageSubject`                     |

---

## Endpoints WITHOUT `@CheckPolicies`

> **CORRECTION (HARDEN-000/001/002, 2026-08-03/04).** The original claim here —
> "intentionally open to every authenticated user in the company; RLS scopes the
> data to their company" — was **false on two counts** and has been fixed:
> (1) the dashboard reads (HARDEN-001) and the calendar reads (HARDEN-002) are now
> GATED, so `PoliciesGuard` performs the membership check; (2) **RLS does not scope
> the data at runtime** — the DB connection role bypasses RLS (BYPASSRLS/superuser)
> and RLS is `ENABLE`-only, not `FORCE` (see `docs/HARDENING-RECON.md`). RLS is not
> a backstop; `@CheckPolicies` is the tenant boundary. The remaining ungated
> handlers (health, notifications, public-QR) are inventoried in
> `docs/MATRIZ-DE-PERMISOS.md` §4.

### Dashboard reads (`/operations/dashboard/*`) — GATED since HARDEN-001

`GET /overview`, `/action-items`, `/upcoming-events`, `/top-assets-at-risk`, `/recent-activity`, `/my-tasks`, `/asset-distribution`, `/compliance-by-category`, `/freshness` now each carry `@CheckPolicies((a) => a.can('read', OperationsDashboardSubject))`. They still render for VIEWER through ADMIN (read granted to every role), but a caller with no membership in the target company gets **403** instead of that company's data.

### Calendar reads (`/operations/calendar/*`) — GATED since HARDEN-002 (2026-08-04)

`GET /events`, `/events/by-date`, `/month-summary`, `/export` now carry `@CheckPolicies((a) => a.can('read', OperationsCalendarSubject))`, and `PoliciesGuard` was added to the controller's `@UseGuards` (it was `JwtAuthGuard`-only before, so a policy alone would not have run). Before HARDEN-002 these were ungated and company-scoped via the raw `x-company-id` header — `GET /export` in particular streamed another company's calendar as a downloadable `.ics` to any authenticated non-member. Read stays granted to every role (VIEWER via an explicit grant); a non-member now gets **403**.

### Health (`/operations/health`, `/operations/health/crons`)

JWT only, no CASL. **Justification:** lets monitoring hit the endpoint with a single service account; the body discloses subsystem status (db latency, cron count, MV freshness) but no business data.

### Listing / detail GETs

Most list endpoints (`GET /assets`, `GET /documents`, `GET /alerts/instances`, etc.) require only `read` on their subject — granted to every role via `can('read', 'all')` in the CASL factory. Effectively open to every authenticated user, but explicitly checked.

### Public-asset authenticated variant

`GET /operations/public/asset/:qrToken/authenticated` requires JWT and matches the visitor's company against the asset's. Returns extended info (downloadable docs, full alert list). No CASL — JWT + company-match in service is the gate.

---

## Materialized views and RLS

**PostgreSQL does not apply RLS to materialized views.** The four views introduced in OPS-034 are filtered by `companyId` in the application layer:

- `mv_asset_compliance_snapshot`
- `mv_company_compliance_summary`
- `mv_compliance_by_category`
- `mv_asset_status_distribution`

Every read in `operations-dashboard.service.ts` passes the caller's `companyId` as a query parameter (`WHERE company_id = $1::uuid`). There is no generic finder that omits the filter — the queries are inline in the dashboard service and their three call sites are reviewable.

If a future change exposes an MV through a generic repository, the reviewer must enforce that `companyId` is in the WHERE clause of every query against these views.

---

## Findings

### Pre-existing tech debt (do NOT fix in OPS-037)

These were observed while running `nx lint api` and confirmed not introduced by Sprint 8 tickets. Tracked in `KNOWN_ISSUES.md`:

- ~30 `Forbidden non-null assertion` warnings across `operations-calendar.service.ts`, `operations-dashboard.service.ts` (`getUpcomingEvents`), `work-permits.generator.ts`, and a few other generators. None are runtime bugs — every assertion is guarded by an upstream `.filter()` or known invariant — but TS can't narrow across closures.
- Several pre-existing unused imports in operations files were drive-by-fixed in this ticket. The remaining warnings are all the non-null-assertion class.

### No critical findings

Reviewed every operations controller. No missing guards, no missing CASL policies on writes, no controller exposing a service method that bypasses `executeWithRls`. The public scan endpoint is rate-limited and returns deliberately limited data.

### Suggestions for V2

- Extract a `WithRls` decorator to enforce `executeWithRls` is called inside service methods that take `(companyId, userId)`.
- Add an integration test that fails CI if any controller adds a write endpoint without `@CheckPolicies`.
- Tighten the `app_user` Postgres role to remove `BYPASSRLS` once migrations are routed through a separate migrator account.

---

## Manual multi-tenant isolation test

Run before declaring the module ready for new clients. Not automated — requires two real companies and two real user sessions.

### Setup

- **Company A:** AGS Solutions (RUT 77.004.647-5) — already exists.
- **Company B:** create test company "Empresa Test" via `POST /api/tenancy/companies` as SUPER_ADMIN.
- **User A:** existing admin (e.g., `bonillacp1@gmail.com`).
- **User B:** create new user with ADMIN membership in Empresa Test only (no membership in Company A).

### Tests

1. **As User A**, create asset X in Company A:
   `POST /api/operations/assets` with `x-company-id: <A>`. Note the returned `id`.
2. **Logout, login as User B.** localStorage `selectedCompanyId` should now point to Company B.
3. **Try cross-tenant reads:**
   - `GET /api/operations/assets/<X>` with `x-company-id: <B>` → expected **404** (asset belongs to A; B can't see it).
   - `GET /api/operations/dashboard/overview` with `x-company-id: <B>` → **CORRECTION (HARDEN-001):** now expected **403 "No active membership for this company"** when B is a company the caller is not a member of (the read is gated; the old "returns only B's data" behavior was the cross-tenant leak this closed). Same for `GET /api/operations/calendar/export` (HARDEN-002).
   - `GET /api/operations/public/asset/<A's qrToken>/authenticated` → expected **404** (qrToken exists but the asset isn't in Company B).
4. **Try header-spoofing as User B:**
   - `GET /api/operations/assets` with `x-company-id: <A>` → expected **403 Forbidden** ("No active membership for this company") from `PoliciesGuard.canActivate`.
   - `POST /api/operations/audit/generate-package` with `x-company-id: <A>` → expected **403** for the same reason.
5. **Try header-spoofing as User A:**
   - `GET /api/operations/assets` with `x-company-id: <B>` → expected **403** (User A has no membership in B).
6. **Public scan crosses tenant boundaries (intentional):**
   - As anonymous (no JWT), `GET /api/operations/public/asset/<A's qrToken>` → expected **200** with the limited public view of asset X. This is the designed behavior — anyone with the token gets the public scan.

If any of steps 3–5 returns data from the wrong company, it is a **CRITICAL security bug** and must be filed before production rollout.

### Pass criteria

All 6 tests behave as expected. Document the run date and pass/fail per test in the production readiness checklist.
