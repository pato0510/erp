# Excelsia — Calendario de Actividades: Plan Part 2 — Ticket Breakdown

**Status:** Validated by founder — 2026-07-15. Execute strictly in order, one ticket at a time.
**References:** `docs/EXCELSIA-CALENDARIO-PLAN-PART1-DATAMODEL.md` (data model & decisions), `docs/CALENDARIO-RECON.md`, `CLAUDE.md`.

## Flow rules (as established through RRHH / Comercial / Marketing)

- Serial execution, one ticket per CC run, one conventional commit per ticket (English).
- Every CC prompt begins with: _"Read the CLAUDE.md file carefully before doing anything. Do not run any git commands."_
- **Live-validation protocol (standard since MKT-005):** tickets embed their own live validation with raw evidence (HTTP codes, psql output, verbatim payloads — never summaries); CC applies migrations to the LOCAL dev database only (production receives them via Railway on push); if any check fails, CC reports and stops — fixes are separately approved.
- Founder gates every ticket: reads evidence, runs the click-through when there is UI, commits, pushes at natural checkpoints. Director reviews reports against real code before issuing commit blocks, and verifies Railway after every push (migration log lines included).
- Platform invariants apply to every ticket: RLS + audit trigger + GRANT in the same hand-authored migration; `@CheckPolicies` on every endpoint (PoliciesGuard fails open); writes via `executeWithRls`; ASCII enum members with Spanish display labels; UTC date arithmetic (HR-004b); current design tokens.

---

## CAL-001 — Module shell: Nest module, CASL floor, routes, card href

Backend: `actividades` aggregator module (COM-001/MKT-001 scaffold) + guarded ping; CASL subjects `CalendarActivity` and `ActivityArea` added to the default-deny floor and re-granted per the Part 1 §4 matrix — **read for all six roles (a platform first), write MANAGER/ADMIN/SUPER_ADMIN**; `GET /actividades/permissions` endpoint.
Frontend: `/actividades` layout + sidebar (Calendario · Áreas) with placeholder pages; in `/modulos` the existing "Calendario de Actividades" card gains `href: '/actividades'` but stays `active: false` until CAL-007.
No schema changes, no migration.

**AC:** ping 200 for VIEWER (yes — reads are open here) and permissions JSON matches the matrix for all six roles (VIEWER `calendarActivity.read: true`, all writes false — paste the JSONs; this inverted-from-Marketing expectation is the cell to get right); floor extended without touching existing subjects; placeholder pages reachable by URL; card href set, still gated.

## CAL-002 — Areas: migration + CRUD + config screen

Hand-authored migration: `activity_areas` per Part 1 §2.1 (+ RLS/audit/GRANT, `@@unique([companyId, name])`). Backend CRUD: create/update/deactivate (`active` toggle); `DELETE` only pristine (zero activities) → else 409; name uniqueness surfaced as a clean Spanish 409/400. Frontend: Áreas config screen (list + form with color palette + activate/deactivate + delete-with-confirm), write affordances gated by `canWrite`, read-only for the other roles.

**AC:** migration applied locally with the template-faithful RLS/trigger/GRANT (psql evidence); duplicate name rejected; pristine delete 200 / non-pristine 409 (pre-create an activity via SQL? NO — activities don't exist yet: the pristine 409 path is deferred to CAL-003's validation, note it explicitly); VIEWER GET áreas → 200, POST → 403; RLS triple via SET ROLE app_user; audit rows.

## CAL-003 — Activities: migration + CRUD backend + status machine + month feed (activities half)

Migration: `calendar_activities` per Part 1 §2.2 (+ RLS/audit/GRANT, FK `Restrict` to `activity_areas`, index `[companyId, startDate]`). CRUD with validations: `endDate ≥ startDate`; `startTime` `"HH:mm"`-validated and **rejected when the activity spans more than one day** (decision f); area must exist, belong to the company, and be active; `assigneeId` `@IsUUID`. Canonical `PATCH /:id/status` with exactly the Part 1 edges (PENDIENTE↔HECHA, PENDIENTE↔CANCELADA, CANCELADA→PENDIENTE; same-status and all else rejected). `DELETE` always allowed for writers (decision b). Feed: `GET /actividades/calendar?month=YYYY-MM` returning the month's activities (UTC clamp, ranged intersection per the MKT-004 recipe; CANCELADA excluded from the feed, reachable via the list endpoint filter). Also complete CAL-002's deferred check: area pristine-delete 409 once an activity exists.

**AC:** validation matrix (date order, time-on-range rejection with its Spanish message, inactive-area rejection); status edges incl. rejections; delete → 200 regardless of status; feed month-boundary proof (a ranged activity spanning two months appears in both) and first-of-month UTC check; area 409 now proven; ACCOUNTANT/ANALYST/VIEWER GET → 200 and every write → 403; RLS + audit evidence.

## CAL-004 — Week/Day extraction (the delicate one — triple Operaciones regression)

Per recon C2: extract the Operaciones Week and Day views into the shared `components/calendar/` as domain-agnostic, props-driven components — lifting the hardcoded `event.type === 'work_permit_scheduled'` time literal and re-injecting the severity accessor via props. Operaciones keeps rendering IDENTICALLY (imports + prop wiring only; STOP rule if genericity would force any user-visible ops change). No duplicated view code remains. No Actividades UI yet — this ticket is pure extraction + regression.

**AC:** exact ops diff summarized (expected: imports/props only); shared components import nothing ops-specific (grep); tsc/lint clean; founder regression script for the ops calendar covering Mes AND Semana AND Día (chip colors, the work-permit time rendering, severity order, navigation, event click) — the founder's non-skippable step of this module.

## CAL-005 — Activities frontend: the calendar page

`/actividades` calendar with the three views (Mes default · Semana · Día) fed by the CAL-003 endpoint; chips colored by area (catalog color); filters área/estado; "Nueva actividad" + edit modal (single-day time rule surfaced; backend errors verbatim); status actions per the machine; delete with confirm; HECHA dimmed with check, CANCELADA not painted (filter-accessible in a list view or filter toggle); empty states. All writes gated by `canWrite`; ACCOUNTANT/ANALYST/VIEWER get the full read experience with zero affordances.

**AC:** founder click-through: create single-day timed activity ("Almuerzo equipo", 13:00) and a multi-day range; try time-on-range → verbatim 400; move through the status machine from the UI; delete one; filters; the three views render the same data coherently; viewer@ sees everything, touches nothing (the historic cell, live in UI).

## CAL-006 — Birthdays: RRHH expose + feed integration + UI

RRHH exposes `BirthdayReadService.listForMonth(companyId, month)` per Part 1 §3 (new leaf module `RrhhBirthdayReadModule`, imports nothing; ACTIVO employees only; day/month only — NEVER year/age; null birthDate skipped). Actividades consumes via DI; the feed response becomes `{ activities, birthdays }`. UI: birthday chips with their own style on all three views. Document the founder-signed exposure (decision d) in the service header.

**AC:** module graph stated (acyclic, new leaf); feed evidence with a seeded birthDate (set one via the RRHH API on a dev employee) showing day/month and proving year is absent from the payload (paste raw JSON); INACTIVO employee's birthday absent; VIEWER sees birthdays in the feed (the deliberate exposure, live); no other RRHH data reachable through any Actividades surface (grep + payload proof).

## CAL-007 — Module close: un-gate, CLAUDE.md, QA, housekeeping

Flip the card to `active: true`. CLAUDE.md: Calendario de Actividades V1 block (same format as the RRHH/Comercial/Marketing blocks; include the coexistence doctrine of `ActivityArea` vs `AreaRRHH` and the founder-signed birthday exposure) + refresh "Próximos pasos" (V2 seeds incl. the unified feed architecture). QA: the definitive live permissions matrix (six roles × areas/activities/feed surfaces — with the read-for-all cells that invert every prior module); self-cleaning loop (create area → activity on it → area delete 409 → activity delete → area delete 200); end-to-end read of the module's seed state; tsc/lint/routes.

**AC:** CLAUDE.md block pasted verbatim for director review; matrix with zero deviations; loop leaves zero residue; card live; founder's production walkthrough = the empty-state experience plus creating AGS's three real areas.

---

## V2 backlog seeds (record only — do not build)

Unified cross-module feed architecture (Operaciones expirations · Marketing campaigns · Comercial expected closes · RRHH availability-safe absences) · stored recurrence for manual activities · optional `AreaRRHH` → activity-area mapping · reminders/notifications · external calendar sync.
