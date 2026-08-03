# HARDEN-000 — Read-only recon: pre-tenant-2 isolation posture

**Type:** READ-ONLY recon. State, not fixes. No file changed but this one; no
migration run; no database touched (local or production).
**Date:** 2026-08-03.
**Scope:** re-verify, against TODAY'S code, the three isolation concerns that two
dated snapshots (`docs/TECHNICAL-OWNERSHIP-REPORT.md`, 2026-06-18;
`docs/PROD-VERIFICATION-FASE0.md`, 2026-06-23) raised. Production has exactly one
company, so nothing here is exploitable **today** — the question is what must be
true before onboarding a **second** client. Line numbers reflect code at recon
time and may drift.

---

## Q1 — PoliciesGuard fail-open

**File:** `apps/api/src/modules/common/guards/policies.guard.ts:16-51`. Verbatim (the
decisive lines):

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  const handlers = this.reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, context.getHandler());
  if (!handlers || handlers.length === 0) {
    return true;                                   // ← FAIL-OPEN: no @CheckPolicies ⇒ allow
  }

  const request = context.switchToHttp().getRequest<Request>();
  const user = request.user as { id: string } | undefined;
  if (!user) {
    throw new ForbiddenException('User not authenticated');
  }

  const companyId = request.headers['x-company-id'] as string | undefined;
  if (!companyId) {
    throw new ForbiddenException('x-company-id header is required');
  }

  const membership = await this.prisma.membership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
  });
  if (!membership || !membership.isActive) {
    throw new ForbiddenException('No active membership for this company');
  }
  ...
```

**What happens with NO `@CheckPolicies`:** the guard returns `true` at line 19 —
**before** the authentication check, the `x-company-id` check, and the membership
lookup (lines 22-38). So an endpoint without `@CheckPolicies` is not merely
un-authorized; it runs with **zero tenant validation** (the guard never reaches the
membership query). The only thing standing in front of such a route is
`JwtAuthGuard` (authentication), applied via `@UseGuards`.

**Is fail-open still the platform's posture?** **Yes — unchanged, and deliberate.**
The guard is applied per-controller via `@UseGuards(JwtAuthGuard, PoliciesGuard)`
(89 of 95 non-spec controllers carry both; 92 carry `JwtAuthGuard`), **not globally**:
the only global guard is the throttler — `app.module.ts:96-99`:

```ts
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
},
```

The house convention (every endpoint declares `@CheckPolicies`) is what makes the
fail-open safe; the guard's own design and the Operations-dashboard comment
(`operations-dashboard.controller.ts:27-29`) both document the short-circuit as
intentional. Nothing has changed since the report: the fail-open is real, and it is
a standing footgun for any endpoint that forgets `@CheckPolicies`.

---

## Q2 — The Operations dashboard endpoints

**File:** `apps/api/src/modules/operations/dashboard/operations-dashboard.controller.ts`.
One controller (refresh lives inside it — no separate MV controller). Class-level
`@Controller('operations/dashboard')` (`:30`) + `@UseGuards(JwtAuthGuard,
PoliciesGuard)` (`:31`); **no class-level `@CheckPolicies`.** Every handler:

| #   | Handler (file:line)                 | Path                   | `@CheckPolicies`?                                       | companyId source                                    |
| --- | ----------------------------------- | ---------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| 1   | `:38` `@Get` `overview`             | overview               | **ABSENT**                                              | `@CurrentCompany()` (raw header) + `@CurrentUser()` |
| 2   | `:43` `@Get` `actionItems`          | action-items           | **ABSENT**                                              | `@CurrentCompany()`                                 |
| 3   | `:48` `@Get` `upcomingEvents`       | upcoming-events        | **ABSENT**                                              | `@CurrentCompany()`                                 |
| 4   | `:56` `@Get` `topAssetsAtRisk`      | top-assets-at-risk     | **ABSENT**                                              | `@CurrentCompany()`                                 |
| 5   | `:64` `@Get` `recentActivity`       | recent-activity        | **ABSENT**                                              | `@CurrentCompany()`                                 |
| 6   | `:72` `@Get` `myTasks`              | my-tasks               | **ABSENT**                                              | `@CurrentCompany()` + `@CurrentUser()`              |
| 7   | `:77` `@Get` `assetDistribution`    | asset-distribution     | **ABSENT**                                              | `@CurrentCompany()`                                 |
| 8   | `:82` `@Get` `complianceByCategory` | compliance-by-category | **ABSENT**                                              | `@CurrentCompany()`                                 |
| 9   | `:90` `@Get` `freshness`            | freshness              | **ABSENT**                                              | none (returns MV timestamps only)                   |
| 10  | `:98` `@Post` `refreshViews`        | refresh-views          | **PRESENT** `:99` (`manage` OperationsDashboardSubject) | —                                                   |

The one gated handler, verbatim:

```ts
@Post('refresh-views')
@CheckPolicies((ability) => ability.can('manage', OperationsDashboardSubject))
async refreshViews() { ... }
```

**Current count of ungated endpoints: 9** (handlers 1-9). **The historical "nine"
STILL HOLDS** — unchanged. Eight of them pass the raw `x-company-id` header into a
company-scoped service call; the 9th (`freshness`) is company-agnostic (returns only
per-MV `refreshed_at`). These are read-only endpoints exposing another company's
operational overview, assets-at-risk, compliance breakdown, recent activity, and
KPIs.

---

## Q3 — Tenant resolution: is `x-company-id` validated?

`companyId` reaches a handler by **two unvalidated paths** and is validated in **one
place only** (the guard, and only when the route is gated).

**`TenantMiddleware`** — `apps/api/src/modules/common/rls/rls.middleware.ts:8-17`,
verbatim:

```ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const companyId = req.headers['x-company-id'] as string | undefined;
    if (companyId) {
      tenantStorage.run({ companyId }, () => next()); // stashes header verbatim, NO check
    } else {
      next();
    }
  }
}
```

It reads the header, stores it in an `AsyncLocalStorage`, runs **no SQL and no
validation**. It is wired for all routes except `api/auth/*` and `api/health`
(`app.module.ts` `configure()`).

**`@CurrentCompany`** — `apps/api/src/modules/common/decorators/current-company.decorator.ts:4-7`,
verbatim:

```ts
export const CurrentCompany = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.headers['x-company-id'] as string | undefined; // raw header, NO check
});
```

**The only validation** of the header against the caller's memberships is inside
`PoliciesGuard` — `policies.guard.ts:33-38`:

```ts
const membership = await this.prisma.membership.findUnique({
  where: { userId_companyId: { userId: user.id, companyId } },
});
if (!membership || !membership.isActive) {
  throw new ForbiddenException('No active membership for this company');
}
```

**Can a caller name a company they do not belong to?**

- On a **gated** route (`@CheckPolicies` present): **No.** The guard runs the
  membership lookup before the handler and rejects with _"No active membership for
  this company."_
- On an **ungated** route (the 9 dashboard endpoints, Q2): **Yes.** The guard
  short-circuits at line 19 before the membership check, and `@CurrentCompany`
  hands the handler the raw header — so an authenticated user of company A can set
  `x-company-id: <company B>` and the service queries company B's data with no
  membership check.

---

## Q4 — Materialized views

**Four MVs**, all created in
`apps/api/prisma/schema/migrations/20260429140000_add_dashboard_materialized_views/migration.sql`.
The migration header states the design contract verbatim (`:14-18`):

```
-- IMPORTANT: PostgreSQL DOES NOT apply RLS to materialized views.
-- Every read query MUST filter by company_id explicitly. The
-- application layer (operations-dashboard.service.ts) is responsible
-- for that — never expose these MVs through a generic finder.
```

| MV (migration:line)                      | Grain / companyId                           | Read at runtime?                                                                                    | Read filters companyId?                         |
| ---------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `mv_asset_compliance_snapshot` (`:30`)   | one row/asset; `company_id` column          | Yes — `operations-dashboard.service.ts:616-629`                                                     | **Yes** — `WHERE company_id = $1::uuid` (bound) |
| `mv_company_compliance_summary` (`:253`) | one row/company; `company_id` grain         | Yes — `service.ts:144-147`                                                                          | **Yes** — `WHERE company_id = $1::uuid` (bound) |
| `mv_asset_status_distribution` (`:491`)  | `(company, status)`; `GROUP BY companyId`   | Yes — `service.ts:1175-1180`                                                                        | **Yes** — `WHERE company_id = $1::uuid` (bound) |
| `mv_compliance_by_category` (`:435`)     | `(company, category)`; `GROUP BY companyId` | **No** — computed live instead (`service.ts:1233-1238`, `KNOWN_ISSUES.md:10`); still cron-refreshed | n/a (no consumer)                               |

**RLS on materialized views — confirmed NOT subject to RLS.** This is a Postgres
fact: `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` accept only ordinary tables — an
MV cannot bear a policy and always returns its full stored contents to any role with
`SELECT`. Grep of the MV migration for `ROW LEVEL SECURITY` / `CREATE POLICY` returns
**nothing**; the MVs are only `GRANT SELECT ... TO app_user` (`migration.sql:519-522`).
So MV tenancy is enforced **exclusively in the application layer** by the explicit
`WHERE company_id = $1::uuid` filters above (documented in
`operations/SECURITY_AUDIT.md:134-141`).

**Which reads carry an explicit companyId filter, and which do not:** all three
runtime MV reads bind `companyId` as `$1::uuid` (parameterized, not interpolated).
The only unfiltered MV reads are `materialized-views.service.ts:211-213`
(`SELECT MAX(refreshed_at)` per MV) and the `freshness` endpoint they back — these
return **only timestamps, no tenant rows**, so they leak nothing.

**The load-bearing caveat:** the `companyId` fed into those explicit filters comes
from `@CurrentCompany` — the **raw, unvalidated header** — on the **ungated**
dashboard endpoints (Q2/Q3). MVs have no RLS backstop, so on those 9 routes the
app-level filter is the _only_ guard, and its input is attacker-controlled.

**Refresh path:** BullMQ, not SQL cron —
`dashboard-mv-refresh.processor.ts` (fast `*/15 * * * *`, slow `0 * * * *`, plus
event-driven `@OnEvent` throttled refreshes) → `materialized-views.service.ts:168-207`
runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` against a validated view whitelist.

---

## Q5 — The database role

**Connection surface.** The datasource takes a single URL —
`apps/api/prisma/schema/base.prisma:1-4`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

The username per config surface (no secret values read):

- `.env.example:33-35` → user **`excelsia`**, with the explicit comment at `.env.example:24`:
  _"The DATABASE_URL user (excelsia) has BYPASSRLS for migrations."_
- `docker-compose.yml:10` → `POSTGRES_USER` defaults to `excelsia`.
- **Production**: `DATABASE_URL` is injected by Railway (not in the repo). The dated
  docs disagree on the literal name — `TECHNICAL-OWNERSHIP-REPORT.md` says `excelsia`,
  `PROD-VERIFICATION-FASE0.md` + `EXCELSIA-NEW-MODULES-FOUNDATION.md:44` say the app
  connects as the **`postgres` superuser**. The disagreement is immaterial to the
  posture: **both `excelsia` (BYPASSRLS by design) and `postgres` (superuser) bypass
  RLS unconditionally.** From code alone the prod role cannot be pinned — only Railway
  env holds it — but either value means RLS is not enforced at runtime.

**Is `app_user` used at runtime? No.** Grep of `apps/api/src` finds `app_user` only in
migration `GRANT`s (created at
`20260417171836_add_rls_policies/migration.sql:28-34`, re-granted as new tables land)
and in doc recommendations (`operations/KNOWN_ISSUES.md:35`,
`operations/SECURITY_AUDIT.md:166`). There is **no `SET ROLE` / `SET SESSION
AUTHORIZATION` anywhere** in runtime code. The least-privilege role the policies grant
to is created but never connected as.

**`executeWithRls`** — `apps/api/src/modules/common/rls/rls.service.ts:17-34`, verbatim:

```ts
async executeWithRls<T>(
  companyId: string,
  userId: string | null,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL rls.company_id = '${companyId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL audit.company_id = '${companyId}'`);
    if (userId) {
      await tx.$executeRawUnsafe(`SET LOCAL audit.user_id = '${userId}'`);
      await tx.$executeRawUnsafe(`SET LOCAL rls.user_id = '${userId}'`);
    }
    return fn(tx);
  });
}
```

It opens a Prisma transaction and sets four transaction-scoped GUCs
(`rls.company_id`, `audit.company_id`, and — when a userId is present —
`audit.user_id`, `rls.user_id`). It runs **under the connection role** (excelsia /
postgres), does **no** `SET ROLE`. **Net effect at runtime:** the GUCs the RLS
policies read are set correctly, but because the connecting role holds BYPASSRLS and
RLS is `ENABLE`-only (Q6), **the policies those GUCs would feed are never enforced.**
The `SET LOCAL` values are also **string-interpolated** into the SQL (`'${companyId}'`),
not parameterized — safe today because these values are validated on the write paths
that call it, but it is an injection surface if an unvalidated value ever reaches it.

**The `railway.json` `--rolled-back` boot issue — GONE.** Current start command,
`apps/api/railway.json:7-8`, verbatim:

```json
"deploy": {
  "startCommand": "npx prisma migrate deploy --schema=apps/api/prisma/schema && node dist/apps/api/main.js",
```

No `prisma migrate resolve --rolled-back`. A repo-wide grep finds that string only in
the historical docs (`PROD-VERIFICATION-FASE0.md`, `TECHNICAL-OWNERSHIP-REPORT.md:87`,
`EXCELSIA-NEW-MODULES-FOUNDATION.md:44`), never in executable config. The per-boot
action is now only `prisma migrate deploy` — the RLS migration is no longer
re-rolled-back on every deploy.

---

## Q6 — RLS coverage

Counts (migrations grep; cross-checked independently):

- **Total `@@map` business tables: 90.**
- **With an RLS policy: 87** — `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` are a
  perfect 1:1 set (87 = 87).
- **Without any policy: 3** — `audit_logs`, `tenants`, `users`.
- **`FORCE ROW LEVEL SECURITY`: 0.** RLS is **ENABLE-only, everywhere.**

The standard policy is `USING ("companyId" = current_setting('rls.company_id',
true)::uuid)` (80+ tables). Notable non-standard ones: `companies` scopes on `"id"`
(`20260417171836_add_rls_policies/migration.sql:15-16`); `user_notifications` adds a
per-user `AND "userId" = current_setting('rls.user_id', ...)`; `asset_subtypes` and
`vehicles` inherit companyId through an `EXISTS` join to their parent.

**The three policy-less tables — none has a `companyId` column**, so none is a leaky
company-scoped table:

- `users` (`iam.prisma:10`) — global identity; company link lives on `memberships`
  (which IS policy-protected).
- `tenants` (`tenant.prisma:1`) — root of the hierarchy; nothing above to scope to.
- `audit_logs` (`audit.prisma:1`) — global audit sink, scoped by `tenantId` not
  `companyId`, **no policy**. It stores `oldData`/`newData` JSON snapshots of every
  row change across all tenants/companies. Any role that can read it sees
  cross-company data — and combined with the ENABLE-only / BYPASSRLS posture, that is
  the model's weakest table. (Not currently exposed through a generic API finder, but
  it is a cross-tenant sink at rest.)

**Because RLS is `ENABLE` (not `FORCE`) and the app connects as a BYPASSRLS/superuser
role, the 87 policies are inert at runtime** — they would only bite a non-owner,
non-bypass role such as the unused `app_user`.

---

## Verdict table

| Q     | What the old report claimed                                                                                                                        | What today's code shows                                                                                                                                                           | Status                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **1** | PoliciesGuard fails OPEN; endpoints without `@CheckPolicies` are un-gated                                                                          | Identical — `policies.guard.ts:18-20` returns `true` before any tenant check; guard is per-controller, not global (`app.module.ts:96-99` = ThrottlerGuard only)                   | **STILL TRUE** (by design)                                                    |
| **2** | 9 dashboard read endpoints lack `@CheckPolicies`                                                                                                   | Exactly 9 ungated reads today; only `refresh-views` gated                                                                                                                         | **STILL TRUE** (unchanged, 9)                                                 |
| **3** | Tenant from attacker-controllable `x-company-id`; validated only in the guard                                                                      | Confirmed — `TenantMiddleware` + `@CurrentCompany` take the raw header; membership validated only in `PoliciesGuard`, i.e. only on gated routes                                   | **STILL TRUE**                                                                |
| **4** | MV reads bypass RLS; cross-tenant on the dashboard                                                                                                 | MVs cannot bear RLS (Postgres); app-level `WHERE company_id=$1` is the only guard, fed by the unvalidated header on ungated routes; `mv_compliance_by_category` now computed live | **STILL TRUE** (nuance: one MV retired from the read path)                    |
| **5** | App connects as `excelsia` (TECH-OWN) / `postgres` superuser (FASE-0); `app_user` unused; `railway.json` re-rolls-back the RLS migration each boot | Role is BYPASSRLS either way; `app_user` never used at runtime; **`--rolled-back` clause REMOVED** from `railway.json:8`                                                          | RLS-bypass posture **STILL TRUE**; the `--rolled-back` boot bug **FIXED**     |
| **6** | RLS not enforced in prod (ENABLE, not FORCE; BYPASSRLS role)                                                                                       | Confirmed: 87/90 tables have policies, 0 use FORCE, connection role bypasses; 3 policy-less tables have no `companyId` (`users`/`tenants`/`audit_logs`)                           | **STILL TRUE**; coverage is complete-where-applicable, but posture unenforced |

---

## Risks — what breaks first when a second company is onboarded (by severity)

1. **CRITICAL — cross-tenant read of the Operations dashboard via header swap.** The 9
   ungated endpoints (Q2) take an unvalidated `x-company-id` (Q3) and read
   materialized views that have no RLS (Q4). The moment a second company exists, any
   authenticated user of company A sends `x-company-id: <company B>` to
   `GET /operations/dashboard/overview` (and 7 siblings) and receives B's assets,
   compliance, KPIs, and recent activity. This is the first thing to break and it needs
   no privilege escalation — just a header. Fix before onboarding: put `@CheckPolicies`
   on all 9 (the `refresh-views` pattern already exists two lines away).

2. **CRITICAL — no database backstop for any tenant-scoping bug.** Runtime RLS is inert:
   the app connects as a BYPASSRLS/superuser role, RLS is `ENABLE`-only (no `FORCE`),
   and `app_user` — the role the 87 policies actually constrain — is never used
   (Q5/Q6). So the DB layer catches nothing; isolation rests entirely on app-level
   `WHERE companyId` + the (fail-open) `PoliciesGuard`. Risk #1 is the concrete
   instance; this is why there is no second line of defense behind it, and why any
   future missing-filter bug leaks silently. Fix before onboarding: connect as
   `app_user` (or a non-bypass role) and/or `FORCE ROW LEVEL SECURITY`, so the
   policies that already exist become live.

3. **HIGH — `audit_logs` is a cross-tenant sink with no policy** (Q6). It holds
   `oldData`/`newData` snapshots of every change across all companies, scoped only by
   `tenantId`, with no RLS. Not exposed through a generic finder today, but any new
   audit-viewer endpoint, report, or raw query would read every tenant's row history.
   Fix: scope/guard any future audit surface explicitly; consider a policy keyed on
   `tenantId`.

4. **MEDIUM — the fail-open guard is a standing footgun.** Every new endpoint that
   forgets `@CheckPolicies` is silently public and cross-tenant (Q1). This is a process
   risk that compounds each ticket. Consider a global default-deny (an `APP_GUARD` that
   requires explicit policy metadata) or a lint/CI check that every controller handler
   carries `@CheckPolicies`.

5. **LOW — `executeWithRls` string-interpolates `companyId`/`userId`** into `SET LOCAL`
   (Q5). Safe today (values are validated on the write paths that call it), but it is an
   injection surface; `set_config(name, value, true)` with bound parameters would remove
   it.

---

_Read-only recon. The single filesystem change from this ticket is the creation of
`docs/HARDENING-RECON.md`. No code, schema, migration, or database was modified or
accessed (local or production)._
