# REPO VERIFICATION & TECHNICAL OWNERSHIP PROTOCOL

## Onboarding prompt for the incoming agent (Claude Code / Fable 5)

> **HOW TO USE THIS FILE:** Paste the prompt below (everything inside the fenced block) as the FIRST task for the new Claude Code session, with `EXCELSIA-TECHNICAL-HANDOFF.md` placed in the repo root (or attached). Do not start any feature work until the agent delivers the Technical Ownership Report and the owner reviews it.

---

```
You are acting as a Senior Software Engineer taking TECHNICAL OWNERSHIP
of an existing production system: Excelsia ERP. Your job in this task is
NOT to write features. It is to fully understand the project, verify it
against its handoff documentation, and produce a Technical Ownership
Report so that future development can proceed safely.

Context documents you must read FIRST, in this order:
1. CLAUDE.md (repo root) — the live operational state of the project
2. EXCELSIA-TECHNICAL-HANDOFF.md — the complete development history and
   architecture handoff written by the previous engineering lead
3. apps/api/src/modules/operations/README.md, MODULE_OVERVIEW.md,
   API_REFERENCE.md, SECURITY_AUDIT.md, KNOWN_ISSUES.md,
   MIGRATION_HISTORY.md

HARD RULES for this task:
- Do NOT modify, create, or delete ANY file. Read-only exploration.
- Do NOT run any git write commands (no commit, push, branch, stash).
  git log / git status / git diff are allowed (read-only).
- Do NOT run destructive DB commands. SELECT and \d inspection only.
- Where the handoff document and the repository disagree, the
  REPOSITORY is the truth — but you must FLAG every discrepancy.
- Production deploys automatically from develop. Treat everything
  as production-critical.

═══════════════════════════════════════════════════════════════════
PHASE 1 — REPOSITORY STRUCTURE & TOOLING
═══════════════════════════════════════════════════════════════════
1. Map the monorepo: list apps/, libs/, infra/, docs/, .github/.
   Confirm it is an Nx monorepo with apps/web (Next.js 14) and
   apps/api (NestJS). Note Nx module-boundary configuration.
2. Read package.json (root and per-app): record exact versions of
   next, react, @nestjs/*, prisma, bullmq, and notable libraries
   (qrcode, pdfkit, archiver, jszip, exceljs/xlsx, @nestjs/throttler).
3. Read the GitHub Actions workflows in .github/workflows/: what does
   CI run (lint, build, tests)? What must be green before push?
4. Read docker-compose: which services, ports, credentials for local dev.
5. List every script in package.json relevant to dev workflow
   (serve, build, prisma generate/migrate, lint, test).

═══════════════════════════════════════════════════════════════════
PHASE 2 — DATABASE & MULTI-TENANCY (the security core)
═══════════════════════════════════════════════════════════════════
6. List every file in apps/api/prisma/schema/ and summarize each
   domain file: models, enums, relations.
7. Count and list all migrations in chronological order. Cross-check
   against MIGRATION_HISTORY.md and the handoff (Operations should
   have 24 migrations, 20260417171836 → 20260429160000; verify there
   is NO migration named *add_budgets* — it was reverted and must not
   exist).
8. Verify the multi-tenancy chain end to end:
   a. Locate TenantMiddleware / the mechanism extracting companyId
      from the JWT and how it propagates (AsyncLocalStorage?).
   b. Locate RlsService and confirm the SET LOCAL rls.company_id
      pattern and executeWithRls usage.
   c. Pick 5 random business tables and confirm in the migrations
      that each has: RLS policy + audit trigger + GRANT to app_user.
      Report any table missing one of the three.
9. Materialized views: confirm the 4 Operations MVs exist in
   migration 20260429140000, that they have UNIQUE indexes (for
   REFRESH CONCURRENTLY), and that every service query against them
   filters by company_id explicitly (MVs do not inherit RLS).
10. Confirm the audit_trigger_function() exists and which tables
    have audit triggers attached.

═══════════════════════════════════════════════════════════════════
PHASE 3 — AUTH, ROLES & SECURITY
═══════════════════════════════════════════════════════════════════
11. Trace the auth flow: login endpoint → JWT issuance → HttpOnly
    cookie settings (Secure? SameSite?) → refresh flow → logout.
12. Enumerate the CASL roles found in code and compare with the
    handoff's six roles (SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT,
    ANALYST, VIEWER). List the CASL subjects defined and which
    role can do what on each.
13. List every endpoint that is intentionally PUBLIC (no JwtAuthGuard)
    — expected: the QR public scan endpoint with throttling. Flag any
    other unguarded endpoint as a potential security issue.
14. Check how file uploads are validated (size, mime types) for
    document uploads and asset photos.

═══════════════════════════════════════════════════════════════════
PHASE 4 — FINANCE MODULE VERIFICATION
═══════════════════════════════════════════════════════════════════
15. Map apps/api/src/modules/ for the finance domains (movements,
    cashflow/commitments, banking, tax, reconciliation, closing,
    alerts, reports, catalogs). For each: controller routes, main
    service methods, DTOs.
16. Map the finance frontend routes under apps/web/src/app/(dashboard)/
    — confirm the FLAT convention (/movimientos, /caja, /banco,
    /conciliacion, /contrapartes, /tributario, /dashboard) and that
    NO /presupuestos or /finanzas/presupuestos route exists (FIN-001
    was reverted).
17. Banking: confirm the provider-adapter pattern, the mock provider,
    and the manual cartola import. List which Chilean bank formats
    are parsed.
18. Monthly closing: confirm the 5-rule checklist, period locking
    mechanism, and ADMIN-only reopen.

═══════════════════════════════════════════════════════════════════
PHASE 5 — SII / BASEAPI (CRITICAL — this is FASE 0 of the roadmap)
═══════════════════════════════════════════════════════════════════
19. In apps/api/src/modules/tax/ (or wherever the tax module lives):
    a. List ALL provider implementations of ISiiProvider. Does
       BaseApiSiiProvider exist? Does MockSiiProvider exist?
    b. Read the provider factory. What is the DEFAULT provider when
       none is specified? Quote the exact code.
    c. Trace every call site of syncDocuments / syncAll: where does
       the provider name come from (env var? hardcoded? request)?
    d. Report: under what exact conditions could a sync run with
       'mock-sii' in production?
20. Confirm tax_sync_runs.provider column default in the Prisma
    schema and in migrations. The handoff says it is 'mock-sii' —
    verify and report.
21. Check where BASEAPI_KEY, SII_RUT, SII_PASSWORD are consumed.
    Confirm the BaseAPI base URL and endpoints used match:
    /api/v1/sii/rcv/ventas, /sii/rcv/compras,
    /sii/contribuyente/informacion.
22. Locate SII-003 logic: auto-creation of movements (source=TAX_SYNC)
    from synced documents and the "Productos no categorizados"
    fallback. Confirm idempotency via the
    @@unique(companyId, type, folio, direction) constraint.
23. DELIVER A VERDICT: "BaseAPI integration is [fully implemented and
    default / implemented but not default / partially implemented /
    missing]" with file-and-line evidence, plus the exact minimal
    change set needed to guarantee production never runs mock again
    (including the column-default migration). DO NOT implement it yet.

═══════════════════════════════════════════════════════════════════
PHASE 6 — OPERATIONS MODULE VERIFICATION
═══════════════════════════════════════════════════════════════════
24. Confirm the submodule layout under apps/api/src/modules/operations/
    (assets, fleet, document-control, permits, procedures, alerts,
    calendar, reports, dashboard, audit, qr...). Compare the endpoint
    count against API_REFERENCE.md (~130).
25. Spot-verify five flagship behaviors in code (quote the relevant
    functions):
    a. Requirements-matrix specificity resolution (asset > subtype >
       type).
    b. Immutable document supersession (REPLACED docs cannot be
       edited/deleted; compliance excludes them; 409-with-offer on
       duplicate upload).
    c. Automatic blocking: expired CRITICAL+blocksOperation document
       → asset BLOCKED_DOCUMENTAL (and unblocking/exception path via
       asset_exceptions).
    d. QR flow: token generation (crypto.randomBytes(24) base64url),
       public endpoint throttle 30/min, scan counters, regeneration
       invalidating old token.
    e. Audit packages: signed ZIP composition (MANIFIESTO.json with
       SHA-256 per file + global signature).
26. Confirm the BullMQ repeatable jobs: list all cron expressions
    registered (expected: daily alert engine, MV refresh fast */15
    and slow hourly, domain-events retry, procedure-acknowledgment
    reminders, etc.) and compare with GET /api/operations/health/crons.
27. Confirm Operations→Finance integration: domain_events emission and
    the Finance-side handlers creating automatic commitments.

═══════════════════════════════════════════════════════════════════
PHASE 7 — FRONTEND ARCHITECTURE
═══════════════════════════════════════════════════════════════════
28. Map apps/web/src/app route tree (route groups, public /p/asset
    route outside the dashboard group, módulos selection screen).
29. Identify apiClient (lib/api.ts): how auth cookies and the
    x-company-id header are attached; how errors are handled.
30. Verify Terminal Noir tokens in the codebase (tailwind config /
    globals): colors #0C0F1A and #4ECDC4, fonts JetBrains Mono /
    Syne / Inter (and whether Outfit appears). Note any drift.
31. Note whether imports are relative or aliased (@/). (Aliases are
    a desired V2 improvement; today they may be relative.)

═══════════════════════════════════════════════════════════════════
PHASE 8 — HYGIENE & RISK SCAN
═══════════════════════════════════════════════════════════════════
32. Run the linters/builds READ-ONLY (nx lint api, nx lint web,
    npx tsc --noEmit per app if quick) and report counts. The handoff
    expects ~78 pre-existing warnings in calendar/dashboard/
    work-permits-generator — confirm.
33. git log --oneline -30: confirm the most recent commits match the
    handoff narrative (Sprint 8 closure, no FIN-001/budget commits).
    git status must be clean.
34. Search for leftovers: grep for "budget", "presupuesto",
    "AEROPROTECHNIK", "55555555" across the repo — all should return
    nothing (or only this documentation). Flag anything found.
35. Search for TODO/FIXME/HACK comments and list the top 20 with
    locations.
36. Scan for secrets accidentally committed (.env files in git,
    hardcoded keys).

═══════════════════════════════════════════════════════════════════
DELIVERABLE — TECHNICAL OWNERSHIP REPORT
═══════════════════════════════════════════════════════════════════
Produce a single markdown file: docs/TECHNICAL-OWNERSHIP-REPORT.md
(present it as output; the owner will commit it). Structure:

1. Executive summary (10 lines max): overall health, biggest risks.
2. Verified architecture map (folders, modules, DB domains).
3. CONFIRMATIONS table: every handoff claim you verified as true.
4. DISCREPANCIES table: every place repo ≠ handoff/CLAUDE.md, with
   file:line evidence and severity (info / warning / critical).
5. SII/BaseAPI verdict (Phase 5.23) with the proposed minimal fix
   plan as FASE-0 tickets (FIX-001, FIX-002...), each with acceptance
   criteria — ready for the owner to approve.
6. Security findings (unguarded endpoints, RLS gaps, secrets).
7. Hygiene findings (lint counts, TODOs, dead code).
8. Updated mental model: a 1-page "how a request flows" narrative
   (browser → cookie → middleware → CASL → RLS → service → DB →
   audit trigger) proving you understand the system.
9. Open questions for the owner (anything ambiguous).

Quality bar: every claim in the report must cite a file path (and
line where useful). No speculation presented as fact. If a phase
cannot be completed (e.g., no production DB access), say so
explicitly rather than guessing.
```

---

## Follow-up prompts to use AFTER the report is approved

**A. Apply the FASE-0 SII fix** (only after the owner approves the verdict):

> Read CLAUDE.md and docs/TECHNICAL-OWNERSHIP-REPORT.md. Implement FIX-001..FIX-NNN exactly as approved: make BaseAPI the guaranteed provider in production, migrate the tax_sync_runs.provider column default, add a startup guard that refuses to run mock-sii when NODE_ENV=production, and add a sync smoke test. One commit per ticket, conventional commits, update CLAUDE.md. Do not touch unrelated modules.

**B. Start the RRHH module:**

> Read CLAUDE.md, EXCELSIA-TECHNICAL-HANDOFF.md and the attached RRHH development plan file. Produce a consolidated sprint/ticket plan (HR-001..HR-NNN) following the exact methodology used for the Operations module (CLAUDE.md ritual, one commit per ticket, every table with RLS + audit trigger + GRANT, CASL subjects, Terminal Noir UI, manuals at module close). Do not write code until the plan is approved.

**C. Operations improvements:**

> Read CLAUDE.md. The owner will list desired changes to the Operations module. Structure them as OPS-038+ tickets with acceptance criteria, flag any that are already in the V2 backlog (section 11 of the handoff) so we don't duplicate scope, and wait for approval before implementing.
