# CALENDARIO-RECON — CAL-000 read-only reconnaissance of the reuse surface

Status: reconnaissance only. No product code, migrations, or config were changed by
this ticket. Findings, not proposals — the data model is designed with the founder after
this recon (kickoff checklist §6 of the scope doc).

Scope investigated: the reuse surface for the **Calendario de Actividades** module (a
company-wide master internal-coordination calendar — manual planned activities, birthdays,
and read-only opt-in aggregation feeds from Operaciones / Marketing / RRHH / Comercial),
per `docs/EXCELSIA-CALENDARIO-ACTIVIDADES-SCOPE.md`, against the completed Finanzas,
Operaciones, RRHH, Comercial and Marketing modules as of `develop` after MKT-010.

All file references are repo-relative to `apps/…` unless noted. Line numbers reflect the
code at recon time and may drift.

---

## C1 — Module shell + card + route

### The gated "Calendario de Actividades" card (added MKT-001)

`web/src/app/modulos/page.tsx`. `ModuleDef` type (L10-18): `{ key, name, description,
gradient, href: string|null, active: boolean, svg }`. The card is the **last** of 7
entries in `MODULES` (L407-418):

```tsx
{
  key: 'calendario-actividades',
  name: 'Calendario de Actividades',
  description: 'Calendario maestro de actividades internas de la organización',
  gradient: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
  href: null,
  active: false,
  svg: <CalendarioSvg />,   // the calendar-grid icon freed by the Marketing repurpose
},
```

Gating (L518-551): `active:false` → no `module-card--active` class, `aria-disabled`, a
`PRÓXIMAMENTE` badge, and `handleSelect` early-returns on `!mod.active || !mod.href`. To
un-gate at module close (CAL-010 analog of MKT-010/COM-015): flip `active:true` and set
`href` — one line.

### Route namespace — convention + proposal

- **Web** top-level segments under `(dashboard)/` map 1:1 to each module's `key`:
  operaciones→`/operaciones`, comercial→`/comercial`, rrhh→`/rrhh`, marketing→`/marketing`
  (finanzas is the exception — its card href is `/dashboard` and its sidebar is the default
  fallback). No `/calendario` or `/actividades` top-level segment exists today.
- **API** `@Controller` prefixes = the same key: `@Controller('comercial')`,
  `@Controller('marketing')`, `@Controller('rrhh')`, `@Controller('operations')` (note: API
  uses English `operations` while web uses `operaciones`; comercial/marketing/rrhh match on
  both sides). No `finance`/`finanzas` root controller exists.
- **Pattern**: one top-level namespace per module = its key; sub-features nest as
  `namespace/feature`. So the new module would take web `/<ns>` + API `@Controller('<ns>')`.
- **⚠ Collision risk (flag, not decide)**: the Marketing sidebar already ships a nav item
  **"Calendario" at `/marketing/calendario`** (`MarketingSidebar.tsx:17`), and that route
  exists on disk. A top-level `/calendario` does **not** path-collide (different depth) but
  is **name-ambiguous** for users (two "Calendario" surfaces). `/actividades` matches the
  card key's second half and avoids the overlap. Both are free of hard route collisions.

### The COM-001/MKT-001 scaffold chain to clone

- **Aggregator module** — `marketing.module.ts`: `@Module({ imports:[CampaignsModule,
PresenceModule], controllers:[MarketingController] })`. No own `providers`; composes
  feature submodules; PoliciesGuard/CaslAbilityFactory/PrismaService come from the global
  modules.
- **Guarded shell controller** — `marketing.controller.ts`: `@Controller('marketing')` +
  `@UseGuards(JwtAuthGuard, PoliciesGuard)`; `@Get('ping')` and `@Get('permissions')` each
  with `@CheckPolicies(...)`. Header comment states **PoliciesGuard FAILS OPEN** — every
  route MUST declare `@CheckPolicies` or it is world-open. `permissions` self-describes CASL
  flags via `@CurrentAbility()` (the `useMarketingPermissions` frontend hook consumes it).
- **CASL default-deny floor** — `common/casl/casl-ability.factory.ts`. The idiom (Marketing
  example): (a) subject classes with `static readonly modelName` (CampaignSubject etc.,
  L264-272); (b) added to the `Subjects` union + the `export {}` block; (c) collected in a
  `MARKETING_SUBJECTS` array (L308-314); (d) per role, `MARKETING_SUBJECTS.forEach(s =>
cannot('read', s))` (the floor) then re-grant per role AFTER (last-rule-wins). MANAGER
  full CRUD; ACCOUNTANT read on the money-bearing subset only; ANALYST revoke, no re-grant;
  VIEWER has no blanket `read all` so granting nothing IS the floor. A new module adds its
  own `CALENDARIO_SUBJECTS` array + per-role branches.
- **Sidebar** — config-driven `navItems` array in a per-module `*Sidebar.tsx`; selection is
  per-route in `(dashboard)/layout.tsx` via a `pathname.startsWith('/<ns>')` boolean + a
  chained ternary (FinanceSidebar is the fallback). A new module needs a new `*Sidebar.tsx`
  - a new `isX` branch.

---

## C2 — Calendar UI surface after MKT-004

### The shared, domain-agnostic month grid

`web/src/components/calendar/` holds exactly two files, both **zero-domain-coupling**
(import nothing ops/marketing-specific):

- `MonthView.tsx` — generic `MonthView<T extends CalendarMonthEvent>`. Props contract:

```ts
CalendarMonthEvent = { id: string; date: string }   // bucketed by LOCAL dateKey
MonthViewProps<T> = {
  focusedDate: Date; events: T[];
  getChipStyle: (e: T) => { bg: string; color: string };
  getChipLabel: (e: T) => string;
  onSelectEvent: (e: T) => void;
  onSelectDay?: (day: Date) => void;
  sortDayEvents?: (a: T, b: T) => number;
  getDayIndicators?: (dayEvents: T[]) => { critical: number; warning: number; info: number };
}
```

Renders the 6×7 grid, today/weekend, 3-chips/cell + "+N más", generic severity dots from
`getDayIndicators`.

- `dateGrid.ts` — pure date math: `startOfDay/Week/Month`, `startOfMonthGrid`,
  `endOfMonthGrid`, `addDays`, `isSameDay/Today/SameMonth/Weekend`, `dateKey` (local
  YYYY-MM-DD), `DAY_NAMES_SHORT` (Monday-first, es-CL).

**Reuse-as-is** for the Calendario month view: instantiate `MonthView<CalendarioEvent>`,
supply `getChipStyle`/`getChipLabel`/`onSelectEvent` (per the ops page template below).

### Ops-bound Week/Day/List views — per-view verdict

`web/src/components/operations/calendar/` (MonthView already moved out). All three import
`CalendarEvent` + `TYPE_META`/`SEVERITY_META` from `./types` (the ops `CalendarEventType`
6-value union). Their coupling is the same metadata-lookup coupling MonthView shed —
**extract-and-parameterize, not build-new** — with one caveat:

| View       | Props                                  | Coupling                                                                                                          | Verdict                                                                                                                     |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `WeekView` | `{focusedDate, events, onSelectEvent}` | `TYPE_META[e.type]` chip; **plus a page-bound literal** `event.type === 'work_permit_scheduled'` to show a clock  | **extract-and-parameterize** — but the work-permit time rule must be lifted to a prop (e.g. `showEventTime?: (e)=>boolean`) |
| `DayView`  | `{focusedDate, events, onSelectEvent}` | `TYPE_META` + `SEVERITY_META`; same `work_permit_scheduled` literal gating a time range; `groupByHour` is generic | **extract-and-parameterize** — lift the same literal + a severity-meta accessor                                             |
| `ListView` | `{events, onSelectEvent, pageSize?}`   | `TYPE_META` + `SEVERITY_META` only; no page-bound literal; `groupByDay` is pure                                   | **extract-and-parameterize** (cleanest; no `focusedDate`)                                                                   |

The scope doc expects month/week/day. Month is already shared. Week/Day/List are all
parameterizable the way MonthView was; the only deeper-than-metadata logic is the hardcoded
`work_permit_scheduled` time-display in Week/Day (must become a caller predicate) and the
fact that the shared MonthView deliberately dropped `severity` from its base contract, so a
generic Week/Day/List would re-introduce a `getSeverityMeta`-style accessor.

### How the ops page wires the shared MonthView (the CAL page template)

`operaciones/calendario/page.tsx` imports `MonthView` from `components/calendar/MonthView`
and instantiates `MonthView<CalendarEvent>` passing `getChipStyle={(e)=>({bg:
TYPE_META[e.type].bg, color: TYPE_META[e.type].color})}`, `getChipLabel={(e)=>e.title}`, a
`sortDayEvents` (severity desc, then time), and a `getDayIndicators` (bucket severity →
critical/warning/info). A Calendario page clones this shape with its own event type + chip
styling (e.g. by source module / area).

---

## C3 — Cross-module feeds (the heart of this module)

### Operaciones — operational calendar events

`operations/calendar/operations-calendar.service.ts` `getEvents(companyId, userId, dto)`
fans out to 6 private fetchers, returning `CalendarEvent = {id, type, title, date, endDate?,
severity, metadata, linkPath}`:

| Fetcher                | Source                                                                             | `type`                    | `linkPath`                        |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------- | --------------------------------- |
| document expirations   | `documentRecord` (APPROVED, expirationDate in range)                               | `document_expiration`     | `/operaciones/documentos?id=…`    |
| permit expirations     | `permit` (APPROVED)                                                                | `permit_expiration`       | `/operaciones/permisos?id=…`      |
| work permits scheduled | `workPermit` (plannedStart in range, sets `endDate`)                               | `work_permit_scheduled`   | `/operaciones/permisos/trabajo/…` |
| ack deadlines          | `procedureAcknowledgment` (PENDING/READ, dueDate; non-admins scoped to own userId) | `acknowledgment_deadline` | `/operaciones/procedimientos/…`   |
| exception expirations  | `assetException` (APPROVED, validUntil)                                            | `exception_expiration`    | `/operaciones/excepciones?id=…`   |
| procedures published   | `procedure` (PUBLISHED, publishedAt)                                               | `procedure_published`     | `/operaciones/procedimientos/…`   |

- **Controller** — `@Controller('operations/calendar')`, `GET events` → `/api/operations/
calendar/events`; guarded **`@UseGuards(JwtAuthGuard)` ONLY, NO `@CheckPolicies`** (by
  design: "any authenticated user can read; RLS scopes per company; no CASL because the
  calendar surfaces data the caller is already authorized to see on the source pages").
  Filters: `startDate, endDate, types (CSV), assetId, locationId, severity`.
- **DI availability**: `OperationsCalendarModule` provides but **does NOT `exports`** the
  service — it is **endpoint-only** today. A DI consumer would need Operaciones to add
  `exports: [OperationsCalendarService]`. `getEvents` is a usable entry point but requires a
  `userId` (ack privacy guard + admin check).
- **Verdict**: a fully-built aggregator already returns clean events, but exposing it to the
  Calendario means (a) `exports` on the module and (b) accepting that `CalendarEventType` and
  every `linkPath` are hardcoded to Operaciones — the consumer gets ops-shaped events with
  ops deep-links; there is no neutral event contract. **Consume via DI (parameterize) after
  Operaciones exports the service.**

### Marketing — campaign calendar

`marketing/campaigns/campaigns.service.ts` `calendar(companyId, month)` → `GET /marketing/
campaigns/calendar?month=YYYY-MM`, gated `@CheckPolicies(read Campaign)`. Excludes CANCELADA
and start-less drafts; UTC month bounds; ranged (`start<=monthEnd && end>=monthStart`) +
open-ended (`endDate null && start in month`) rules. **Projection `{id, name, status,
startDate, endDate}` — `budgetAmount`/money NOT selected** (money never reaches the calendar,
confirmed).

- `CampaignsService` **is exported** from `CampaignsModule`, so `calendar()` is already
  DI-reachable — but it takes only `(companyId, month)` and its CASL gate lives in the
  controller, so a DI caller inherits only company scoping (must re-apply ability shaping).
- Marketing already has the EXPOSE precedent `CampaignLookupService` (exported, minimal
  `{id, name, status}` projection, no money) — but its methods return **no dates**, so it is
  NOT a calendar feed.
- **Verdict**: **thin own exposed method** — Marketing should expose a dedicated
  calendar-projection service method (CampaignLookupService-style, DI) rather than the
  Calendario reusing the controller-gated HTTP feed; permission-shaping (read Campaign =
  MANAGER/ADMIN/SA + ACCOUNTANT) must be applied by the caller.

### RRHH — birthdays + availability-safe absences/vacations

- **Birthdate**: `rrhh.prisma` `Employee.birthDate DateTime? @db.Date` (nullable) — the only
  birth-date field. Display name is a single `Employee.fullName` (non-null; no
  firstName/lastName on Employee — those live on `User`, and `Employee.userId` is nullable).
  Birthdays need **no stored recurrence** (see C4).
- **DisponibilidadService** (COM-012 precedent) — exported from `disponibilidad.module.ts`.
  Public methods: `getAvailability`, `forServiceSingle`, `forServiceBatch`,
  `forServiceDisponibles`, `getMatriz`, `getAlertas`. **The ONE reason-free method is
  `forServiceDisponibles`** → `{date, count, employees:[{employeeId, fullName, cargo}]}` (no
  state/reason). Every other method exposes `state`/`reason` (e.g. `"Licencia médica"` from
  `resolveState`) or cert/contract PII → **health-adjacent, calendar-unsafe**.
- **Tables**: HR-012 unified permits + medical leaves into ONE `Absence` model (no separate
  `MedicalLeave`/`LeaveRequest` tables, though those CASL subjects exist). `VacationRequest`
  (startDate/endDate/status, availability-safe — only `rejectionReason`/`notes` free text).
  `Absence` (startDate/endDate/`blocksAvailability`/status **+ PII**: `category=LICENCIA`,
  `medicalFolio`, `healthEntity`, `absenceType.name`). A calendar may surface **date range +
  status + blocksAvailability only**, never the PII fields.
- **CASL**: `read AvailabilitySubject = MANAGER / ADMIN / SUPER_ADMIN only` (ACCOUNTANT/
  ANALYST/VIEWER excluded — `RRHH_SUBJECTS` floor with no re-grant for them).
- **Verdict**: birthdays → **thin own read** off `Employee.birthDate` (name + month/day),
  computed yearly at read time. Vacations/absences → **consume availability-safe only** via a
  reason-free exposed method (extend the DisponibilidadService/COM-012 pattern; `forService
Disponibles` today is point-in-time, not a date-range feed, so RRHH would need a new
  reason-free range method), gated to the AvailabilitySubject audience.

### Comercial — opportunities.expectedCloseDate

`comercial.prisma` `Opportunity.expectedCloseDate DateTime? @db.Date` — exists, **nullable**,
UTC-anchored. `OpportunityStage`: open pipeline = PROSPECTO/CONTACTO/VISITA_TECNICA/
COTIZACION/NEGOCIACION (free movement); GANADA/PERDIDA closed (reopen-only); EN_PAUSA parked.
Only **open + EN_PAUSA** opportunities have a meaningful future close date. **No existing
method lists/orders by `expectedCloseDate`** — `findAll` filters only by stage/accountId/
ownerId, orders by `updatedAt desc`. **Verdict**: Comercial would need to **expose a new
query** (date-range filter or expectedCloseDate ordering) as an exposed method; the field
itself is ready. (Scope doc marks this feed "maybe".)

---

## C4 — Recurrence

- **Nothing in the platform stores a user-facing recurrence rule.** A codebase-wide grep
  (`rrule|recurrence|recurring|FREQ=|byday|freq|repeat|weekly|monthly` over `prisma/schema/
*.prisma` and `apps/api/src`) returned **zero** recurrence columns — every hit was a false
  positive (`baseMonthlyUsed` salary, `criticalAlertDaysBefore`, presence "monthly entry"
  comment). No RRULE, no recurrence enum, no dayOfWeek/dayOfMonth anywhere.
- The only `cron`/`repeat` constructs are **BullMQ system repeatables** (hardcoded patterns,
  not user data): RRHH reminders (`0 7 * * *`), work-permit expiry sweep (`0 * * * *`), alert
  recalculation / MV refresh / domain-events retry. These are infrastructure schedules, not
  user-facing recurrence — explicitly distinct.
- **Birthdays need no stored recurrence**: derive "this year's occurrence" from the month+day
  of `Employee.birthDate` at read time. There is no `nextBirthday`, no per-year row.
- **For the record (model-session decision, NOT a recon proposal)**: if the founder later
  wants manual recurring activities, stored recurrence would imply either an RRULE string
  column or a recurrence enum + interval, **plus read-time expansion**. The existing precedent
  for read-time expansion is the MKT-004 campaign calendar: `Campaign` stores only a date
  _range_ (`startDate`/`endDate`), and the per-day bars are expanded from that range
  client-side — nothing recurring is persisted. Flagged as the reference pattern only.

---

## C5 — Activities storage (why Comercial `activities` must NOT be reused)

`comercial.prisma` `Activity` = `{id, companyId, accountId (required, FK CASCADE),
opportunityId? (FK SET NULL), type (ActivityType: LLAMADA/REUNION/EMAIL/VISITA_FAENA/NOTA),
subject, detail?, activityDate (= WHEN it happened), isSystemGenerated, createdBy, …}`. It is
**a system-generated, append-only, past-tense CRM timeline**:

- Manual create forces `isSystemGenerated:false` and `activityDate = now()` — no future date,
  **no status** (`activities.service.ts:70-83`).
- COM-009 writes a **system** activity (NOTA, `isSystemGenerated:true`, `activityDate:now()`)
  in the **same transaction** as each opportunity stage transition/resume/reopen —
  after-the-fact event records (`opportunities.service.ts` `writeSystemActivity`).
- System rows are **immutable** (`assertMutable` throws "registro histórico: no pueden
  editarse ni eliminarse").
- Every row is **FK-bound to a Comercial Account** (`accountId` required, CASCADE — "activities
  ARE the account's history"); the only actor field is `createdBy` (the logger).

**Verdict — a NEW thin table is required** (the code supports this outright): the master
calendar's "planned activity" needs a **future date OR range, an area, an assignee, and a
pending/done status**, none of which exist on `Activity` (single past `activityDate`, no
range, no area, no assignee, no status), and it must exist **without an account FK** (a
birthday / a standalone task / an Operations item has no Comercial account). The append-only,
account-scoped, past-tense semantics directly contradict an editable, re-schedulable planned
item.

---

## C6 — Areas / people

- **No Area/Department/Team table exists.** "Area" is a fixed **enum `AreaRRHH`** (8 members:
  OPERACIONES, ADMINISTRACION, COMERCIAL, GERENCIA, FINANZAS, PREVENCION_RIESGOS, MANTENIMIENTO,
  RRHH), stored inline on **`Employee.area` (required)** and `JobPosition.area`. `JobPosition`
  = the "cargo" (name + area + required certs/docs); the only grouping above cargo is the
  `AreaRRHH` enum — there is no Department table between them.
- `iam.prisma` `Membership = {userId, companyId, role, isActive}` (`@@unique([userId,
companyId])`) — **no area/team grouping**; just who-can-access-which-company-as-what-role.
- **Verdict inputs**: per-area lanes would key off the **`AreaRRHH` enum** (not a table/FK),
  OR the module defines its own area enum/table — a model-session choice. "Assignee(s)" would
  be **bare actor UUIDs** per the pervasive codebase convention (`ownerId`, `createdBy`,
  `requestedBy`, `approvedBy` are all `@db.Uuid` with no relation); there is no central people/
  assignee FK table (staff link via nullable `Employee.userId`, users via `Membership`). An FK
  to `Employee` would only cover staff with a ficha — the established pattern is a bare UUID.

---

## C7 — Events / notifications

- `domain_events` (`operations.prisma` `DomainEvent`): `{eventType, aggregateType, aggregateId
@db.Uuid, payload Json, occurredAt @default(now()), status, retryCount, …}`, idempotency
  `@@unique([companyId, eventType, aggregateId, occurredAt])`. `DomainEventsService.emit<T>():
Promise<string|null>` persists-first then broadcasts; returns `null` on a P2002 dedupe (or
  any swallowed error). Retry cron `*/15 * * * *` re-broadcasts FAILED rows (`retryCount<3`).
- **The `aggregateId @db.Uuid` landmine** (restated for the record): a composite-string
  aggregateId fails the uuid cast → `emit()` silently returns `null` and the row is swallowed.
  Any future `calendario.*` event MUST use a real UUID aggregateId, never a composite key.
- **No V1 calendar surface needs events.** Feeds are pure Prisma reads (neither the ops
  calendar service nor `campaigns.calendar()` touches `DomainEventsService`); reminders/
  notifications are explicitly out of scope (scope-doc §4). Domain events remain a write-side
  cross-module state-change mechanism — not a way to serve read data. So **Calendario V1
  requires no `emit()` wiring**.

---

## Reuse verdict table

| Surface                                                                       | Verdict                                                                                                        | Risk                                                                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module scaffold (aggregator + guarded shell + permissions endpoint)           | **reuse as-is** (clone COM-001/MKT-001)                                                                        | Low                                                                                                                                                            |
| CASL default-deny floor (own `CALENDARIO_SUBJECTS` + per-role floor/re-grant) | **reuse as-is** (clone the idiom)                                                                              | Med — PoliciesGuard fails open; every route needs `@CheckPolicies`; money never on the calendar (ANALYST/VIEWER)                                               |
| `/modulos` card un-gate at close                                              | **reuse as-is** (COM-015/MKT-010 one-line flip)                                                                | Low                                                                                                                                                            |
| Route namespace                                                               | **build new** (`/actividades` recommended over `/calendario`)                                                  | Med — `/marketing/calendario` name overlap (no hard collision)                                                                                                 |
| Sidebar + `(dashboard)/layout.tsx` route branch                               | **reuse as-is** (new `*Sidebar` + `isX` branch)                                                                | Low                                                                                                                                                            |
| Shared `MonthView` + `dateGrid`                                               | **reuse as-is** (props-driven, domain-agnostic)                                                                | Low                                                                                                                                                            |
| Ops `WeekView`/`DayView`/`ListView`                                           | **parameterize** (extract like MonthView; lift the `work_permit_scheduled` literal + a severity-meta accessor) | Med — page-bound literal in Week/Day; severity dropped from the shared base contract                                                                           |
| Operaciones event feed                                                        | **parameterize (consume via DI)** — needs `exports:[OperationsCalendarService]`                                | Med — ops-hardcoded `CalendarEventType` + `/operaciones/*` linkPaths; no neutral contract; `getEvents` needs `userId`                                          |
| Marketing campaign feed                                                       | **thin own exposed method** (CampaignLookupService-style, dates + status, no money)                            | Low — money already excluded; needs a new DI method + caller ability-shaping                                                                                   |
| RRHH birthdays                                                                | **thin own read** off `Employee.birthDate` (yearly at read time)                                               | Low — nullable birthDate; `fullName` only                                                                                                                      |
| RRHH vacations/absences                                                       | **consume availability-safe only** (reason-free exposed method, COM-012 pattern)                               | **High** — `Absence` carries health PII (`category=LICENCIA`, `medicalFolio`, `healthEntity`, `absenceType.name`); AvailabilitySubject = MANAGER/ADMIN/SA only |
| Comercial `expectedCloseDate` feed                                            | **thin own exposed method** (new date-range query; field ready)                                                | Low-Med — nullable; only open/EN_PAUSA stages meaningful; "maybe" per scope                                                                                    |
| Manual planned activities                                                     | **build new** (thin own table)                                                                                 | Med — Comercial `activities` cannot be reused (past-tense, account-bound, no status/area/assignee/range)                                                       |
| Areas (per-area lanes)                                                        | **build new / reuse enum** (`AreaRRHH` enum today, no table)                                                   | Med — model-session: reuse `AreaRRHH` vs own enum/table                                                                                                        |
| Assignees                                                                     | **build new** (bare actor UUIDs, codebase convention)                                                          | Low — no people FK table; UUID actor refs like `ownerId`/`createdBy`                                                                                           |
| Recurrence                                                                    | **build new (only if founder wants it)**                                                                       | Med — nothing exists; birthdays need none; stored recurrence is a model-session decision                                                                       |
| Domain events / reminders                                                     | **not needed in V1**                                                                                           | Low — feeds are reads; reminders out of scope; `aggregateId @db.Uuid` landmine for any future event                                                            |

---

## Open risks & landmines (things Calendario must not step on)

1. **RRHH absence PII is the sharpest edge.** `Absence` unifies permits + medical licencias
   and carries `category=LICENCIA`, `medicalFolio`, `healthEntity`, `absenceType.name`
   ("Licencia médica"). The calendar may surface ONLY availability-safe fields (date range +
   status + `blocksAvailability`), never those — and only to the AvailabilitySubject audience
   (MANAGER/ADMIN/SA). Reuse the COM-012 reason-free consumption pattern; `forServiceDisponibles`
   is the safe method but is point-in-time (RRHH needs a new reason-free _range_ method).
2. **CASL-shaped feeds, per the caller's ability.** Each aggregation feed must be filtered by
   the caller's CASL ability, not merged blindly — Campaign read (MANAGER/ADMIN/SA +
   ACCOUNTANT), Availability read (MANAGER/ADMIN/SA), Opportunity read, ops-calendar (any
   authenticated). Money never appears (budget already excluded from the campaign projection).
3. **EXPOSE/CONSUME only — no cross-module table reads, no mutual imports.** Ops must
   `exports` its calendar service (endpoint-only today); Marketing/RRHH/Comercial each expose
   a dedicated read method (DI). The Calendario backend reads none of their tables directly.
4. **`aggregateId @db.Uuid` landmine.** If any future `calendario.*` domain event is added,
   its `aggregateId` MUST be a real UUID — a composite string makes `emit()` silently swallow
   the row. (V1 needs no events at all.)
5. **PoliciesGuard fails open.** Every Calendario endpoint needs
   `@UseGuards(JwtAuthGuard, PoliciesGuard)` + `@CheckPolicies`. New CASL subjects need the
   `cannot('read', …)` floor + per-role re-grants placed AFTER (last-rule-wins).
6. **Route-name ambiguity.** `/marketing/calendario` already exists; prefer a top-level
   `/actividades` for the new module to avoid two "Calendario" surfaces (no hard collision,
   but a UX/naming trap).
7. **`activities` table is a false friend.** It looks calendar-shaped but is a past-tense,
   account-bound, immutable CRM timeline with no status/area/assignee/range — do not reuse it.
   A thin own `calendar_activities` table (or similar) is the code-supported outcome.
8. **Ops event contract is ops-shaped.** Consuming the ops feed pulls in the hardcoded
   `CalendarEventType` union and `/operaciones/*` deep-links; there is no neutral event
   abstraction. The Calendario must map ops events into its own generic event/link shape.
9. **Birthdays vs privacy.** `Employee.birthDate` is nullable and personal; surfacing "who has
   a birthday" is a people-visibility decision (who may see the roster) — resolve the audience
   at design time. `fullName` is the only display field.
10. **Platform invariants for the new table(s).** Any new table ships RLS policy + audit
    trigger + `app_user` GRANT in the same hand-authored migration; ASCII-only enum members
    (display labels in the UI). Assignees/areas as bare UUIDs/enums follow the codebase
    convention (no new FK people table).
