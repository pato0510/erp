# Excelsia — Director Handoff 2: the Hardening Arc, second leg

**Written by:** the outgoing technical director, 2026-08-05
**For:** the incoming technical director (and the Claude Code session they drive)
**HEAD at writing:** `f6855df` — HARDEN-004A
**Migrations:** 77 applied in production (a 78th exists **uncommitted** — see §1)
**Branch:** `develop` = production (Railway auto-deploy), zero rollbacks

---

## §0 Read order & precedence

Read in this order. Do not skip to the code.

1. **This file** — the entry point, and the only place the second leg of the arc is
   assembled in one piece.
2. **`CLAUDE.md`, in full** — the living institutional memory. **Where this handoff
   and `CLAUDE.md` disagree, `CLAUDE.md` wins.** Read § ARCO DE HARDENING closely;
   read the module blocks so you know what the platform already promises.
3. **`docs/HARDEN-003-ROLE-SWITCH-RECON.md`** — the deep evidence behind everything
   in §2(a) and §5. Frozen snapshot, dated 2026-08-04.
4. **For depth, as needed:** `docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING.md` (handoff-1
   — superseded as the entry point, intact as history),
   `docs/HARDENING-RECON.md`, `docs/MATRIZ-DE-PERMISOS.md`.

**Precedence rule (house doctrine).** Recon and audit documents in `docs/` are dated
snapshots and are **never retro-edited** — their staleness is recorded in `CLAUDE.md`
instead. **Live** documents are exactly two: `CLAUDE.md` and this handoff. Handoff-1
was live during the first leg and is now history; its in-place corrections remain
valid.

---

## §1 State at handoff

Seven modules in production: Finanzas · Operaciones · RRHH · Comercial · Marketing ·
Calendario de Actividades · HSEC. Stack: NestJS + Next.js (Nx), PostgreSQL 16 with
RLS, Prisma (multi-file schema), CASL, Cloudflare R2, Railway.

### The arc ledger

SHAs below are **director-verified via the GitHub API** and copied verbatim; a Claude
Code session cannot run git and must not attempt to derive them.

| Ticket         | What it did                                                                                                                       | SHA               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| HARDEN-000     | Read-only recon of the pre-tenant-2 posture                                                                                       | `17269d6`         |
| DOC-PERMS-001  | The platform permission matrix (94 controllers swept)                                                                             | `a707e8f`         |
| HARDEN-001     | Gated the 9 open Operations dashboard endpoints + VIEWER grant                                                                    | `18d7473`         |
| HARDEN-002     | Gated the 4 open calendar endpoints, **registered the missing PoliciesGuard**, + VIEWER grant                                     | `66e7758`         |
| —              | Handoff-1                                                                                                                         | `a95311f`         |
| DOC-HARDEN-001 | Documentation corrections (the 87/90 contradiction, the false `app_user` BYPASSRLS note, the "reviewed every controller" verdict) | `24c2796`         |
| HARDEN-003     | Read-only recon of the database role switch → `docs/HARDEN-003-ROLE-SWITCH-RECON.md`                                              | `fd40530`         |
| DOC-HARDEN-002 | Production verification + the founder's signed decisions                                                                          | `c9dfeeb`         |
| HARDEN-004A    | The SII sync's writes routed through `executeWithRls`                                                                             | `f6855df`         |
| DOC-HARDEN-003 | This handoff                                                                                                                      | pending at commit |

### The one uncommitted artifact — read this before you touch anything

`apps/api/prisma/schema/migrations/20260805120000_add_membership_user_read_policy/`
exists **only in the founder's working tree**. It is written, reviewed and verified,
and it is deliberately **not committed**. It is reproduced **in full in the Appendix**
of this handoff so it survives even if that working tree is lost.

**The rule, and it is not negotiable:** it does **not** ship until the
`company_self_read` decision (§4) is signed by the founder, and when it does ship the
second policy goes into the **same file**. One migration per problem, not one per
table. The problem here is "a user cannot bootstrap into the product"; that problem
takes two policies to solve, and shipping half of it produces a migration that fixes
nothing observable while claiming in its own comment block to fix the picker.

---

## §2 The roles — the definitive reference

Two planes. Keep them separate in your head and in your prompts: conflating them
caused real confusion during the first leg, and one dated document is wrong precisely
because of it.

### (a) DATABASE roles — verified in production 2026-08-05 by founder-run queries

| Role       | Flags                                                                      | Status                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | `rolsuper=t`, `rolbypassrls=t`                                             | **The current runtime role AND the migrator role.** This single fact is why the 87 RLS policies are inert today: a BYPASSRLS superuser is never subject to them.     |
| `app_user` | `rolsuper=f`, `rolbypassrls=f`, `rolcanlogin=t`, **`rolpassword IS NULL`** | Correctly provisioned, **never plugged in**, and **has no usable credential** — `rolcanlogin` says the catalog permits login, not that a password exists.            |
| `excelsia` | —                                                                          | **Does not exist in production.** It is the local docker-compose user only. `.env.example:24` and `:33-35` document it and are therefore **wrong about production**. |

Also verified in production on 2026-08-05:

- **Grant gaps: ZERO.** All 91 tables (90 business + `_prisma_migrations`) and all 4
  materialized views already carry SELECT/INSERT/UPDATE/DELETE for `app_user`. The
  universe matches local exactly: `r=91, m=4, S=1`. This **inverted** the recon's
  expectation — there is no GRANT work to do.
- **`pg_default_acl`**: one live row, keyed to **`postgres`**, `{app_user=arwd/postgres}`.
  It is why post-2026-04-17 tables are covered. It applies **only to objects created
  by `postgres`** — load-bearing for the migrator decision below.
- **The 4 MVs are owned by `postgres`.** `REFRESH MATERIALIZED VIEW` requires
  **ownership, not privilege**: under `app_user` the refresh breaks and **no GRANT can
  fix it**. Open item for the D piece.
- **Schema `public` for `app_user`**: `USAGE=true`, `CREATE=false`. Confirms the
  boot-loop hazard is real: a future migration running as `app_user` fails at its
  first DDL.

**The three signed decisions (founder, 2026-08-05) — with their reasoning, because
the reasoning is what stops someone "fixing" them:**

1. **`app_user`'s password** — generated by a password manager, stored **only** in
   Railway's variable store (not duplicated in a personal manager), never typed,
   never pasted into a chat. Set on **LOCAL first** (to reproduce the four failure
   modes), on **PRODUCTION LAST**, at the end of the arc. _Reasoning:_ while the role
   has no credential, the switch is **impossible to make by accident** — a mis-set
   `DATABASE_URL` fails to boot instead of silently breaking the product. That safety
   net dies the moment the password exists, so it is created as late as possible. A
   lost copy costs nothing: `ALTER ROLE` regenerates it in seconds, so a backup copy
   buys nothing and doubles the leak surface.
2. **The migrator stays `postgres`.** The start command takes the privileged URL from
   a **second variable** for the migrate step; the app boots as `app_user`.
   _Reasoning:_ the `pg_default_acl` row is already keyed to `postgres` and verified
   working (zero gaps); a dedicated migrator would cost **four production writes**
   (create role, grant DDL, grant BYPASSRLS — which itself requires a superuser — and
   `ALTER DEFAULT PRIVILEGES FOR ROLE`) and would break that second layer of grant
   coverage. **Tenant isolation depends on the RUNTIME role, not the migrator.** A
   dedicated migrator is deferred to the V2 hardening backlog.
3. **The start-command split lands BEFORE or WITH the `DATABASE_URL` change, never
   after.** The boot-loop window opens the instant the switch happens.

### (b) APPLICATION roles — `UserRole`, which lives on `Membership`, never on `User`

Six roles. `User` has no role column; the role is a property of the membership, which
is why a user can hold different roles in different companies under V2.

| Role        | Baseline                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- |
| SUPER_ADMIN | `can('manage','all')` — never receives a `cannot()`                                            |
| ADMIN       | `can('manage','all')` — identical in practice                                                  |
| MANAGER     | `can('read','all')` + writes, minus per-module default-deny floors, re-granted after the floor |
| ACCOUNTANT  | `can('read','all')` + money writes, minus floors                                               |
| ANALYST     | `can('read','all')` + minimums, minus floors                                                   |
| VIEWER      | **no blanket read** — pure grant-by-enumeration                                                |

**The two-layer model.** A role's real power is the **intersection** of (a) its CASL
ability and (b) whether the endpoint actually asks. `PoliciesGuard` **fails OPEN** —
`policies.guard.ts:19` returns `true` when a handler carries no `@CheckPolicies`, and
it does so _before_ the user check, the `x-company-id` check and the membership
lookup. It is registered **per controller**, not globally, so **`@CheckPolicies`
without `@UseGuards(PoliciesGuard)` does NOTHING** — that cost us HARDEN-002.

**The Step 0 rule, as corrected.** Before gating any endpoint the question is **not**
"does this break VIEWER?" but: **for the SIX roles, does the ability say yes on this
Subject?** Two independent mechanisms lock a role out — VIEWER by enumeration (no
`read all` to inherit), and MANAGER/ACCOUNTANT/ANALYST by the default-deny floor
(`SUBJECTS.forEach(s => cannot(...))`) when the re-grant does not come _after_ the
floor, by last-rule-wins.

**ACCOUNTANT doctrine:** full financial read including payroll, **strictly
read-only** — liquidaciones and finiquitos are loaded from an external portal and
never edited in-app.

**`ENGINE_USER_ID`** = `'00000000-0000-0000-0000-000000000000'` is the **sanctioned
synthetic identity for cron writes** (OPS-022 precedent). It is already used at
`operations/exceptions/exceptions.service.ts:22`,
`operations/alerts/alert-escalation.service.ts:8` and
`operations/alerts/alert-engine.service.ts:31`. When the E piece needs an identity for
a background write, use this — do not invent a second convention.

**Seeded substrate — the debt that blocks honest verification.** `prisma/seed.ts`
creates **one company** and **five of the six roles** (no `SUPER_ADMIN`), the four
non-admin ones behind `NODE_ENV !== 'production'` (`seed.ts:84`). There is **no
foreign-company fixture in the repo** — "HARDEN-001 Foreign Co" exists only as a row
in a local database. The cross-tenant evidence the arc runs on is therefore **not
reproducible from the repo**. This blocks _verification_ of HARDEN-004, not its
design.

**For per-subject cells, go to `docs/MATRIZ-DE-PERMISOS.md`** — with the standing
caveat that its ungated count of 19 and its findings D1/D4 predate HARDEN-002.

---

## §3 Completed this session, with evidence

**DOC-HARDEN-001** (`24c2796`) — corrected handoff-1's self-contradicting RLS counts
(87 of 90, not 90), annotated `SECURITY_AUDIT.md` in place for the false `app_user`
BYPASSRLS suggestion and the "reviewed every operations controller" verdict that had
never seen the calendar controller, and closed OPS-038/PLAT-001 in `CLAUDE.md` as
done rather than queued.

**HARDEN-003** (`fd40530`) — the role-switch recon, then **closed with production
verification** on 2026-08-05: six founder-run queries covering role flags,
`pg_default_acl`, the per-relation privilege sweep, MV ownership, schema privileges
and `audit_logs`. Headline results are in §2(a): **zero grant gaps** (inverting the
recon's expectation) and **MV ownership by `postgres`** (the one hole no GRANT can
close).

**DOC-HARDEN-002** (`c9dfeeb`) — wrote the production verification and the three
signed decisions into `CLAUDE.md`, which had no record of the arc at all.

**The SII finding.** Production `audit_logs`: **7,342 rows**, of which **6,892
(93.9%)** carry no company context, spanning 2026-04-22 → 2026-08-05. The local figure
was 37.5% and the outgoing director assumed the local number was inflated by seed
data — **that assumption was wrong, and wrong in DIRECTION**: production is far worse.
But the per-table breakdown reversed the meaning entirely: `tax_documents` 4,131 ·
`movements` 2,072 · `counterparties` 351 · `users` 298 · then 40 rows across seven
tables. The first three are **one code path** (the SII sync: invoice → auto-created
movement → auto-created counterparty from RUT). `users` carries no RLS policy so its
298 survive the switch. Excluding them leaves 6,594 that would break, of which the SII
sync is **6,554 — 99.4%**. The remaining 40 are the April 2026 one-time setup.
**Writes were never a system-wide campaign; they were one named integration.** Two
caveats that must travel with the number: `audit_logs` records **writes only** (the
810 GUC-less _read_ sites are invisible in it), and the audit trigger covers **83 of
90** tables, so writes to the other seven do not appear at all.

**HARDEN-004A** (`f6855df`) — the SII sync's writes routed through `executeWithRls`.

- Six transaction scopes: run-create, default categories, **one per document for the
  document**, **one per document for its movement**, and the SUCCESS / FAILED run
  updates.
- **Per-document resilience signed** (founder, 2026-08-05): a failing document lands
  in `errors[]` and the loop continues; earlier documents stay committed.
- **The director's own one-transaction spec was corrected mid-ticket.** The first
  implementation wrapped `upsertDocument` and `createMovementFromDocument` in a single
  per-document transaction, which changed the counters: a document whose movement
  failed no longer persisted. That was wrong, because **a `tax_document` with no
  movement is a first-class designed state** — `isReconciled: false` feeds the
  `pendingReconciliation` counter that `getSummary` returns and the UI renders.
  Rolling the document back would make an invoice vanish from the product. The shape
  is now **two transactions per document**, and the counter semantics match
  pre-change behaviour in all four cases (document created + movement ok; created +
  movement fails; already existed; insert itself fails).
- **A pre-existing duplicate-movement bug closed:** `movement.create` and the
  `taxDocument.update` that links it were two unrelated statements; a failure of the
  second left an orphan movement whose document still had a null `movementId`, so the
  idempotency guard never fired and the next run created a **duplicate financial
  record**. Both now live in one transaction.
- **Idempotency verified in production by the founder**: re-syncing an already-synced
  period produced **pure skips** — no duplicate documents, no duplicate movements.
- **NOT exercised: the categorization-rules path.** No `CategoryRule` rows exist in
  production, so `applyRules` returns `null` on every call and every document takes
  the default-category branch. **The rules path remains unverified and must be
  re-checked when the first rule is created.**

**The COPEC forensic case.** A movement appeared with a non-default category and no
rule to explain it. Two audit queries against `audit_logs` resolved it: the row was
created at **00:19 with the system default category by a NULL user** (the SII sync,
which at the time wrote outside `executeWithRls` and so left no `audit.user_id`), and
then **recategorized at 00:29 by an identified user** — a human, in the UI. Zero
`CategoryRule` rows had ever existed. **What it proved, and this is why it is worth
recording:** the audit trigger genuinely works as the forensic layer (it answered a
question no application log could), and **`applyCategoryRules` has no hidden
heuristics** — it does exactly what it says, defaults when no rule matches, and the
anomaly was human action, not code.

---

## §4 Piece B state — where you pick up

### Signed

- **V1: one tenant = one company.** A user belongs to exactly one company.
- **V2: a tenant may hold several companies** (Chilean holdings); a user may then hold
  several memberships, always within their own tenant, **never across tenants**.
- **The schema already supports V2** — `getMe` returns a `companies` **array**, the
  frontend already has a **picker**, and `memberships` carries the composite unique
  `(userId, companyId)`. **Record this so nobody "simplifies" it away** on the grounds
  that today there is only one company.
- **Option 1 chosen for `memberships`:** a user-scoped, SELECT-only second policy,
  **over** a `SECURITY DEFINER` bypass function — that would have added a second
  privileged door to guard.

### B1 — written, uncommitted

The migration is quoted in full in the Appendix. It adds exactly one policy,
`membership_self_read`, `AS PERMISSIVE FOR SELECT USING ("userId" =
current_setting('rls.user_id', true)::uuid)`, and touches nothing else.

### B1-VERIFY — what was measured

- **Prisma emits THREE separate statements** for `getMe`, not a join: `users`, then
  `memberships`, then `companies` (`WHERE "id" IN ($1)`). Prisma 6.19.3, no
  `previewFeatures`, so no `relationJoins`. **This is the finding that decides
  everything**: `companies` is evaluated independently, under its own policy, with
  whatever GUCs exist — and in the `getMe` path `rls.company_id` cannot exist.
- **With `rls.user_id` set and `rls.company_id` unset:** on `memberships`,
  `membership_isolation` evaluates NULL and `membership_self_read` evaluates **true**
  → the permissive OR admits the row. On `companies`, `company_isolation` evaluates
  **NULL for every row** → statement 3 returns **zero rows**.
- **The `getMe` mapping dereferences `m.company.id` unconditionally**
  (`auth.service.ts:130`); measured against a null company it throws
  `TypeError: Cannot read properties of null (reading 'id')`.
- **NOT MEASURED:** whether Prisma returns `company: null` or drops the membership
  from the array when statement 3 yields nothing. The only role available locally has
  **BYPASSRLS, which is absolute** — even `FORCE ROW LEVEL SECURITY` would not make
  policies bite for it — and the FK forbids manufacturing a membership pointing at a
  missing company. So the failure _mode_ is open (500 vs blank picker); it does not
  change the conclusion.

**Finding: (b) — a second policy on `companies` is also required.** One policy is not
enough.

### THE PROPOSED — NOT APPROVED — SQL

Quoted verbatim as Claude Code proposed it. **This is a proposal. It is not signed.**

```sql
-- RLS — user-scoped READ on the companies a caller actually belongs to.
CREATE POLICY company_self_read ON companies
  AS PERMISSIVE
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m."companyId" = companies.id
        AND m."userId" = current_setting('rls.user_id', true)::uuid
        AND m."isActive"
    )
  );
```

**It carries THREE unsigned founder decisions. Do not let it ship until each is
answered explicitly:**

1. **Row-level means column-blind.** Granting the row grants **all eleven columns** of
   `companies` — `id, tenantId, name, taxId, legalName, currency, country, isActive,
settings, createdAt, updatedAt` — including the **`settings` JSON blob**. `getMe`
   uses three of them. The policy authorises all eleven to any query that asks.
2. **It widens beyond `getMe`.** Every request inside `executeWithRls(companyId,
userId)` sets **both** GUCs, so from that point `companies` is readable for **all**
   of the caller's companies, not just the one in `x-company-id`. Under V1 that is a
   distinction without a difference. Under **V2 it is a real product decision** — e.g.
   `tenancy.service.ts:23-25` (`findCompaniesByTenant`) is not company-filtered at the
   application layer and would start returning every company in the tenant that the
   caller belongs to.
3. **The `isActive` condition is Claude Code's choice, not the founder's.** It mirrors
   `getMe`'s own `where: { isActive: true }`. **Consequence:** deactivating a
   membership also removes visibility of that company's row — so any historical or
   audit view that resolves a company name for a deactivated member would go blank.

**Performance note:** the `EXISTS` runs per candidate row and is served by the
existing unique index `memberships_userId_companyId_key` on `("userId","companyId")` —
an index probe, no new index needed. It is paid on **every** `SELECT` on `companies`,
including ordinary company-scoped ones, since the planner may evaluate both arms of
the permissive OR rather than short-circuiting.

**No-recursion claim:** `memberships`' policies reference only GUCs and never
`companies`, so the `EXISTS` cannot recurse. **VERIFIED BY MEASUREMENT: NO** — this
was read off the policy text, not executed under live RLS. Treat it as reasoning.

### Claims the outgoing director did NOT independently verify

Claude Code produced these; the director reviewed the narrative but did **not**
re-run or re-read them against the repo. **Verify before you trust them:**

- the captured SQL of the three statements;
- the predicate measurements (`membership_self_read` true / `company_isolation` NULL);
- `tenancy.service.ts:23-25`;
- the recursion-safety claim;
- `iam.prisma:29-43` (the `Membership` model shape).

---

## §5 The signed plan

**HARDEN-004 is five pieces, in the order B → E → C → D** (signed 2026-08-05), with
**E promoted to BLOCKING before D**.

**B — the bootstrap knot.** Two policies, one migration (§4). B1 written; B2 is the
`companies` decision plus the finish ritual.

**E — the flows that die silently. BLOCKING.** Four cron sweeps —
**contracts**, **certifications**, **RRHH documents**, **alert escalations** — perform
company **discovery** by reading policied tables on a bare client. Under a live policy
that discovery returns zero rows, the loop body never executes, and **the job reports
success while doing nothing**. Add to that **`NotificationService`**, whose _writes_
are perfectly wrapped but whose **recipient resolvers** — `resolveRoleUsers`,
`resolveAlertRecipients`, and the asset reads inside `createForAssetBlocked` — run on
the bare client. The wrapper is therefore **unreachable**: the write never happens
because the read that feeds it found nobody.

**The doctrine, verbatim — the previous director's words, signed by the founder
(2026-08-05):**

> _"Una escritura correctamente envuelta no vale nada si la lectura que la alimenta no
> tiene contexto."_

**Audit FLOWS, not writes.** A per-write census — the shape HARDEN-004A used — would
mark `NotificationService` green. It is not green.

**The cross-tenant discovery question needs a redesign, not a wrapper.** These sweeps
are structurally cross-company: there is no single `companyId` to scope them to. The
shape to reach for is **enumerate companies first, then iterate with per-company
context** (`executeWithRls(companyId, ENGINE_USER_ID, …)` per iteration). Wrapping the
existing sweep in one transaction cannot work — there is no company to name.

**C — the read campaign.** **810 GUC-less read call sites across 116 files.** This is
**the only piece that needs a NEW mechanism**, and choosing it is a **founder design
decision that has not been taken**. The options and their costs — including what each
demands of the connection pool — are in `HARDEN-003-ROLE-SWITCH-RECON.md` §Q1.3 and
§Q4.3. Do not start C by writing code.

**D — the switch.** The start-command split plus the `DATABASE_URL` change. **LAST,
always**, and per the signed rule the split lands before or with it, never after.

---

## §6 Deferred ledger — one line each, nothing lost

- **The 7-item V2 hardening backlog** — already itemised in `CLAUDE.md`
  § Backlog de endurecimiento V2. Reference it; do not restate it.
- **UX-001** — uncategorized movements sorted last + collapsible. Mejoras sprint; the
  frontend freeze holds until then.
- **The mejoras sprint** — categories + the first categorization rules; an
  audit-history UI answering "who changed this category" (the COPEC question, made
  self-service).
- **`CompaniesService.getSettings` is an UPSERT disguised as a getter**, on a bare
  client — and it matches the 2 `company_settings` rows with no context in the
  production audit data.
- **The wrapped-write-behind-broken-read sweep** — the generalisation of E beyond the
  five sites already found.
- **Test-substrate debt** — a second company + a SUPER_ADMIN in `seed.ts`, dev-only,
  under the existing `NODE_ENV` guard. **Founder decision pending.**
- **`tax.service` cleanup** — four helpers should be `private` (they have no external
  callers), and the optional `tx?` parameter on `CategoryRulesService.applyRules` is a
  footgun: forget it and the call silently escapes its transaction.
- **The SII fecha-vs-período asymmetry** — documented behaviour, **not a bug**.
- **The rules-path verification** — pending the first `CategoryRule` (§3).
- **15 live ungated handlers** — 6 legitimately public + 9 under review (including the
  two `operations/health` info-leak endpoints).
- **R2 old-token revocation** — still unconfirmed.
- **FASE 0 SII provider verification** — the DB default was dropped in migration 77,
  but the **runtime** provider identity is still unverified.

---

## §7 Working agreement & session learnings

- **The ticket loop.** The director designs, writes the CC prompt, and reviews
  **adversarially**. Every CC self-report is checked against the real repo files
  before a commit block is issued. **Evidence beats claims.**
- **Verify `file:line` against the repo, always checking the END of ranges.** This is
  the demonstrated CC failure mode on this repo: a range whose start is right and
  whose end is wrong. It has happened more than once. Make CC state that it checked
  the end.
- **Commit discipline.** Docs commits name files explicitly; `git add -A` is reserved
  for ticket commits. **`apps/web/next-env.d.ts` is permanently dirty** — it is
  regenerated by Next.js on every build and **must never be staged**; if it appears in
  a diff, something used `add -A` when it should not have.
- **After every push:** verify linear history (`list_commits`, `perPage: 2`,
  `sha: develop`), then Railway deploy status. **When the push carries a migration,
  hunt the literal `Applying migration <name>` line in the api deploy logs** before
  moving on.
- **Corrections to CC travel as LABELLED VERBATIM BLOCKS with an explicit addressee,
  never as inline prose.** A correction was lost that way once during this session.
- **Every CC prompt ends with the mid-flight-correction protocol line** — apply it and
  say so, quoting before and after; a correction not applied must be reported as not
  applied.
- **CC report transport corrupted twice this session while the underlying files were
  clean.** When a report looks garbled, **request the raw file via `cat` before
  judging** the work. Do not re-run a ticket on the strength of a mangled report.
- **This CC session holds full context.** You may continue it, or re-orient a fresh
  one PROMPT-0 style — the pattern is in handoff-1 §7 and it worked well.

---

## §8 First hour checklist

1. **Verify HEAD and linear history** — expect `f6855df` plus whatever DOC-HARDEN-003
   lands as.
2. **Confirm with the founder that the uncommitted migration directory still exists**
   (`git status` — the founder runs it, never you and never CC). If it is gone, it is
   reproduced verbatim in the Appendix below.
3. **Re-verify the §4 unverified claims** against the repo — the captured SQL, the
   predicate measurements, `tenancy.service.ts:23-25`, the recursion-safety claim,
   `iam.prisma:29-43`.
4. **Take the `company_self_read` decision to the founder.** It is the single
   **blocking** decision: the three unsigned questions in §4. Nothing in B moves until
   it is answered.
5. **Finish B1** — both policies, one file, the full migration ritual (push, then hunt
   the `Applying migration` line).
6. **Then B2, then E.** E is blocking before D.

---

## §9 One closing note

Every serious finding in this arc came from **not trusting a document**: `app_user`
carrying BYPASSRLS was false; "RLS scopes the data" was false; a security audit that
claimed to have reviewed every operations controller had never seen the calendar one;
a spec comment pointing at a standalone RLS test pointed at a file that does not
exist; and this director's own one-transaction spec for HARDEN-004A was wrong and had
to be corrected before commit. **The last one is the important one:** the director is
not the reliable narrator either. Read the code. Measure. Then decide.

---

## Appendix — the uncommitted HARDEN-004B1 migration, in full

> **SUPERSEDED 2026-08-10.** This appendix transcribes the **64-line, B1-only
> draft**. The migration that actually shipped (commit `c7d0ef7`, deployed
> 2026-08-10) carries **BOTH** policies — B1 `membership_self_read` **and** B2
> `company_self_read` — and the committed file
> `apps/api/prisma/schema/migrations/20260805120000_add_membership_user_read_policy/migration.sql`
> is the **sole source of truth**. The three §4 `company_self_read` questions were
> **signed by the founder on 2026-08-06**; the acta is in the `CLAUDE.md` ledger
> (§ HARDEN-004B1/B2). This appendix is kept **as history** and is not updated.

Path:
`apps/api/prisma/schema/migrations/20260805120000_add_membership_user_read_policy/migration.sql`
(64 lines, read from disk 2026-08-05). Reproduced so it survives the loss of the
working tree. **It is not committed and must not ship alone** — see §1 and §4.

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- HARDEN-004B1 (2026-08-05) — a SECOND, READ-ONLY policy on memberships,
-- keyed on the USER instead of the company. Founder decision, signed
-- 2026-08-05.
--
-- WHY IT EXISTS — the bootstrap question. GET /auth/me asks "which companies do
-- you belong to?" (AuthService.getMe, iam/auth.service.ts:94-118). That is a
-- question about a USER, and it is asked BEFORE any company has been selected,
-- so no rls.company_id can exist yet — TenantMiddleware is excluded from
-- api/auth/* (app.module.ts:110-115). Under the app_user runtime role the
-- existing company-keyed membership_isolation policy therefore matches nothing,
-- getMe returns `companies: []` with HTTP 200, and the user is stranded on a
-- blank company picker. An empty array, not an error — which is why it needs a
-- policy rather than a bug fix.
--
-- HOW IT WORKS. PostgreSQL ORs multiple PERMISSIVE policies for the same
-- command: a row passes when EITHER policy matches. membership_isolation keeps
-- serving every company-scoped query; this one serves the pre-company question.
-- NOTE: memberships is the FIRST table in this schema to carry two policies —
-- every other table is exactly one policy to one table.
--
-- IT DOES NOT WEAKEN WRITES. membership_isolation is untouched here. It is FOR
-- ALL with no WITH CHECK clause, so its USING expression doubles as the write
-- check for INSERT/UPDATE, and it stays the ONLY policy that can permit a write.
-- A FOR SELECT policy contributes no WITH CHECK at all, so INSERT / UPDATE /
-- DELETE on memberships remain strictly company-scoped, exactly as before.
--
-- WHAT THIS EXPOSES THAT WAS NOT EXPOSED BEFORE — stated without minimising.
-- A caller whose rls.user_id is set can now SELECT their OWN membership rows
-- with no company context. A membership row reveals, to its own user: the row
-- id, userId, companyId, role, isActive and the timestamps — i.e. which
-- companies they belong to and with which role.
-- Another user's row can NEVER match: the predicate compares the row's "userId"
-- against the GUC, so a row is visible only to the user that owns it. There is
-- no wildcard, no join, and no company term to widen. rls.user_id is set by
-- RlsService from the JWT-validated user id (rls.service.ts:30) and never from a
-- client-supplied header (unlike x-company-id, which is raw client input).
--   * V1 — one tenant = one company; a user belongs to exactly one company.
--     Practical exposure is NIL: the single row a user can now read without a
--     company context is the same row they could already read with one, and it
--     is their own.
--   * V2 — a tenant may hold several companies (Chilean holdings); a user may
--     then hold several memberships, always within their own tenant, never
--     across tenants. The change becomes real but stays bounded: the user can
--     read the list of THEIR OWN memberships before selecting a company, which
--     is precisely what the company picker needs. Still only their own rows;
--     still nothing about any other user.
--   The same policy serves V1 and V2 unchanged, which is why this shape was
--   chosen over a SECURITY DEFINER bypass function — that would have added a
--   second privileged door to guard.
--
-- REVERT: DROP POLICY membership_self_read ON memberships;   — and nothing else.
--
-- Deliberately NOT in this migration, because memberships already has them:
--   * ALTER TABLE ... ENABLE ROW LEVEL SECURITY — enabled 20260417171836:19.
--   * GRANT ... TO app_user — covered by the 2026-04-17 ON ALL TABLES grant.
--   * audit trigger — audit_memberships exists (20260417172748:56-58).
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — user-scoped READ, ORed with the company-scoped membership_isolation.
CREATE POLICY membership_self_read ON memberships
  AS PERMISSIVE
  FOR SELECT
  USING ("userId" = current_setting('rls.user_id', true)::uuid);
```
