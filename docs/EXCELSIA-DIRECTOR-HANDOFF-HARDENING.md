# Excelsia — Director Handoff: the Hardening Arc (roles, access, tenant isolation)

**Written by:** the outgoing technical director, 2026-08-04
**For:** the incoming technical director (and a fresh Claude Code session)
**HEAD at handoff:** `66e7758` — `fix(operations): gate the four open calendar endpoints (HARDEN-002)`
**Migrations:** 77, all applied in production
**Branch:** `develop` = production (Railway auto-deploy)

> **Precedence rule (house doctrine).** This handoff is a dated snapshot. Where it
> disagrees with `CLAUDE.md`, **`CLAUDE.md` wins** — it is the living institutional
> memory. Same rule applies to every recon and audit doc in `docs/`: they are
> snapshots of the day they were written and are never retro-edited.

---

## 1. The working contract (read this first)

- **Pato (founder) is the ONLY human git gate.** He commits, he pushes, he touches
  production. The director never runs git, never edits production env vars, never
  writes product code — even when a tool would allow it.
- **The director designs, writes the CC prompts, and reviews adversarially.** Every
  CC self-report is checked _against the real repo files_ before a commit block is
  issued. Raw evidence beats any claim. Corrections are issued pre-commit.
- **Claude Code (CC) implements.** Every CC prompt opens verbatim with:
  _"Read the CLAUDE.md file carefully before doing anything. Do not run any git
  commands."_
- **Language:** conversation in rioplatense Spanish (voseo); code, commits, docs and
  CC prompts in English. One deliberate exception exists and is recorded:
  `docs/MATRIZ-DE-PERMISOS.md` §7 is in Spanish because it is business-facing.
- **Business decisions are the founder's.** The director records them, dated.
- **One commit per ticket**, conventional commits. `git add -A` is reserved for
  ticket commits; docs commits name files explicitly.
- **Rituals after every push:** verify linear history (`Github:list_commits`,
  `perPage: 2`, `sha: develop`), then Railway deploy status; when the push carries a
  migration, hunt the literal `Applying migration <name>` line in the api deploy
  logs before moving on.

**Verification toolbox**

| Tool                                                                                 | Use                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `Github:get_file_contents` (`ref: refs/heads/develop`)                               | current production state of any file                 |
| `Github:search_code` (`repo:pato0510/erp` + a distinctive string)                    | prove a negative, find every call site               |
| `Github:list_commits` (`perPage: 2, sha: develop`)                                   | linear-history check                                 |
| `Railway:get-status` / `Railway:get-logs` (`types: ["deploy"]`, `filter: migration`) | deploy state + the migration line                    |
| Railway → Postgres → **Data** tab                                                    | the founder runs read-only SQL himself (SELECT only) |

---

## 2. Where the system stands

Seven modules live in production, zero rollbacks: **Finanzas · Operaciones · RRHH ·
Comercial · Marketing · Calendario de Actividades · HSEC**.

Stack: NestJS + Next.js (Nx monorepo), PostgreSQL 16 with RLS, Prisma (multi-file
schema), CASL, Cloudflare R2, Railway.

Closed on 2026-08-03/04, in one working stretch:

- **HSEC V1** — HSEC-000..011, 7 tables, 4 migrations (73–76), card un-gated.
- **OPS-038** — `procedure.acknowledgment-expired` was emitting with a composite
  `procedureId:userId` string into a `@db.Uuid` column, so `emit()` swallowed every
  row silently since OPS-032. Fixed to the acknowledgment's own UUID PK and **pinned
  in `domain-event-types.spec.ts`** so it cannot regress.
- **PLAT-001** — `SentryExceptionFilter` only read `exception.message`, so
  class-validator constraint messages never reached the client **platform-wide**.
  Now reads `getResponse()` and joins arrays with `' · '`.
- **R2 credential rotation** — closed and verified (new token, Object Read & Write
  scoped to the bucket, old token revoked and re-verified after revocation).
- **FASE 0 / SII** — verified against production: `tax_sync_runs` has exactly one
  provider in its entire history, `baseapi` (318 runs, 300 successful, 2.059 docs,
  last run 2026-08-03). `tax_documents` (2.046 rows) returned **zero** on all three
  mock fingerprints. **TAX-001** then dropped the latent `DEFAULT 'mock-sii'`.
- **HARDEN-000/001/002** — see §4.

---

## 3. What we learned about roles and access (the core of this handoff)

### 3.1 Permission lives in TWO layers, and they can disagree

1. **The CASL ability** — what a role may do in the abstract
   (`apps/api/src/modules/common/casl/casl-ability.factory.ts`, ~717 lines).
2. **The per-endpoint decorator** — whether the endpoint actually asks
   (`@CheckPolicies` + `PoliciesGuard`).

**A matrix built from layer 1 alone is wrong exactly where it matters.** This is not
theoretical: thirteen endpoints shipped with a correct-looking CASL story and no
gate at all.

### 3.2 `PoliciesGuard` fails OPEN — verified byte-exact

`common/guards/policies.guard.ts:17-20` returns `true` when a handler carries no
`@CheckPolicies` — and it does so **before** the user check, **before** the
`x-company-id` check and **before** the membership lookup. So an ungated handler
runs with **zero tenant validation**.

The guard is registered **per controller** via `@UseGuards`, not globally.
Consequence learned the hard way in HARDEN-002: on a controller that only has
`@UseGuards(JwtAuthGuard)`, adding `@CheckPolicies` **does nothing** — no guard
reads it. Both must be present.

### 3.3 Tenant identity comes from a client-controlled header

`TenantMiddleware` and the `@CurrentCompany` decorator take `x-company-id` **raw,
unvalidated**. The only place membership is verified is inside `PoliciesGuard` —
which is skipped on ungated routes. Hence: ungated + `@CurrentCompany` = any
authenticated user can name any company.

### 3.4 The role baselines (verified twice, in two Step-0 audits)

| Role        | Baseline                                            | Consequence                                           |
| ----------- | --------------------------------------------------- | ----------------------------------------------------- |
| SUPER_ADMIN | `can('manage','all')`                               | everything; **never** receives a `cannot()`           |
| ADMIN       | `can('manage','all')`                               | same                                                  |
| MANAGER     | `can('read','all')` + per-module floors + re-grants | the working role, broad CRUD                          |
| ACCOUNTANT  | `can('read','all')` + floors                        | full financial read incl. payroll; **writes nothing** |
| ANALYST     | `can('read','all')` + floors                        | read, no amounts in post-Finanzas modules             |
| VIEWER      | **grant-by-enumeration** (no `read all`)            | every new subject must be granted explicitly          |

**The VIEWER lesson, twice over:** because VIEWER has no blanket read, gating a
previously-open endpoint **locks VIEWER out** unless the same change adds the grant.
Both HARDEN-001 and HARDEN-002 needed exactly one grant, both for VIEWER. **Any
future gating ticket must audit this before editing anything** (the "Step 0 audit,
stop if needed" pattern — reuse it verbatim).

### 3.5 The false premise that spread through the codebase

Multiple controllers justified leaving reads open with a comment saying, in effect,
_"RLS still scopes data to the company."_ **That premise is false at runtime**, for
three independent reasons:

1. The app connects as a **BYPASSRLS superuser** (see 3.6).
2. RLS is `ENABLE`, not `FORCE`.
3. Several of those reads hit **materialized views**, which PostgreSQL cannot
   subject to RLS at all.

When you find that comment anywhere else, treat it as a red flag, not a
justification. The membership check is the only tenant boundary on those surfaces
today.

### 3.6 The database roles — settled by query on 2026-08-04

```
app_user   rolsuper=false   rolbypassrls=false   rolcanlogin=true
postgres   rolsuper=true    rolbypassrls=true    rolcanlogin=true
```

- The role `excelsia` **does not exist** (the query returned 2 rows, not 3). Two old
  docs disagreed about the runtime user; this settles it — **the app connects as
  `postgres`**, superuser with bypass, so **every RLS policy is inert today**.
- **`app_user` is correctly provisioned and can log in** — no superuser, no bypass.
  The `SECURITY_AUDIT.md` V2 note claiming `app_user` carries BYPASSRLS is **wrong**;
  do not design on it.
- Because `app_user` does not own the tables, **`ENABLE` is sufficient — `FORCE` is
  not required** (FORCE only matters so a table's _owner_ cannot skip its own
  policies).

**Net: the missing piece for real tenant isolation already exists and has simply
never been plugged in.**

### 3.7 RLS coverage and its holes

- **87 of 90** business tables carry a policy — `ENABLE ROW LEVEL SECURITY` and
  `CREATE POLICY` are a perfect 1:1 set at **87 each**, and `FORCE` appears **zero**
  times anywhere. None of the 3 remaining tables has a `companyId` column to scope
  on (`audit_logs` carries `tenantId` instead), which is why the gap below needs a
  design and not a copy-pasted policy.
- 3 tables have none: `users`, `tenants` (no `companyId` column, by nature) and
  **`audit_logs`** — which stores `oldData`/`newData` for every company with no
  isolation. That is a real gap needing its own design.
- 4 materialized views, all carrying `company_id`, all filtered in the application
  layer (`WHERE company_id = $1::uuid`). On an ungated endpoint that parameter is
  the attacker-supplied header, which is why they were the sharpest edge of the
  dashboard hole.
- **Writes** go through `RlsService.executeWithRls`, which sets the `rls.company_id`
  setting. **Reads mostly do not** — they are direct Prisma calls. This is the
  central risk of the next ticket (§5).

### 3.8 The signed business exceptions (never "fix" these without a dated decision)

- **VIEWER keeps money in caja/movimientos/compromisos** — founder decision
  2026-07-15. It is the founding exception, not a bug.
- **ACCOUNTANT reads full payroll** (sueldos, liquidaciones, finiquitos) because in
  Chilean practice the accountant prepares them. **Strictly read-only.**
- **HSEC is MANAGER/ADMIN/SUPER_ADMIN only** — health-adjacent PII, 2026-07-27.
  The other three roles get nothing.
- **Calendario de Actividades runs the inverted, open-read matrix.**
- **Leaf read-modules** (six now: RrhhBirthdayRead · RrhhAbsenceRead · OpsCalendarRead
  · ComercialCierresRead · AttributionRead · RrhhEmployeeRead) import nothing and
  expose narrow structural contracts — e.g. birthdays carry day/month but never the
  year; ausencias carry dates but never category/motivo/folio; the roster leaf
  carries exactly `{ employeeId, fullName }`. **Widening any leaf contract requires a
  new dated founder signature** in the service header and in `CLAUDE.md`.

---

## 4. The hardening arc so far

| Ticket            | What it did                                                                                                                                         | Status       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **HARDEN-000**    | Read-only recon of the pre-tenant-2 posture → `docs/HARDENING-RECON.md`                                                                             | ✅ `17269d6` |
| **DOC-PERMS-001** | The permission matrix → `docs/MATRIZ-DE-PERMISOS.md` (94 controllers swept)                                                                         | ✅ `a707e8f` |
| **HARDEN-001**    | Gated the **9** open Operations dashboard endpoints + VIEWER grant + corrected the false comment                                                    | ✅ `18d7473` |
| **HARDEN-002**    | Gated the **4** open Operations calendar endpoints, **registered `PoliciesGuard`** (it was absent), + VIEWER grant, + corrected `SECURITY_AUDIT.md` | ✅ `66e7758` |

**The evidence pattern that made these tickets trustworthy** — reuse it:

1. **Step 0 audit first, stop if needed** (who would be locked out by gating?).
2. **BEFORE/AFTER on the same request** with a foreign `x-company-id`: `200` →
   `403 'No active membership for this company'`. A dev fixture company named
   **"HARDEN-001 Foreign Co"** (zero memberships) exists for exactly this.
3. **A full no-regression matrix** (endpoints × roles, own company, every cell 2xx).
   If a cell 403s: **stop**, do not loosen the gate.
4. Missing-header → `403 'x-company-id header is required'`.
5. Specs extended, full api suite green, migration count unchanged.

The sharpest single piece of evidence in the whole arc: before HARDEN-002, the
calendar's `export` endpoint returned another company's full calendar as a
**downloadable `.ics` file** to a non-member. After: 403.

---

## 5. What is left — the next director's mission

### 5.1 HARDEN-003 — recon of the database-role switch (do this FIRST, read-only)

**Goal:** know exactly what breaks before changing the runtime connection from
`postgres` to `app_user`.

Why it is the riskiest change of the arc: with RLS actually enforced, **any read
that never sets `rls.company_id` returns zero rows**, and any missing GRANT throws.
Reads are mostly plain Prisma calls today, so the blast radius is potentially the
whole product.

The recon must answer, with `file:line` citations and migration greps:

1. **GRANT inventory** — for the **87 policied tables** (of 90 business tables), plus
   sequences and the 4 materialized views: does `app_user` hold
   SELECT/INSERT/UPDATE/DELETE? Name every gap. (Every table migration since the
   house template includes a 4-verb GRANT — verify the _older_ tables specifically.)
   **The 3 policy-less tables are in scope for this inventory too**: `users`,
   `tenants` and `audit_logs` carry no policy, but `app_user` still needs the GRANT
   to read them at all — and login, tenancy resolution and the audit trigger all
   depend on them.
2. **Where `rls.company_id` is set** — quote `RlsService.executeWithRls` exactly:
   what it sets, on which connection, and whether the setting survives outside the
   transaction (`SET LOCAL` does not).
3. **Where it is NOT set** — enumerate read paths that call Prisma directly. Estimate
   how many endpoints would go blind. This number decides whether HARDEN-004 is a
   connection-string change or a code campaign.
4. **Prisma connection pooling** — whether a per-request `SET` can leak across
   requests on a pooled connection, and what the safe pattern is.
5. **Migrations** — `prisma migrate deploy` runs on boot and needs DDL rights that
   `app_user` must not have. Confirm the migrator/runtime split (the historical
   `railway.json --rolled-back` clause is **gone**; the start command is now plain
   `migrate deploy && node …`).
6. **`audit_logs`** — the trigger writes as the session role; verify it still works
   under `app_user` and design how the missing `companyId` isolation should work.
7. **A staged rollout plan**, including how to test with RLS on locally before
   touching production, and the rollback (revert one env var).

### 5.2 HARDEN-004 — the switch itself

Only after 5.1. Expect it to be a small env change plus whatever the recon says the
code needs. Treat it as the highest-risk deploy of the project: verify every module
end-to-end afterwards, per role.

### 5.3 Remaining ungated endpoints

`docs/MATRIZ-DE-PERMISOS.md` §4 is the authoritative inventory: **19 ungated
handlers of 94 controllers** — 6 legitimately public (health check, login/logout/me/
refresh, anonymous QR scan) and 13 flagged for review, of which the 4 calendar ones
were closed by HARDEN-002. The rest still need a decision, including:

- **D3 — `operations/health` (2 endpoints)**: leak infra/cron topology to any
  authenticated user of any company. Low severity, easy fix.
- The remainder listed in §4 of the matrix.

### 5.4 Cleanup seeds (no urgency)

- **D2 — three dead CASL subjects** (`Tenant`, `MedicalLeave`, `SalaryRecord`):
  declared and granted, consumed by no endpoint.
- `SentryExceptionFilter` has **no spec** — create one when it is next touched
  (three branches: string, string[], non-HttpException).
- Small HSEC polish already recorded in `CLAUDE.md`.

### 5.5 Non-security work still open

- **Manuals:** HSEC (module is live and only the founder knows it) and Comercial.
- **V2 seeds:** ~70 items in `docs/EXCELSIA-TECHNICAL-HANDOFF.md`; **faena as an
  entity** is the highest-leverage one (it pulls HSEC, RRHH and Operaciones
  together via a per-faena required-document dossier).

---

## 6. Environment facts worth not re-discovering

- **R2 credentials live under `MINIO_*` variable names** — there are no `R2_*`
  variables. `storage.service.ts` is a single S3 client serving local MinIO and
  production R2 (`region: 'auto'`, `forcePathStyle: true`). Only the **api** service
  has them; **web** and CI do not. CI (`ci.yml`) uses only `NX_CLOUD_ACCESS_TOKEN`.
- The founder's **local** `.env` points `MINIO_ENDPOINT` at a foreign container from
  another project, so local uploads always exercise the DB-blob fallback branch.
  Harmless; production is unaffected.
- **File storage patterns:** incident attachments follow the WorkPermit convention
  (JSON array, max 5, base64 blob fallback inside the entry); trainings/EPP use the
  Procedure-shaped per-column variant with single-slot replace semantics.
- **Time doctrine:** "today" is the Chilean calendar date (`America/Santiago`), never
  UTC. Wall-clock times are `"HH:mm"` **strings** end-to-end. `@db.Date` values are
  UTC midnights and must be rendered with `timeZone: 'UTC'` or they show the previous
  day in Chile.
- **Binding ruling (still in force):** after every mutation, **refetch the shaped
  GET**; never consume a POST/PATCH response body as state. Reading `created.id` for
  navigation is the one allowed exception.

---

## 7. Suggested opening for the new CC session

```
Read the CLAUDE.md file carefully before doing anything. Do not run any git commands.

PROMPT 0 — Orientation for the hardening arc.

Read, in this order: docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING.md (this arc's
contract and findings), CLAUDE.md in full, docs/HARDENING-RECON.md and
docs/MATRIZ-DE-PERMISOS.md. Then report, READ-ONLY, creating and modifying
nothing:

1. Environment evidence: `npx prisma migrate status` (expect 77, up to date)
   and the dev role users seeded in apps/api/prisma/seed.ts (read it, do not
   run it).
2. Confirm against today's code, with file:line quotes: (a) the PoliciesGuard
   fail-open branch; (b) that the Operations dashboard and calendar
   controllers are now gated AND both register PoliciesGuard; (c) that
   VIEWER holds explicit read grants on OperationsDashboardSubject and
   OperationsCalendarSubject.
3. Quote RlsService.executeWithRls verbatim and state exactly what it sets,
   with what scope, and on which connection.
4. Any discrepancy between the handoff/matrix and the code as it stands now.

Report only. No files, no fixes.
```

Do not let the new session start writing tickets before that orientation report has
been reviewed against the repo.

---

## 8. One closing note on judgement

Every serious finding in this arc came from **not trusting a document**: the
"nine ungated endpoints" claim was re-verified and turned out still true; the
`app_user` BYPASSRLS claim was re-verified and turned out **false**; the
"RLS scopes the data" comments were re-verified and turned out false; a security
audit that said _"reviewed every operations controller"_ had never seen the calendar
controller at all.

Read the code. Then decide.
