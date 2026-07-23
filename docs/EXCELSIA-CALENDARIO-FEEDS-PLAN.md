# Excelsia — Calendario: Unified Feeds Plan (services, expirations & the envelope)

**Status:** Validated by founder — 2026-07-23 (business answers + the signed
exposure matrix below). Source of truth for CAL-014..CAL-018.
**References:** `docs/CAL-SERVICIOS-RECON.md` (CAL-013R findings),
`docs/EXCELSIA-CALENDARIO-PLAN-PART1-DATAMODEL.md`, `CLAUDE.md`.

---

## 1. What this arc builds

The master calendar's V2 promise ("que quede ordenado") delivered early and
in order: ONE envelope architecture, N collections, built serially. The feed
grows from `{ activities, birthdays }` to a permission-shaped envelope; each
foreign collection is fed by a LEAF read module owned by its neighbor (the
BirthdayRead/AttributionRead pattern — imports nothing, narrow contract),
composed server-side in the ONE existing endpoint.

## 2. FOUNDER-SIGNED EXPOSURE MATRIX (2026-07-23)

| Collection             | Visible to                                             | Payload (never more)                                                                         |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| activities + birthdays | all 6 roles (unchanged)                                | as today                                                                                     |
| servicios              | all 6                                                  | service label + date range — NEVER amounts                                                   |
| vencimientos (docs)    | all 6                                                  | document label + date                                                                        |
| campañas               | all 6                                                  | name + status + range (the projection born money-free)                                       |
| cierres esperados      | Opportunity readers only (MANAGER/ADMIN/SA/ACCOUNTANT) | opportunity name + expected date                                                             |
| ausencias              | all 6                                                  | employee name + range + generic "No disponible" — NEVER category/motivo/folio (COM-012 line) |

Shaping happens in the feed composer via ability checks per collection
(`read Opportunity` gates cierres); a caller's envelope simply lacks the
keys they cannot see.

## 3. Architecture rules

- Leaf read modules, one per neighbor: `OpsCalendarReadModule` (servicios +
  vencimientos), Marketing exposes its existing calendar projection as a
  service method, `ComercialCierresReadModule`, RRHH absence read (leaf).
  Each imports NOTHING; narrowed return types — the master NEVER imports a
  neighbor's event-type unions (recon Q3 verdict: narrow contract over thin
  export).
- Frontend: a legend with per-collection chips (all on by default;
  birthdays always on), distinct chip styles per collection; the
  Actividades/Servicios segmented control governs the module's OWN rows
  (`kind`), independent of foreign collections.
- **Vocabulary coexistence doctrine (recon caveat → law):**
  `ServiceOrderStatus` (RECIBIDA·EN_EJECUCION·COMPLETADA·CANCELADA) and
  `ActivityStatus` overlap in words but are DIFFERENT machines for
  different things. Never unify, never map, never "fix".

## 4. Tickets

### CAL-014 — Manual services: the `kind` column

Migration: `kind` enum (ACTIVIDAD | SERVICIO) on calendar_activities,
default ACTIVIDAD (backfills existing rows). THE LOCKSTEP RULE (recon Q4):
`findAll` and `monthFeed` gain the kind filter in the same commit or
SERVICIO leaks everywhere; areas pristine-delete keeps counting BOTH kinds
(FK reality). Form gains the Actividad/Servicio selector; calendar gains
the segmented control (Todos | Actividades | Servicios); Gestión gains the
kind filter (default: Actividades). Manual services are ranged activities
with the same machine.
**AC:** enum migration caveat honored; lockstep proven (a SERVICIO fixture
appears only under its filter); segmented control flips live; existing
rows all ACTIVIDAD; Gestión default unchanged for current users.

### CAL-015 — Execution dates on ServiceOrder + "Servicios activos" (Operaciones)

Neighbor-table surgery (MKT-006 care — additive only): ServiceOrder gains
`executionStart`/`executionEnd` (nullable @db.Date, end ≥ start). New
Operaciones view "Servicios activos": RECIBIDA + EN_EJECUCION orders,
dates editable by ops writers (the founder: dates are set "cuando se
empiezan las órdenes"). No status machine changes.
**AC:** migration additive-only (quote); dates optional (an order without
dates simply won't reach the calendar later); validation 400 verbatim;
ops regression on the orders list (untouched columns).

### CAL-016 — The envelope + the two Operaciones collections (the payoff)

`OpsCalendarReadModule` (leaf) exposing `listServiciosForRange` (orders
with execution dates intersecting the month → label + range + status) and
`listVencimientosForRange` (the document-expiration events, narrowed).
Feed envelope grows (activities, birthdays, servicios, vencimientos) with
per-collection shaping; frontend legend + two new chip styles; ranged
servicios painted like ranged activities.
**AC:** the leaf imports nothing (paste imports); envelope keys per role
proven (VIEWER sees all four); month-boundary + UTC checks per
collection; the founder's original complaint dies: los vencimientos que
ve en Operaciones aparecen en el maestro.

### CAL-017 — Campañas + cierres esperados

Marketing exposes its calendar projection as an injected method (same
data as /marketing/campaigns/calendar); `ComercialCierresReadModule`
(leaf): open opportunities (not GANADA/PERDIDA) with expectedCloseDate →
name + date. Envelope + legend + shaping: cierres present ONLY for
Opportunity readers (paste VIEWER's envelope missing the key vs
ACCOUNTANT's carrying it).
**AC:** the shaping proof is the star; no Marketing/Comercial money or
stage detail in any payload (structural key lists).

### CAL-018 — Ausencias (availability-safe) + arc close

RRHH leaf method: VacationRequest (APROBADO/TOMADO) + Absence
(blocksAvailability) → employee name + range + "No disponible"; NEVER
category/type/folio/motivo (paste the structural key proof — the CAL-006
discipline). Envelope + legend. CLAUDE.md: the arc consolidated (the
envelope, the matrix verbatim, the vocabulary doctrine, the new leaves)

- Próximos pasos updated (feed unificado → LISTO).
  **AC:** the absence payload's ABSENCES are the evidence; matrix carved
  into CLAUDE.md; preservation greps; the master eats from four modules.

## 5. V2 seeds (record only)

Per-collection user preferences (which chips on) · service→calendar deep
links · vencimientos filtering by document type · absence half-days.
