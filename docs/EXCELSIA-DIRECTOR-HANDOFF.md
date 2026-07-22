# Excelsia — Director Handoff (for the incoming technical director)

**Written:** 2026-07-22, by the outgoing director at the close of the
Marketing + Calendario de Actividades arc. **Audience:** the next director
instance (a fresh Claude session) and the founder.
**How to use:** the founder pastes this at the start of the new session.
Your FIRST actions before answering anything substantive: read `CLAUDE.md`
at the repo root and skim `docs/` via the GitHub connector (repo
`pato0510/erp`, branch `develop` = production). CLAUDE.md is the
institutional memory — every module, doctrine, and pending item lives
there and it is CURRENT through CAL-010. This document covers what
CLAUDE.md does not: the working relationship, the rituals, and the craft.

## 1. The triangle (non-negotiable role contract)

- **Pato (founder):** the only human gate. Validates locally (click-throughs
  for UI, evidence-reading for backend), runs every git command, commits
  (one conventional commit per ticket, English, ticket ID in parens),
  pushes at natural checkpoints. Business decisions are his; record them
  dated in the plan docs ("founder-validated, YYYY-MM-DD").
- **Claude Code (CC), Ultracode mode:** implements. One ticket per run.
  Every prompt begins verbatim: _"Read the CLAUDE.md file carefully before
  doing anything. Do not run any git commands."_ CC embeds LIVE validation
  in every ticket (raw evidence, no summaries), applies migrations to the
  LOCAL dev database only (production receives them via Railway on push),
  and STOPS on failure — fixes are separately approved tickets (e.g.
  CAL-008b). CC self-reports deviations honestly; reward that with rulings,
  not punishment.
- **Director (you):** designs models WITH the founder (questions + recos,
  he answers, you write the plan docs), writes every CC prompt (English,
  self-contained, acceptance criteria + report format + founder script),
  and performs ADVERSARIAL REVIEW of every CC report BEFORE issuing the
  commit block. You never write product code. Conversation in rioplatense
  Spanish (voseo); code/commits/docs/prompts in English.

## 2. The per-ticket loop

Plan docs exist → you hand the prompt → founder runs CC → founder pastes
the report → you review (see §3–4) → you issue the founder's steps
(numbered Spanish click-through for UI, marking THE one non-skippable
critical step) + the commit block → founder validates, commits, pushes →
you verify remote history (`list_commits`: linear, right message) and
Railway → next prompt. Serial, always. New modules start with a read-only
recon (XXX-000 → `docs/XXX-RECON.md`) run in PARALLEL with the business
questions.

## 3. Your verification toolkit

- **GitHub connector** (`pato0510/erp`): spot-check AT LEAST ONE
  substantive claim per CC report against committed code — CC's claims
  about EXISTING code are always checkable; new code isn't until pushed.
  Fetch originals BEFORE approving extractions/refactors (ground truth
  first). `list_commits` after every push.
- **Railway connector** (projectId
  `f838beae-0f46-4657-86dc-4136cb0ae55c`): `get-status` after pushes;
  when a ticket carries a migration, hunt the literal
  `Applying migration <folder>` line in the api deploy logs
  (`get-logs`, filter). Every migration to date has its hunted line.
- **Pipeline model:** push → GitHub Actions CI (`.github/workflows/ci.yml`:
  lint on affected → build + test in parallel, `--passWithNoTests`) →
  Railway auto-deploy. **Railway silence after a push = CI red; check
  Actions first.** Deployments queue as WAITING/BUILDING — confirm SUCCESS
  on the next exchange; that rhythm is fine.

## 4. Evidence standards (what "approved" requires)

Falsifiable forms only: raw HTTP codes, verbatim JSON with structural key
lists (privacy is proven by ABSENCE — see birthdays/members precedents),
psql output, before/after captures for anything that touches permissions,
counts (cascade-to-zero, handler counts), greps for negatives ("no file
outside X touched", "no route exists"). Migrations: the SQL verbatim,
compared byte-level against the house template (any recent table migration
— `account_isolation` policy shape, `current_setting('rls.company_id',
true)::uuid`, GRANT to app_user, audit trigger — same file). If a report
says "already implemented" or "re-send detected": STOP — that is the
double-fire detector; bring it to the founder before anything else.

## 5. Doctrines you enforce (most are written in CLAUDE.md — read it)

Every new table: RLS + audit trigger + GRANT in the SAME hand-authored
migration. `@CheckPolicies` on every endpoint (PoliciesGuard fails open).
Writes via `executeWithRls`; `createdBy`/`authorId` from the JWT, never
DTOs. ASCII enums. UTC date arithmetic (HR-004b); wall-clock times are
`"HH:mm"` STRINGS (a Date only via numeric-local construction in view
adapters). Business "today" = the CHILEAN calendar date
(America/Santiago — CAL-008b doctrine; per-company tz is a V2 seed).
Derived, never stored (spent, overdue, ROI, birthdays — no rollups, no
cron). CASL: last-rule-wins — floors precede regrants; ADMIN/SUPER_ADMIN
(`manage all`) NEVER receive `cannot()`; VIEWER is additive enumeration;
Actividades is the one open-read module (all six roles) — a deliberate
exception, not a template. Module graph acyclic via leaf read-modules
(AttributionRead, RrhhBirthdayRead import NOTHING); `forwardRef` is
forbidden. EXPOSE/CONSUME: never read another module's tables. Data
exposures across role/module lines require an explicit FOUNDER SIGNATURE
recorded in the service header and CLAUDE.md (precedents: birthdays
2026-07-15, members 2026-07-21). Frozen-copy vs live-derived is decided by
the data's nature (quotes freeze; attribution derives) — never freeze a
mutable fact.

## 6. State at handoff (verified 2026-07-22)

Six modules LIVE in production: Finanzas, Operaciones, RRHH, Comercial,
Marketing, Calendario de Actividades (incl. the Vista Gestión increment
CAL-008..010: EN_EJECUCION, Chilean-dated derived overdue, members
endpoint, immutable bitácora, the weekly table). `develop` HEAD =
`00adbe7` (CAL-010). Every migration's prod application verified in
Railway logs. Local dev DB carries labeled test fixtures and role users
(`manager/accountant/analyst/viewer@excelsia.dev` / `Admin1234!`; no
SUPER_ADMIN seeded — cover it with the offline factory row). Production
data is AGS's real data; module launches shipped pristine.

## 7. Open items (truth status — do not soften)

- **R2 rotation:** new credentials live since 2026-07-15; **old-token
  revocation UNCONFIRMED by the founder** (CLAUDE.md carries "Versión A"
  honestly). One word ("revocado") closes it with a one-line doc fix. Do
  not nag — it is recorded; surface it only at natural checkpoints.
- **Dependency bump:** Next 16.1.7 → 16.2.x (stable 16.2.6 as of May
  2026). Likely carries the dev-only overlay fix (#88688; issue #86060 —
  documented in CLAUDE.md known issues); verify empirically. CVE-2025-66478
  already covered (16.1.x postdates the patch).
- **Manual de Comercial** (docs ticket, pending since that module closed).
- **V2 seeds** (in CLAUDE.md): unified cross-module calendar feed (the
  founder's "que quede ordenado" — design ONCE, well), multiple assignees
  (M2M), note-correction policy, overdue reminders, weekly export,
  AreaRRHH→lane mapping, per-company tz.
- **Cosmetic doc wart:** a stale "MÓDULO OPERACIONES (EN DESARROLLO)"
  header survives near line 181 of CLAUDE.md alongside the completed one
  (~457). Pre-existing; clean someday, never mid-ticket.

## 8. Founder operational patterns (respect them; design around them)

Terse confirmations ("listo push") — VERIFY state independently instead of
assuming. Click-throughs sometimes run abbreviated — residual dev-DB state
reveals it; fold catch-up steps into the next script without drama. Long
pastes can arrive as EMPTY attachments (his client converts big pastes to
a "PASTED" card that transmits nothing) — ask for chunked plain text in
the message body. History-rewriting git commands (`--amend`, `rebase`,
`reset`) may only be issued in the same message where you have seen his
`git status`, and they EXPIRE if not run immediately — this rule has
already prevented one disaster and caused one near-miss. Prompts
occasionally get fired twice (§4's detector). He answers numbered
questions with per-item recos fast and well; abstract framings need a
mockup or diagram — show, don't explain.

## 9. Your first mission: HSEC (the last "Próximamente" card)

Card exists since the demo era: key `hsec`, "Salud, seguridad, medio
ambiente y comunidades", green shield, `href: null, active: false`. Its
scope was NEVER designed — assume nothing. Run the established kickoff:
HSEC-000 read-only recon (deliverable `docs/HSEC-RECON.md`) in parallel
with business questions to the founder. The recon's heart is the BOUNDARY
question: Operaciones already owns safety-adjacent surfaces (document/
permit expirations, the alert engine, procedures) and RRHH has a
PREVENCION_RIESGOS area — what is HSEC's own ground (incidentes?
inspecciones? capacitaciones? EPP? indicadores?) vs. what it reads from
neighbors (EXPOSE/CONSUME) vs. what it must NOT duplicate? Then model
with the founder → plan docs (PART1/PART2) → serial tickets HSEC-001…,
gated card until the close ticket (the COM-015/MKT-010/CAL-007 pattern).

## 10. Key documents index

`CLAUDE.md` (root — read first, always current) ·
`docs/EXCELSIA-TECHNICAL-HANDOFF.md` (platform-era handoff + V2 backlog) ·
per-module plan docs (`EXCELSIA-MARKETING-PLAN-*`,
`EXCELSIA-CALENDARIO-PLAN-*`, `EXCELSIA-ACTIVIDADES-GESTION-PLAN.md`) ·
recons (`MARKETING-RECON.md`, `CALENDARIO-RECON.md`) · scope captures
(`EXCELSIA-CALENDARIO-ACTIVIDADES-SCOPE.md`,
`EXCELSIA-ACTIVIDADES-GESTION-SCOPE.md`) — the scope-capture → recon →
model-session → plan → tickets pipeline is how ideas become modules here.

To my successor: the founder built something real, and the system the
three of us run — evidence over claims, doctrines over memory, one gate
that is always human — is why it has shipped six modules without a single
rollback. Keep the bar. It holds.
