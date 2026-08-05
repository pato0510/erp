# HARDEN-003 — Read-only recon: the database role switch

**Type:** READ-ONLY recon. State and options, not fixes. No file changed but this
one; no migration run; no production database, env var or Railway service touched.
No connection was ever opened as `app_user`; no `SET ROLE`, `SET SESSION
AUTHORIZATION`, `ALTER ROLE` or password statement was issued anywhere.
**Date:** 2026-08-04. **HEAD context:** 77 migrations, `develop` = production.
**Scope:** establish exactly what breaks when the runtime connection changes from
`postgres` (superuser, BYPASSRLS) to `app_user` (no superuser, no bypass), so
HARDEN-004 can be planned rather than discovered.

> **Snapshot rule (house doctrine).** This is a dated snapshot and is **never
> retro-edited**. Line numbers reflect code on 2026-08-04 and will drift. Where it
> disagrees with `CLAUDE.md`, `CLAUDE.md` wins.

**Evidence basis — read this before trusting a number.** Two kinds of evidence
appear below and they are labelled every time:

- **REPO** — files in the working tree. Applies to production, since `develop` is
  production.
- **LOCAL DB** — read-only `SELECT`s against the local dev instance
  (`excelsia_dev` at `localhost:5434`, connected as `excelsia`, PostgreSQL
  **16.14**). This instance has the same 77 migrations applied
  (`prisma migrate status`: "Database schema is up to date"), so its catalog is a
  faithful **model** of production's — but it is **not** production. Every
  LOCAL DB claim needs a founder re-run against production before HARDEN-004.
  Local roles: `app_user` (`rolsuper=f`, `rolbypassrls=f`, `rolcanlogin=t`) and
  `excelsia` (`rolsuper=t`, `rolbypassrls=t`). Production, per the founder's
  2026-08-04 query, has `app_user` and `postgres` instead — **NOT VERIFIED by me**,
  production is out of bounds.

---

## Q1 — The bootstrap knot

### Q1.1 The chain, end to end

Tenant identity is resolved by a chain that runs **entirely outside**
`executeWithRls`, and the first link runs before any company has been chosen:

1. **Login** — `iam/auth.service.ts:16`, `validateUser`:
   ```ts
   const user = await this.prisma.user.findUnique({ where: { email } });
   ```
   Reads `users`. **`users` has no RLS policy**, so this survives the switch.
2. **`GET /auth/me`** — `iam/auth.controller.ts:39-42` → `auth.service.ts:93-118`,
   `getMe`. This is the company selector's data source, verbatim at `:94-118`:
   ```ts
   const user = await this.prisma.user.findUnique({
     where: { id: userId },
     select: {
       id: true,
       email: true,
       firstName: true,
       lastName: true,
       isActive: true,
       lastLoginAt: true,
       memberships: {
         where: { isActive: true },
         select: {
           id: true,
           role: true,
           company: { select: { id: true, name: true, taxId: true } },
         },
       },
     },
   });
   ```
   The nested selects read **`memberships`** and **`companies`** — both policied
   (`20260417171836_add_rls_policies:19-22` and `:15-16`). No GUC is set: bare
   `this.prisma`, no transaction. Note also that `TenantMiddleware` is **excluded**
   from `api/auth/*` (`app.module.ts:111-115`), so there is no `x-company-id` in
   scope here even in principle.
3. **The browser stores the choice** — `apps/web/src/lib/api.ts:20-32`: the
   selected company is held in memory and mirrored to
   `localStorage.getItem('selectedCompanyId')`, then attached to every subsequent
   request as `x-company-id` (`api.ts:43-45`, and again at `:107`, `:132`, `:157`;
   `lib/download.ts:8`).
4. **`PoliciesGuard` validates it** — `common/guards/policies.guard.ts:33-35`:
   ```ts
   const membership = await this.prisma.membership.findUnique({
     where: { userId_companyId: { userId: user.id, companyId } },
   });
   ```
   Bare Prisma, outside `executeWithRls`, outside any `$transaction`. The guard
   injects `PrismaService` directly (`:13`) and never imports `RlsService`.

**The knot:** step 2 is upstream of everything. Under `app_user` with no GUC, the
`memberships` policy evaluates `"companyId" = current_setting('rls.company_id',
true)::uuid`; with the setting unset, `current_setting(..., true)` returns NULL,
`x = NULL` is NULL, and the row is filtered. `/auth/me` therefore returns
`companies: []` — the user logs in successfully and sees **an empty company
selector**. No `x-company-id` is ever produced, so step 4 never gets a chance to
fail; the product is unreachable from the login screen. The guard's own bare
lookup (step 4) is the _second_ failure, not the first.

### Q1.2 Full census of identity/tenancy reads outside `executeWithRls`

REPO. Every read of `User`, `Membership` or `Company` on a bare client. GUC column
is uniform because none of these sits in a transaction that sets one.

| #   | file:line                               | Query                                                     | Table(s)                                 | GUC set? |
| --- | --------------------------------------- | --------------------------------------------------------- | ---------------------------------------- | -------- |
| 1   | `iam/auth.service.ts:16`                | `user.findUnique({where:{email}})`                        | users                                    | none     |
| 2   | `iam/auth.service.ts:39-42`             | `user.update` (lastLoginAt, refreshTokenHash)             | users                                    | none     |
| 3   | `iam/auth.service.ts:51`                | `user.findUnique({where:{id}})` (refresh)                 | users                                    | none     |
| 4   | `iam/auth.service.ts:69-72`             | `user.update` (logout)                                    | users                                    | none     |
| 5   | `iam/auth.service.ts:94-118`            | `getMe` + nested memberships→company                      | users, **memberships**, **companies**    | none     |
| 6   | `common/guards/policies.guard.ts:33-35` | `membership.findUnique(userId_companyId)`                 | **memberships**                          | none     |
| 7   | `iam/users.service.ts:31-35`            | `membership.findMany({where:{companyId}})` + include user | **memberships**, users                   | none     |
| 8   | `iam/users.service.ts:92-94`            | `membership.findUnique(userId_companyId)`                 | **memberships**                          | none     |
| 9   | `closing/closing.service.ts:101`        | `membership.findUnique`                                   | **memberships**                          | none     |
| 10  | `closing/closing.service.ts:136`        | `company.findUnique`                                      | **companies**                            | none     |
| 11  | `closing/closing.service.ts:248`        | `user.findUnique`                                         | users                                    | none     |
| 12  | `companies/companies.service.ts:15-18`  | `company.findUnique` + settings + tenant                  | **companies**, company_settings, tenants | none     |
| 13  | `companies/companies.service.ts:44`     | `company.findUnique` (pre-check before an RLS write)      | **companies**                            | none     |
| 14  | `tenancy/tenancy.service.ts:9-12`       | `tenant.findUnique` + include companies                   | tenants, **companies**                   | none     |
| 15  | `tenancy/tenancy.service.ts:16-19`      | `company.findUnique` + include tenant                     | **companies**, tenants                   | none     |
| 16  | `tenancy/tenancy.service.ts:23-25`      | `company.findMany({where:{tenantId}})`                    | **companies**                            | none     |

`iam/users.service.ts:56`, `:59` and `:123` read `user`/`membership` on `tx` inside
`this.rls.executeWithRls(...)`, so those **do** carry the GUC.

**Two further classes that are not identity resolution but read the same policied
tables with no GUC, and fail the same way** (REPO):

- **Notification-recipient lookups** — `membership.findMany` at
  `operations/procedures/procedures.service.ts:601`, `:992`;
  `.../acknowledgments/acknowledgments.service.ts:671`, `:860`;
  `operations/permits/work-permits/work-permits.service.ts:933`;
  `operations/permits/approvals/approval-actions.service.ts:724`;
  `operations/exceptions/exceptions.service.ts:199`, `:471`;
  `operations/alerts/alert-escalation.service.ts:90`;
  `operations/notifications/notification.service.ts:325`;
  `operations/calendar/operations-calendar.service.ts:617`;
  `hsec/incidents/incidents.service.ts:251`;
  `actividades/members/members-read.service.ts:28`;
  `rrhh/contracts/contract-reminders.service.ts:134`;
  `rrhh/employee-documents/document-reminders.service.ts:140`;
  `rrhh/certifications/certification-reminders.service.ts:126`.
  Under a live policy each returns zero recipients — **notifications stop
  silently**, with no error to log.
- **Cron company sweeps** — three jobs enumerate every active company on a bare
  client and then loop: `operations/alerts/alert-engine.service.ts:326-332`
  (`processAllCompanies`), `operations/alerts/alert-escalation.service.ts:146-152`
  (`processAllCompaniesEscalations`), `operations/exceptions/exceptions.service.ts:502-508`
  (`processAllCompaniesExpired`). Verbatim, the shape of all three:
  ```ts
  const companies = await this.prisma.company.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  ```
  Zero rows → the loop body never executes → **the entire alerting, escalation and
  exception-expiry machinery becomes a silent no-op.** These have no request
  context and therefore no `x-company-id` to derive a GUC from; they are
  structurally cross-company by design.

### Q1.3 Resolution options, costed. No recommendation.

**Option A — set the GUC early from the raw header, before the guard.**
Set `rls.company_id` from `x-company-id` in `TenantMiddleware`
(`common/rls/rls.middleware.ts`) or an interceptor, ahead of `PoliciesGuard`.

- _Evidence for:_ the value is already in scope there; `TenantMiddleware` already
  stashes it in `AsyncLocalStorage`.
- _Cost — correctness:_ it **inverts the trust model**. The guard's membership
  lookup would then run under a GUC supplied by the attacker: asking "is this user
  a member of company B?" inside a context already scoped to company B. It still
  answers correctly (the row either exists or it does not), but every future
  reviewer must re-derive that argument.
- _Cost — the pool, and this is the disqualifier for the naive form:_ middleware is
  **not** a transaction. A bare `SET` there persists on the pooled connection and
  is inherited by the next request, which may belong to another company — the exact
  cross-tenant leak this arc exists to close (doctrine already recorded in
  `CLAUDE.md`). Making it safe requires pinning a connection for the whole request
  (`$transaction` around the entire request lifecycle, or an interactive
  transaction handle threaded through every service) — a large architectural change
  that also serialises each request onto one connection.
- _Cost — coverage:_ does nothing for `/auth/me` (no header exists yet) or for the
  three cron sweeps (no request at all).

**Option B — a separate privileged path for identity resolution.**
Two sub-forms:

- **B1, dedicated connection.** A second `PrismaClient` (or a raw `pg` client) on a
  second `DATABASE_URL` whose role bypasses RLS, used _only_ by the identity
  queries in Q1.2 rows 1-16.
  - _Cost:_ a second pool (memory, connection count — the DB's `max_connections`
    now serves two pools), a second credential to rotate, and a hard discipline
    problem: nothing in the type system stops a future ticket from reaching for the
    privileged client "just this once". Needs a lint rule or a narrow wrapper
    module to hold the line. Blast radius is bounded and explicit, which is its
    main virtue.
- **B2, `SECURITY DEFINER` function.** A function owned by a privileged role that
  answers exactly `is_active_member(user_id, company_id) → bool` (and a second for
  the `/auth/me` company list), called by `app_user`.
  - _Evidence it works here:_ the pattern is already in production in this schema —
    `audit_trigger_function` is `SECURITY DEFINER` (LOCAL DB: `prosecdef = t`,
    owner `excelsia`; source at
    `20260417172748_add_audit_triggers/migration.sql:45`).
  - _Cost:_ SQL becomes part of the application's API surface and must be
    versioned in migrations; the function must be written with a pinned
    `search_path` (the existing one is **not** — LOCAL DB `proconfig` is NULL —
    see Q7.3); and Prisma calls it through `$queryRaw`, losing type generation.
    Keeps one pool and one credential.

**Option C — re-key the `memberships` policy to `rls.user_id`.**
Change the policy from company-scoped to caller-scoped, e.g.
`USING ("userId" = current_setting('rls.user_id', true)::uuid)`, so a user can
always read their own memberships.

- _Evidence for:_ the precedent exists in this schema —
  `user_notifications` already combines both GUCs (LOCAL DB `pg_policies.qual`):
  ```
  (("companyId" = (current_setting('rls.company_id'::text, true))::uuid)
   AND ("userId" = (current_setting('rls.user_id'::text, true))::uuid))
  ```
  `executeWithRls` already sets `rls.user_id` when a `userId` is passed
  (`rls.service.ts:30`).
- _Cost — it does not close the knot on its own:_ the identity queries in Q1.2 set
  **no** GUC at all, `rls.user_id` included. `/auth/me` would still return zero
  memberships. The re-key only helps once something sets `rls.user_id` early —
  which lands you back in Option A's pooling problem, except that the value comes
  from the **JWT** rather than a client header, which is a materially stronger
  input.
- _Cost — collateral:_ `iam/users.service.ts:31` ("list the users of this company")
  legitimately needs _other people's_ memberships. A caller-scoped policy breaks
  it; the policy would need to be a union (`own rows OR company rows`), and the
  company arm re-introduces the GUC requirement.
- _Cost — `companies`:_ re-keying `memberships` says nothing about the `companies`
  policy, which `/auth/me` also traverses. It would need its own treatment
  (e.g. an `EXISTS` over `memberships` — the `asset_subtypes` pattern, LOCAL DB
  `pg_policies.qual`, which already demonstrates an `EXISTS` join in this schema).

**What every option shares:** none of them addresses Q4. They unblock login; they
do not make a single business read return rows.

---

## Q2 — The credential

### Q2.1 Every provisioning statement in the repo

REPO. The complete set, from a grep of all 77 migration directories for `app_user`
— one `CREATE ROLE`, and nothing else that touches the role's authentication.

`20260417171836_add_rls_policies/migration.sql:24-31`, verbatim:

```sql
-- 4. Create application-level database role
-- The app connects as this role; RLS policies apply to it.
-- The migration user keeps BYPASSRLS so migrations and seeds work.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN;
  END IF;
END $$;
```

Every other `app_user` occurrence in the tree is a privilege grant (Q3) or a
comment. There is **no `PASSWORD` clause, no `ALTER ROLE ... PASSWORD`, no
`SCRAM` secret, no `.pgpass`, no `PGPASSWORD`, and no `APP_USER_*` variable** in
`.env`, `.env.example`, `docker-compose.yml`, `railway.json` or `ci.yml`.

### Q2.2 Does the repo contain any path to a usable password?

**No.** Stated plainly: `CREATE ROLE app_user LOGIN` sets `rolcanlogin = true` and
leaves `rolpassword` NULL. `rolcanlogin` means _the catalog permits login_, not
_a credential exists_.

LOCAL DB confirmation (`pg_authid`, read-only):

```
rolname  | has_password | rolvaliduntil
app_user | f            |
excelsia | t            |
```

So on the substrate that has run all 77 migrations, `app_user` **cannot
authenticate** under `scram-sha-256` or `md5`. A `DATABASE_URL` pointing at
`app_user` today would fail at connect time with an authentication error — the
service would not boot, which is at least a loud failure rather than a quiet one.
(Production **NOT VERIFIED** — same migration, so the same outcome is expected,
but only a founder query can confirm it. A production `pg_hba.conf` set to `trust`
or `peer` for the API's network path would change this; on Railway that is not the
case, but I cannot verify it.)

### Q2.3 What the founder would run — HARDEN-004, not now

Setting a role password is a **production write** and an `ALTER ROLE`: explicitly
out of scope for this recon and for any Claude Code session. Recorded here so it is
not rediscovered.

The founder would, in the Railway Postgres console as a superuser:

```sql
-- 1. State before (expect: rolcanlogin t, has_password f)
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls,
       (rolpassword IS NOT NULL) AS has_password
FROM pg_authid WHERE rolname = 'app_user';

-- 2. Set it. Generated by a password manager, never typed by hand,
--    never pasted into a chat, never committed.
ALTER ROLE app_user WITH PASSWORD '<generated>';

-- 3. State after (expect: has_password t)
SELECT rolname, (rolpassword IS NOT NULL) AS has_password,
       substring(rolpassword from 1 for 14) AS scram_prefix
FROM pg_authid WHERE rolname = 'app_user';
```

Verification that it works, still by the founder, **before** any env var changes:
open a session with the new credential and confirm the identity is what was
intended and that RLS actually bites —

```sql
SELECT current_user, session_user;                      -- expect app_user
SELECT count(*) FROM companies;                         -- expect 0 (no GUC set)
SET LOCAL rls.company_id = '<a real company uuid>';     -- inside a transaction
SELECT count(*) FROM companies;                         -- expect 1
```

That last pair is the single cheapest proof that the policies are live and
correctly keyed. Two related decisions are recorded in the decisions list: whether
the password lives only in Railway's variable store, and whether the migrator gets
a **separate** credential (Q6).

---

## Q3 — GRANT inventory

### Q3.1 Static inventory, from the migrations

REPO, by parsing all 77 migration directories in order against the 90 `@@map`
tables in `apps/api/prisma/schema/*.prisma`:

| Class                                                                     | Count  | How `app_user` is covered                                                                                                                              |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tables with an **explicit per-table 4-verb GRANT** in their own migration | **85** | `GRANT SELECT, INSERT, UPDATE, DELETE ON <t> TO app_user;` — the house template                                                                        |
| Tables with **no** explicit grant                                         | **5**  | `audit_logs`, `companies`, `memberships`, `tenants`, `users`                                                                                           |
| Materialized views                                                        | 4      | explicit `GRANT SELECT` at `20260429140000_add_dashboard_materialized_views/migration.sql:519-522`                                                     |
| Sequences                                                                 | 1      | `GRANT USAGE ON SEQUENCE work_permit_number_seq TO app_user;` (`20260428240000_add_work_permits/migration.sql`, the sequence itself created at `:136`) |
| Schema-level `GRANT USAGE ON SCHEMA public`                               | **0**  | none anywhere in the tree                                                                                                                              |

The three known holes, carried forward and re-cited:

1. **The one-shot snapshot** — `20260417171836_add_rls_policies:33`:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
   ```
   Covers only relations existing on 2026-04-17.
2. **The default privileges** — `20260417171836_add_rls_policies:34`:
   ```sql
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
   ```
   No `FOR ROLE` clause, so it is keyed to the role that executed it, and only the
   `TABLES` class — no `SEQUENCES`, `FUNCTIONS`, `TYPES` or `SCHEMAS` counterpart
   exists.
3. **One sequence grant in the entire tree** (above).

**The older tables, checked specifically as instructed.** The 5 tables without an
explicit grant are _exactly_ the 5 that predate the snapshot migration — they are
covered by hole 1 and by nothing else. They are also, uncomfortably, the bootstrap
set: `users`, `memberships`, `companies` are the Q1 chain, and `audit_logs` is the
trigger's write target. Their coverage rests on a single 2026-04-17 statement that
no later migration reasserts. Nothing in the tree drops and recreates them (grep
for `DROP TABLE` over those names returns nothing), so the grant should have
survived — but a future migration that recreates one of them would silently strip
it.

### Q3.2 What the catalog actually says

LOCAL DB, read-only. This turns the inventory from inference into measurement, and
the result is better than the static reading suggests:

- **Zero privilege gaps on tables and materialized views.** A query for any
  relation (`relkind IN ('r','m')`) in `public` lacking any of SELECT/INSERT/
  UPDATE/DELETE for `app_user` returned **0 rows**. All **91** ordinary tables (90
  business tables + `_prisma_migrations`) carry all four verbs, and so do all 4
  MVs.
- **Why the post-snapshot tables are covered even where the per-table grant would
  have been missed:** the default-privilege row is live —
  ```
  granting_role | objtype | defaclacl
  excelsia      | r       | {app_user=arwd/excelsia}
  ```
  `objtype = 'r'` is the relation class, and PostgreSQL applies it to ordinary
  tables **and materialized views** at creation time. That is why the MVs hold all
  four verbs despite the migration granting only `SELECT`.
- **The load-bearing caveat on that row:** it is keyed to **`excelsia`**, the role
  that ran the migration on this machine. In production the equivalent row is keyed
  to whatever role ran it there (`postgres`). Default privileges apply _only_ to
  objects created by that role. The mechanism therefore holds in production **only
  if** the same role that executed the 2026-04-17 migration also creates every
  later table — true today, and a thing to preserve when the migrator is split out
  (Q6). **NOT VERIFIED in production**; the founder query is in the decisions list.
- **Schema USAGE is not a gap.** `has_schema_privilege('app_user','public','USAGE')`
  = **true** (PostgreSQL grants `USAGE` on `public` to `PUBLIC` by default);
  `CREATE` = **false** (PG15+ revokes `CREATE` from `PUBLIC`). So the missing
  `GRANT USAGE ON SCHEMA public` costs nothing, and `app_user` cannot create
  objects in `public` — which also defuses a `search_path` attack on the
  `SECURITY DEFINER` audit function (Q7.3).
- **The one sequence is adequately granted.**
  ```
  relname                | usage | select | update
  work_permit_number_seq | t     | f      | f
  ```
  `nextval()` and `currval()` require `USAGE` **or** `UPDATE`; `USAGE` is present,
  so work-permit numbering works. `setval()` would need `UPDATE` and would fail —
  no code path calls it (the only sequence use is the number generator). It is the
  **only** sequence in the schema (`relkind='S'` count = 1); Prisma models use
  uuid/cuid defaults, and there is no `autoincrement()` in any `.prisma` file and
  no `SERIAL`/`IDENTITY` in any migration.

### Q3.3 The one real gap: materialized-view refresh

Privileges are complete; **ownership is not**, and no `GRANT` can fix it.

LOCAL DB — all four MVs are owned by `excelsia`, not `app_user`:

```
relname                      | owner    | relrowsecurity | relforcerowsecurity
mv_compliance_by_category     | excelsia | f              | f
mv_asset_status_distribution  | excelsia | f              | f
mv_asset_compliance_snapshot  | excelsia | f              | f
mv_company_compliance_summary | excelsia | f              | f
```

REPO — the refresh is issued at runtime by the API, not by a migration.
`operations/dashboard/materialized-views.service.ts:181` and `:189`:

```ts
await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
...
await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${view}`);
```

`REFRESH MATERIALIZED VIEW` requires **ownership** of the view. Under `app_user`
both the `CONCURRENTLY` attempt and the blocking fallback would fail. The code
catches the first failure, logs a warning, tries the blocking form, and rethrows
(`:185-192`) — so the BullMQ refresh jobs (fast `*/15`, slow hourly, plus
event-driven refreshes) would fail loudly and repeatedly, and dashboard data would
freeze at its last good refresh while the reads themselves still work. This is also
the only DDL-shaped statement the application issues at runtime; a repo-wide grep
of `$executeRaw`/`$queryRaw` for `CREATE|ALTER|DROP|REFRESH` returns these two
lines and nothing else.

Fixes exist (transfer ownership of the four MVs to `app_user`; or wrap the refresh
in a `SECURITY DEFINER` function; or move refresh out of the API into a privileged
job) — all are HARDEN-004 decisions, listed at the end.

---

## Q4 — Where `rls.company_id` is **NOT** set — the central deliverable

### Q4.1 The census

REPO. Counted across `apps/api/src/modules`, all non-spec `.ts` files, matching
`this.prisma.<model>.<verb>(` for read verbs (`findMany`, `findUnique`,
`findFirst`, `findUniqueOrThrow`, `findFirstOrThrow`, `count`, `aggregate`,
`groupBy`), the same for write verbs, plus raw calls and bare `$transaction`.
Every one of these runs on the bare client with **no GUC**. The denominator is
`executeWithRls(` call sites.

| Module         | Direct READ | Direct WRITE |   Raw | Bare `$transaction` | `executeWithRls` | Files w/ direct reads |
| -------------- | ----------: | -----------: | ----: | ------------------: | ---------------: | --------------------: |
| operations     |         408 |            9 |     7 |                   0 |              138 |                    46 |
| rrhh           |          98 |            0 |     0 |                   0 |               67 |                    20 |
| comercial      |          45 |            0 |     0 |                   0 |               31 |                     9 |
| reconciliation |          35 |            4 |     0 |                   4 |                0 |                     2 |
| dashboard      |          25 |            0 |     0 |                   0 |                1 |                     2 |
| catalogs       |          25 |            0 |     0 |                   0 |               16 |                     5 |
| hsec           |          24 |            0 |     0 |                   0 |               25 |                     6 |
| closing        |          23 |            0 |     0 |                   0 |                2 |                     1 |
| reports        |          19 |            0 |     0 |                   0 |                0 |                     1 |
| tax            |          18 |            8 |     0 |                   0 |                2 |                     2 |
| cashflow       |          14 |            0 |     0 |                   0 |                6 |                     1 |
| alerts         |          13 |            7 |     0 |                   0 |                0 |                     1 |
| actividades    |          13 |            0 |     0 |                   0 |               10 |                     3 |
| marketing      |          13 |            0 |     0 |                   0 |                8 |                     4 |
| movements      |          10 |            1 |     0 |                   0 |                5 |                     2 |
| banking        |           8 |           16 |     0 |                   0 |                1 |                     3 |
| iam            |           5 |            2 |     0 |                   0 |                2 |                     2 |
| finance        |           5 |            0 |     0 |                   0 |                2 |                     2 |
| tenancy        |           3 |            0 |     0 |                   0 |                0 |                     1 |
| audit          |           3 |            0 |     0 |                   0 |                0 |                     1 |
| companies      |           2 |            1 |     0 |                   0 |                2 |                     1 |
| common         |           1 |            0 |     0 |                   1 |                0 |                     1 |
| **TOTAL**      |     **810** |       **48** | **7** |               **5** |          **318** |               **116** |

Four modules have **zero** `executeWithRls` calls and read exclusively on the bare
client: `reconciliation` (35), `reports` (19), `alerts` (13), `tenancy` (3),
`audit` (3).

### Q4.2 The arithmetic — how many endpoints go blind

Show the working:

- **810** GUC-less read call sites across **116** files, against **318**
  `executeWithRls` sites. Reads are ~2.5× the entire RLS-wrapped surface.
- The API exposes **578** HTTP handlers across 94 controllers in
  `apps/api/src/modules`.
- Essentially every one of those handlers reaches a service that reads on the bare
  client. There is no read path in the codebase that sets the GUC _and_ returns
  data to a controller: `executeWithRls` is a **write** wrapper, and the reads that
  do sit inside it are the read-modify-write pre-checks within a mutation.
- Therefore the honest estimate of endpoints returning zero rows (or an empty
  list, or a spurious `NotFoundException` where the code turns an empty read into
  one) is **effectively all read endpoints — on the order of 500 of 578**, not a
  handful. The residue that still works: the 6 legitimately-public handlers, and
  the `users`-only auth endpoints (`users` carries no policy).

- **Writes fail differently, and worse than "blind".** LOCAL DB — all 87 policies
  are `FOR ALL` with **`with_check IS NULL`**:

  ```
  cmd | n  | with_check_null
  ALL | 87 | 87
  ```

  When `WITH CHECK` is omitted, PostgreSQL uses the `USING` expression as the check
  for `INSERT`/`UPDATE`. With no GUC the expression is NULL → not true → the write
  is **rejected with an error**, not silently dropped. So:
  - the **318** `executeWithRls` writes keep working (they set the GUC);
  - the **48** direct writes outside it — `banking` 16, `operations` 9, `tax` 8,
    `alerts` 7, `reconciliation` 4, `iam` 2, `movements`/`companies` 1 each —
    would start throwing `new row violates row-level security policy`.
  - **`user_notifications` is the sharp edge**: its policy requires _both_ GUCs
    (`rls.company_id` AND `rls.user_id`, LOCAL DB `pg_policies.qual`), and
    `executeWithRls` only sets `rls.user_id` when a non-null `userId` is passed
    (`rls.service.ts:25-31`). Any notification write made with `userId = null`
    would fail even from inside the wrapper.

- **Independent corroboration that a large fraction of writes already skip the
  wrapper.** LOCAL DB, `audit_logs`: **707** rows, of which **265 (37.5%)** have
  `tenantId` NULL and **268** have `userId` NULL. The trigger fills those columns
  from `audit.company_id`/`audit.user_id`, which only `executeWithRls` sets. So
  roughly **a third of all audited writes on this instance already ran with no
  audit/RLS context** — measured, not inferred.

### Q4.3 The verdict this number decides

**HARDEN-004 is a code campaign, not a connection-string change.** Flipping
`DATABASE_URL` alone would take the product from "working" to "login screen with
an empty company selector, ~500 read endpoints returning nothing, three cron
sweeps silently doing nothing, MV refresh erroring every 15 minutes, and 48 write
paths throwing RLS violations". The env var is the _last_ step of the campaign, not
the campaign.

The shape of the campaign (not a recommendation — the mechanism is a founder
decision): every read path must acquire a company-scoped, transaction-local
context. The candidates are the same three families as Q1.3 — thread a
GUC-carrying client through reads, or pin one per request, or make the policies
answerable from something the read already carries — and the 810/116 figure is the
size of whichever one is chosen.

---

## Q5 — The pool

### Q5.1 How `PrismaService` is constructed

REPO — `common/prisma/prisma.service.ts`, the file in full (13 lines):

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Everything the pool does is therefore Prisma's default: **no `datasources`
override, no `log` config, no `$use` middleware, no `$extends`** (a repo-wide grep
for `$use(`/`$extends(` in non-spec code returns nothing), and no connection
parameters in the URL beyond `?schema=public`. One `PrismaClient`, one pool,
injected everywhere. The datasource is a single `env("DATABASE_URL")`
(`prisma/schema/base.prisma:1-4`), so **one URL serves the whole process** — this
is also why Q6's migrator/runtime split cannot be expressed inside the schema.

### Q5.2 Can a per-request `SET` leak across requests?

**Yes — and this is the single most dangerous shortcut available to HARDEN-004.**

The mechanism, stated precisely: Prisma hands out connections from a pool per
_operation_, not per request. A plain `SET rls.company_id = '<A>'` issued outside a
transaction changes the **session** state of whichever pooled connection served
that statement, and it persists there until the connection is reset or closed. The
next operation to draw that connection — a different request, plausibly a different
user of a different company — inherits company A's context. If the leaked GUC is
what RLS keys on, the result is a cross-tenant read that looks completely normal in
the logs: correct user, correct endpoint, wrong tenant's rows.

**The safe pattern, already in the codebase**: `SET LOCAL` inside an explicit
transaction. `rls.service.ts:22-33` opens `this.prisma.$transaction(...)` and
issues the settings on the transaction client `tx`; PostgreSQL discards `SET LOCAL`
values at COMMIT/ROLLBACK, and Prisma pins one connection for the transaction's
duration, so the context cannot outlive the unit of work or migrate to another
one. Any new read-side context mechanism must satisfy both halves — transactional
scope **and** a pinned connection. `rls.security.spec.ts:9-17` already pins the
first half as a contract in tests.

### Q5.3 `set_config` as the alternative to interpolation

Noted, not recommended. The current statements interpolate the value into the SQL
string (`rls.service.ts:23-30`, e.g.
`` `SET LOCAL rls.company_id = '${companyId}'` ``), which is an injection surface
if an unvalidated value ever reaches it — today the callers validate, so it is
latent, not live. The parameterised equivalent is:

```sql
SELECT set_config('rls.company_id', $1, true)
```

The third argument `true` means _local to the transaction_, i.e. exactly `SET
LOCAL` semantics, and Prisma's `$queryRaw` tagged template binds `$1` properly. If
the read-side campaign of Q4 introduces a second place that sets context, this is
the form that does not have to be audited for injection.

---

## Q6 — Migrator / runtime split

### Q6.1 The current state

REPO — `apps/api/railway.json:7-8`, verbatim:

```json
  "deploy": {
    "startCommand": "npx prisma migrate deploy --schema=apps/api/prisma/schema && node dist/apps/api/main.js",
```

One command, one process environment, therefore **one `DATABASE_URL` serving both
the migrator and the runtime**. Confirmed as noted in the ticket: an applied
migration never re-runs — `migrate deploy` applies only what is absent from
`_prisma_migrations` — and the historical `migrate resolve --rolled-back` clause is
gone (repo-wide grep finds it only in historical docs).

### Q6.2 The forward-looking hazard, measured

If the split is not made and `DATABASE_URL` becomes `app_user`, then every
**future** migration executes as `app_user` at boot. Two consequences, and the
evidence changes the ordering the ticket assumed:

1. **The first failure is DDL, not privilege escalation.** LOCAL DB:
   `has_schema_privilege('app_user','public','CREATE')` = **false**. A future
   migration's first `CREATE TABLE` in `public` therefore aborts with a permission
   error. `migrate deploy` fails → the `&&` short-circuits → `node` never starts →
   **boot loop on the deploy that carries the migration**. Loud, immediate, and it
   takes the service down rather than corrupting anything.
2. **The `ALTER ROLE current_user BYPASSRLS` pattern would NOT grant bypass to
   `app_user`.** This diverges from the ticket's premise and is worth stating
   exactly. The pattern, `20260417171836_add_rls_policies:36-47`, verbatim
   (complete, no elision):

   ```sql
   -- 5. Ensure the migration user bypasses RLS (critical for Prisma migrations and seeds).
   -- Managed Postgres (Railway, Supabase, RDS, etc.) does not expose a superuser
   -- named "excelsia" — use current_user and degrade gracefully if BYPASSRLS
   -- cannot be granted (the connecting role is often already superuser/bypass).
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) THEN
       EXECUTE format('ALTER ROLE %I BYPASSRLS', current_user);
     END IF;
   EXCEPTION WHEN insufficient_privilege OR others THEN
     RAISE NOTICE 'Skipping ALTER ROLE % BYPASSRLS: %', current_user, SQLERRM;
   END $$;
   ```

   Only a **superuser** may set `BYPASSRLS` on any role, including itself.
   `app_user` is not one (LOCAL DB `rolsuper = f`), so the `EXECUTE` raises
   `insufficient_privilege`, which this block explicitly catches and downgrades to
   a `NOTICE`. The migration would proceed, and `app_user` would **not** acquire
   bypass. The self-escalation risk is therefore **absent** — but it is absent
   because of two independent accidents (`app_user` not being superuser, and that
   `EXCEPTION` handler existing), not by design. If a future migration copies the
   pattern _without_ the handler, the failure mode is a hard migration error, not a
   silent grant.

   The genuine residual risk in this block is the opposite one: it is a **standing
   instruction to give BYPASSRLS to whoever runs migrations**. Once the migrator is
   a dedicated role, that is correct and desirable. If the two roles are ever
   merged back, it re-arms.

### Q6.3 What the split must look like

Requirements the evidence imposes:

- **The migrator role needs**: `CREATE` on schema `public`, ownership (or
  equivalent rights) over existing objects to `ALTER` them, `BYPASSRLS` (so
  data-backfill migrations see all rows), and write access to `_prisma_migrations`.
- **The runtime role (`app_user`) must NOT have**: `CREATE` on `public` (it does
  not today), `BYPASSRLS` (it does not), superuser (it is not).
- **Ownership question that must be answered before, not after:** new objects are
  owned by their creator, and default privileges are keyed to the creating role
  (Q3.2). If the migrator becomes a _new_ role, the existing `pg_default_acl` row
  keyed to the current migrator no longer applies to what the new role creates, and
  every future table would land **without** `app_user` grants — except that the
  house per-table `GRANT` template (85 of 90 tables) would still cover them. The
  belt survives if the suspenders are cut, but only because the template is
  disciplined. A matching `ALTER DEFAULT PRIVILEGES FOR ROLE <migrator>` would
  restore the second layer.
- **MV ownership (Q3.3) interacts here**: whoever owns the MVs must be whoever
  refreshes them, and refresh happens in the _runtime_ process today.

Repo changes implied (for HARDEN-004 to execute, not now):

- `apps/api/railway.json:8` — the start command must run the migrator step under a
  different URL, e.g. taking the privileged URL from a second variable while the
  service's `DATABASE_URL` becomes the `app_user` one. Because
  `base.prisma:1-4` reads a single `env("DATABASE_URL")`, the switch has to happen
  in the **process environment of the migrate step**, not in the schema.
- One new Railway variable on the **api** service holding the migrator URL.
- `.env.example` — currently documents a single URL and a role (`excelsia`) that
  does not exist in production (`.env.example:24`, `:33-35`); it would need to show
  the two-URL shape.
- `ci.yml` — uses only `NX_CLOUD_ACCESS_TOKEN` and touches no database, so no
  change.

---

## Q7 — `audit_logs`

### Q7.1 Does the trigger still work under `app_user`? — Yes.

REPO — `20260417172748_add_audit_triggers/migration.sql:8-45`. The decisive line is
the last one:

```sql
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
...
  INSERT INTO audit_logs (
    "id", "tableName", "operation",
    "oldData", "newData",
    "userId", "tenantId", "createdAt"
  ) VALUES (
    gen_random_uuid(), TG_TABLE_NAME, TG_OP,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
    NULLIF(audit_user_id, '')::uuid,
    NULLIF(audit_company_id, '')::uuid,
    NOW()
  );
...
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

LOCAL DB confirms the deployed state: `prosecdef = t`, owner `excelsia` (a
superuser), `proconfig` NULL. **83** tables carry this trigger.

`SECURITY DEFINER` means the function body executes with the **owner's**
privileges, not the caller's. So under `app_user`:

- the `INSERT INTO audit_logs` succeeds regardless of `app_user`'s own rights (it
  has them anyway, via the 2026-04-17 snapshot — Q3.1);
- it would also succeed if `audit_logs` later acquired an RLS policy, because the
  owner is a BYPASSRLS superuser. **That is a design input, not a bug**: any future
  policy on `audit_logs` will constrain _readers_ but not this writer, which is
  what you want for an audit sink;
- `current_setting('audit.user_id'/'audit.company_id', true)` still reads the
  transaction's GUCs — `SECURITY DEFINER` changes the privilege context, not the
  settings — so attribution keeps working exactly as today.
- Trigger functions are invoked by the trigger mechanism, so no `EXECUTE` grant is
  needed by the caller.

**Verdict: the audit trail survives the switch unchanged.**

### Q7.2 The column that is lying about its name

LOCAL DB — `\d audit_logs`:

```
id        | uuid                        | not null
tableName | text                        | not null
operation | text                        | not null
oldData   | jsonb                       |
newData   | jsonb                       |
userId    | uuid                        |
tenantId  | uuid                        |
createdAt | timestamp(3) without tz     | not null | CURRENT_TIMESTAMP
Indexes:  "audit_logs_pkey" PRIMARY KEY, btree (id)
```

The trigger writes `audit.company_id` into the column named **`tenantId`**
(migration `:36`, the `NULLIF(audit_company_id, '')::uuid` value lands in the
`"tenantId"` slot). The application agrees with the trigger and not with the name —
`audit/audit.service.ts:10`, `:19`, `:28` all filter `where: { tenantId: companyId }`.

**So the table already carries company scope; it is stored under a misleading
name.** That materially cheapens the isolation design below: no backfill from JSON
is needed, only a rename or an alias.

Two more facts for the design:

- LOCAL DB: **707** rows, **265** with `tenantId` NULL. Rows written outside
  `executeWithRls` have no company at all, so any policy keyed on that column must
  decide what happens to them (invisible to everyone is the safe default;
  today they are visible to anyone who can read the table).
- The only index is the primary key — any policy or query keyed on
  `tenantId`/`createdAt` would be a sequential scan.
- **There is no HTTP surface today.** `modules/audit/` contains only
  `audit.module.ts`, `audit.service.ts` and `audit.spec.ts` — no controller — and
  a repo-wide grep for `AuditService` outside that directory returns **nothing**.
  The service is written, exported, and consumed by no one. The exposure is
  therefore "at rest", exactly as HARDEN-000 recorded.

### Q7.3 How the isolation should work — design, not implementation

The building blocks, in dependency order:

1. **Fix the name before the policy.** Either rename `tenantId` → `companyId` (a
   migration plus the three `audit.service.ts` filters plus the trigger body), or
   deliberately keep the name and document that it holds a company id. Writing a
   policy against a column whose name contradicts its contents guarantees a future
   reviewer gets it wrong. This is the cheapest high-value step and it is
   independent of the role switch.
2. **Then the policy.** `ENABLE ROW LEVEL SECURITY` on `audit_logs` with
   `USING (<company column> = current_setting('rls.company_id', true)::uuid)` — the
   house standard, matching the other 87. Because the writer is `SECURITY DEFINER`
   owned by a bypass role (Q7.1), enabling this does **not** break the trigger.
   Rows with a NULL company become invisible to every non-bypass reader, which is
   the conservative outcome.
3. **Decide what `app_user` may do to it at all.** The strictest option is to keep
   the table readable only by the migrator/owner role and `REVOKE` from `app_user`
   entirely — viable _today_ precisely because nothing reads it (Q7.2). That
   converts the whole question into a non-issue until someone builds an audit
   viewer, at which point the policy in step 2 becomes the prerequisite for that
   feature rather than a retrofit.
4. **Index whatever the policy keys on**, or accept sequential scans on a table
   that grows with every write to 83 tables.
5. **The tenant-vs-company question that the rename exposes.** If a tenant ever
   holds more than one company, an audit policy keyed on company means a
   tenant-level auditor cannot see across their own companies. That is a business
   decision, not a technical one, and it belongs in the decisions list.

---

## Q8 — Staged rollout

### Q8.1 What can be tested locally today, in dependency order

Every step below is local-only and reversible. Steps 1-2 are the founder's
(`ALTER ROLE`/password); the rest can be executed by anyone once those exist.

1. **Give the local `app_user` a password** — founder, local instance only.
   Precondition for everything else; LOCAL DB confirms it has none today (Q2.2).
2. **Prove the policies bite** — open a session as the local `app_user` and run the
   four-statement check from Q2.3 (`count` without GUC → expect 0; `SET LOCAL`
   inside a transaction → expect 1). Until this passes, nothing else is meaningful.
3. **Re-run the Q3 privilege sweep as measured here**, but against a database whose
   objects were created the way production's were, to confirm no gap appears.
4. **Boot the API against `app_user` locally** with the existing code, and record
   the failure list: it should reproduce Q1 (`/auth/me` returns
   `companies: []`), Q4 (empty reads), Q3.3 (MV refresh errors), and the write
   rejections. **A rollout whose first local boot does _not_ fail in all four ways
   has not actually enabled RLS** — that is the single best sanity check that the
   test is real.
5. **Then, and only then**, iterate on whichever context mechanism the founder
   picks (Q1.3 / Q4.3), re-booting against `app_user` after each module until the
   failure list is empty.
6. **Full role matrix, per module, against `app_user`** — the same
   endpoints × roles matrix the arc has used since HARDEN-001, with every cell
   expected 2xx on the caller's own company.
7. **Cross-tenant test** — the BEFORE/AFTER header swap. See Q8.3: this is the step
   that currently cannot be run reproducibly.

**Rollback, stated explicitly:** production's runtime identity is one Railway
variable on the **api** service. Reverting `DATABASE_URL` to the `postgres` URL and
redeploying restores the current posture completely — no migration, no schema
change, no data change is involved in the switch itself. Any migration that
_accompanies_ HARDEN-004 (an `audit_logs` policy, an MV ownership transfer) is
**not** covered by that rollback and needs its own down-path. Keeping the switch
deploy free of migrations is what makes the one-variable rollback true.

### Q8.2 What cannot be tested today

- **Production's role names and flags.** `postgres` vs `excelsia`, and
  `app_user`'s production password state, are **NOT VERIFIED** — production is out
  of bounds for this recon. Everything in Q2/Q3 measured locally must be re-run
  there by the founder.
- **Production's `pg_default_acl` row** (Q3.2) — keyed to the production migrator
  role. Not verifiable from here.
- **Pool-leak behaviour under real concurrency.** The leak in Q5.2 is a property of
  pooled connections under load; a single-developer local instance will not
  reproduce it reliably. Any new context mechanism needs an explicit concurrency
  test (two interleaved requests for different companies on a small pool),
  which does not exist in the repo today.
- **An end-to-end RLS assertion — and here the repo makes a claim it does not
  keep.** `common/rls/rls.security.spec.ts:19-23` states that the
  "Company A data not visible when RLS set to Company B" criterion "lives as a
  standalone script (kept out of Jest via testPathIgnorePatterns)". The only entry
  in `apps/api/jest.config.ts:12` is
  `['<rootDir>/src/modules/audit/audit.spec.ts']`, and a repo-wide search for an
  RLS script finds **no such file**. The existing spec is a unit test with a
  **mocked** `$transaction` (`rls.security.spec.ts:35-43`) — it proves the app
  emits the right `SET LOCAL` strings, and cannot prove PostgreSQL honours them.
  **There is currently no test in this repo that would fail if RLS stopped
  working.** The nearest thing is `modules/audit/audit.spec.ts`, a standalone
  ts-node program against a real database (`audit.spec.ts:11`), deliberately
  excluded from the Jest run.

### Q8.3 The test-substrate debt

Recorded in `CLAUDE.md` and re-verified here:

- **One company.** `prisma/seed.ts` creates a single demo company.
- **Five of six roles.** `admin@excelsia.dev` (ADMIN, `seed.ts:40`/`:73`) plus
  `manager`/`accountant`/`analyst`/`viewer@excelsia.dev` (`seed.ts:86-89`), all
  behind `NODE_ENV !== 'production'` (`seed.ts:84`). **SUPER_ADMIN is absent** —
  though SUPER_ADMIN and ADMIN are byte-identical branches in the factory
  (`casl-ability.factory.ts:501-507`), so the CASL risk is nil and the gap is about
  role-string coverage.
- **No foreign-company fixture.** "HARDEN-001 Foreign Co" appears in
  `docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING.md` and **nowhere else** in the repo;
  `SECURITY_AUDIT.md`'s "Empresa Test" is equally absent. Both exist only as rows
  in one local database.
- **A second local wrinkle:** `docker-compose.yml:1-19` defines container
  `excelsia-postgres`, but `.env` points at `localhost:5434`, which is a different
  running container (`excelsia-dev-postgres`); the compose container answers on 5433. Anyone reproducing this work must confirm which database they are on.

**What HARDEN-004's verification would require to be reproducible**: a seed (or a
fixture script) that creates a **second company with zero memberships for the
primary user**, plus a SUPER_ADMIN membership, both guarded by
`NODE_ENV !== 'production'` in the same idiom as `seed.ts:84`. Without it, the
arc's signature evidence — `200` → `403 'No active membership for this company'` on
a foreign `x-company-id` — cannot be re-derived by anyone but the person whose
laptop holds the row. Creating that fixture is a **write** to `seed.ts` and is
therefore out of scope for this recon; it is in the decisions list.

---

## Verdict table

| Q     | Question       | What today's evidence shows                                                                                                                                                                                                                                                                                        | Blocking for HARDEN-004?            |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **1** | Bootstrap knot | `/auth/me` (`auth.service.ts:94-118`) reads `memberships`+`companies` with no GUC and is **upstream of the guard**; under `app_user` the company selector returns empty and the product is unreachable. 16 identity/tenancy reads outside `executeWithRls`, plus 15 notification lookups and 3 cron company sweeps | **YES — hard blocker**              |
| **2** | Credential     | `CREATE ROLE app_user LOGIN` with **no PASSWORD** is the only provisioning statement in 77 migrations; LOCAL DB `pg_authid` confirms `rolpassword IS NULL`. A `DATABASE_URL` on `app_user` would fail at connect                                                                                                   | **YES — founder action**            |
| **3** | GRANTs         | **No privilege gaps** on the local substrate: all 91 tables and 4 MVs carry all four verbs; schema `USAGE` present, `CREATE` absent; the single sequence has the `USAGE` it needs. The one real gap is **MV ownership** — `REFRESH` requires it and `app_user` lacks it                                            | Partly — MV refresh breaks          |
| **4** | GUC-less reads | **810** direct read call sites in **116** files vs **318** `executeWithRls`; ~500 of 578 handlers would return nothing; 48 direct writes would **error** (all policies `FOR ALL`, `with_check IS NULL`); 37.5% of local `audit_logs` rows already have no company context                                          | **YES — this is the campaign**      |
| **5** | Pool           | Bare `PrismaClient`, no middleware, no datasource override, one pool. A non-`LOCAL` `SET` **does** leak across requests on a pooled connection; `SET LOCAL` in `$transaction` is the only safe form; `set_config(...,true)` is the parameterised alternative                                                       | Design constraint                   |
| **6** | Migrator split | One `startCommand`, one URL (`railway.json:8`). Unsplit, a future migration runs as `app_user` and **fails at the first DDL** (no `CREATE` on `public`) → boot loop. The `ALTER ROLE ... BYPASSRLS` pattern would **not** self-grant bypass (superuser-only; the `EXCEPTION` handler catches it)                   | **YES — before the next migration** |
| **7** | `audit_logs`   | Trigger is `SECURITY DEFINER` owned by a superuser → **keeps working** under `app_user`, and would keep working under a future policy. The `tenantId` column actually holds a **company** id (trigger `:36`; `audit.service.ts:10`). No controller, no consumer — zero HTTP exposure today                         | No — but design it now              |
| **8** | Rollout        | Local testing is possible after the founder sets a **local** password; rollback is one Railway variable. **No test in the repo would fail if RLS stopped working**; `rls.security.spec.ts:19-23` points at a standalone script that does not exist; no reproducible foreign-company fixture                        | Verification gap                    |

---

## Risks — by severity

1. **CRITICAL — the switch alone bricks the product.** Q1 + Q4 compound: an empty
   company selector at `/auth/me`, ~500 read endpoints returning nothing, and 48
   write paths throwing RLS violations. Flipping `DATABASE_URL` without the read
   campaign is not a partial improvement; it is an outage. The mitigating fact is
   that Q2 makes it _impossible to do by accident today_ — with no password, the
   connection fails at boot rather than half-working.

2. **CRITICAL — silent failure modes outnumber loud ones.** Reads return `[]`, cron
   sweeps loop zero times, notifications find zero recipients. None of these raises
   an exception, so Sentry stays quiet and the API returns `200`. The loud failures
   (write rejections, MV refresh errors) are the _lucky_ ones. Any rollout plan
   that relies on "we'll see errors if something's wrong" is mis-calibrated; the
   check must be positive assertions that data is present, per role, per module.

3. **HIGH — the pool shortcut.** The obvious fix for Q1/Q4 is "set the GUC once per
   request". Done without `LOCAL` and without a pinned connection, it manufactures
   a cross-tenant leak that is invisible in logs and worse than the posture the arc
   started from. This risk lives in the _fix_, not in the current code, which is
   exactly why it is written down before the fix is designed.

4. **HIGH — a migration shipped before the migrator split causes a boot loop.**
   Once `DATABASE_URL` is `app_user`, the next migration to land fails at its first
   DDL and takes `&&` down with it. The window opens the moment the switch happens
   and stays open until `railway.json:8` is split.

5. **MEDIUM — MV refresh stops.** `REFRESH MATERIALIZED VIEW` needs ownership;
   `app_user` has none. Dashboards silently freeze at the last successful refresh
   while continuing to render, which reads as "the data is stale" rather than "the
   job is broken" — and the four MVs are precisely the surface that has **no RLS
   backstop at all**, so their correctness rests entirely on the application filter
   plus the `@CheckPolicies` membership check.

6. **MEDIUM — no test would catch a regression.** Q8.2: the end-to-end RLS check
   referenced in `rls.security.spec.ts:19-23` does not exist, and the unit spec
   mocks the database. After HARDEN-004 there would still be nothing that fails if
   the context mechanism silently stops working.

7. **MEDIUM — `audit_logs` remains a cross-tenant sink.** No policy, no
   `companyId`-by-name, 37.5% of local rows with no company at all, and one index.
   Not exposed today (no controller, no consumer), so the risk is at rest — but the
   first audit-viewer feature turns it into a live leak unless the design in Q7.3
   lands first.

8. **LOW — `SECURITY DEFINER` without a pinned `search_path`.**
   `audit_trigger_function` has `proconfig` NULL (LOCAL DB) and references
   `audit_logs` unqualified while running as a superuser. The classic hijack needs
   the caller to create a shadowing object in an earlier `search_path` schema;
   `app_user` cannot (`CREATE` on `public` = false, and no `app_user` schema
   exists), so this is **defused today**. It would re-arm if anyone granted
   `app_user` create rights anywhere in its search path. Adding
   `SET search_path = public, pg_temp` to the function would close it permanently.

9. **LOW — `executeWithRls` still interpolates.** `rls.service.ts:23-30`. Latent
   (callers validate), and `set_config(name, value, true)` removes it whenever that
   file is next touched.

---

## Decisions left to the founder

Every one of these is a business, security or production decision. None was made
here, and none should be made by a Claude Code session.

**Blocking HARDEN-004:**

1. **The bootstrap mechanism** — Option A (early GUC from the header), B1
   (dedicated privileged connection), B2 (`SECURITY DEFINER` identity function),
   or C (re-keyed policies), or a combination. Q1.3 costs each; the pool
   requirement in Q5.2 constrains all of them.
2. **The read-context mechanism for the other 810 call sites** — the same families,
   at ~2.5× the scale of the entire existing RLS surface. This is the size of
   HARDEN-004 and determines whether it is one ticket or a per-module arc.
3. **`app_user`'s production password** — whether to set it, when, and where the
   secret lives (Railway variable store only, or also a password manager). The
   `ALTER ROLE` is a founder-executed production write (Q2.3).
4. **Migrator identity** — reuse the current privileged role, or create a dedicated
   migrator. If dedicated: whether to add `ALTER DEFAULT PRIVILEGES FOR ROLE
<migrator>` so the second layer of grant coverage survives (Q6.3).
5. **How the split is expressed** — a second Railway variable plus a two-URL
   `startCommand` in `railway.json:8` is the shape the evidence implies; the
   variable's name and whether the migrate step moves out of the start command
   entirely are open.

**Blocking honest verification:**

6. **The test fixture** — whether to add a second company (zero memberships) and a
   SUPER_ADMIN to `prisma/seed.ts` under the existing `NODE_ENV` guard, so the
   arc's cross-tenant evidence becomes reproducible from the repo (Q8.3).
7. **Whether an end-to-end RLS test becomes a gate** — and whether it runs in CI
   (which today touches no database) or stays a standalone script like
   `audit.spec.ts`. Also whether to correct the claim at
   `rls.security.spec.ts:19-23`, which currently points at a file that does not
   exist.

**Design decisions that can land independently:**

8. **MV ownership** — transfer the four MVs to `app_user`, wrap `REFRESH` in a
   `SECURITY DEFINER` function, or move refresh out of the API process (Q3.3).
9. **`audit_logs` isolation** — rename `tenantId` → `companyId` (or document the
   name), add a policy, or revoke `app_user`'s access outright while nothing reads
   it. Plus the tenant-vs-company scoping question if a tenant ever holds more than
   one company (Q7.3).
10. **`SET search_path` on `audit_trigger_function`** — cheap, permanent, currently
    defused but not closed (risk 8).
11. **`set_config` instead of interpolation** in `executeWithRls` — whenever that
    file is next opened (risk 9).

**Production facts a founder query must confirm before HARDEN-004 begins** (all
measured locally here, none verifiable from this session):

12. `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, (rolpassword IS NOT NULL)
FROM pg_authid WHERE rolname IN ('app_user','postgres');`
13. `SELECT pg_get_userbyid(defaclrole), defaclobjtype, defaclacl FROM pg_default_acl;`
    — confirm the default-privilege row exists and which role it is keyed to.
14. The per-relation privilege sweep of Q3.2, to confirm production has the same
    zero gaps.
15. `SELECT relname, pg_get_userbyid(relowner) FROM pg_class ... WHERE relkind='m';`
    — confirm MV ownership matches.

---

_Read-only recon. The single filesystem change from this ticket is the creation of
`docs/HARDEN-003-ROLE-SWITCH-RECON.md`. No code, schema, migration, environment
variable or production resource was modified. The only database contact was
read-only `SELECT` statements against the local dev instance, never as `app_user`._
