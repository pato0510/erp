# CAL-013R — Mini-recon: service dates + ops calendar exportability

**Type:** READ-ONLY recon. Findings + verdicts + risks only — no proposals beyond the verdicts.
**Date:** 2026-07-23.
**Scope:** four questions on whether/how ServiceOrders could reach the Actividades calendar.

---

## Q1 — ServiceOrder: does it carry execution/scheduling dates? Status values?

**File:** `apps/api/prisma/schema/operations.prisma:1195`. Model verbatim:

```prisma
enum ServiceOrderStatus {
  RECIBIDA
  EN_EJECUCION
  COMPLETADA
  CANCELADA
}

model ServiceOrder {
  id                  String             @id @default(uuid()) @db.Uuid
  companyId           String             @db.Uuid
  orderNumber         String // per-company sequential, e.g. OS-0001
  status              ServiceOrderStatus @default(RECIBIDA)
  clientName          String // denormalized copy of the account name (always present)
  counterpartyId      String?            @db.Uuid // optional fiscal identity (may be linked later)
  title               String
  description         String?
  scopeLines          Json // frozen snapshot of the accepted quote lines
  netAmount           Decimal            @db.Decimal(18, 2)
  taxAmount           Decimal            @db.Decimal(18, 2)
  totalAmount         Decimal            @db.Decimal(18, 2)
  currency            String             @default("CLP")
  ownerId             String?            @db.Uuid // commercial owner — bare column (no FK)
  sourceOpportunityId String?            @db.Uuid // soft provenance pointer (NO FK)
  sourceQuoteId       String?            @db.Uuid // soft provenance pointer (NO FK)
  notes               String?
  createdBy           String?            @db.Uuid // null/system when created by the handler
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  counterparty Counterparty? @relation(fields: [counterpartyId], references: [id], onDelete: SetNull)

  @@unique([companyId, orderNumber])
  @@index([companyId])
  @@index([companyId, sourceOpportunityId])
  @@map("service_orders")
}
```

**Finding: NO scheduling/execution dates.** The only `DateTime` fields are `createdAt` (row birth)
and `updatedAt` (`@updatedAt` audit stamp). There is no `start`/`end`, no `scheduled`, no
`período`, no delivery window. A ServiceOrder is a frozen financial+scope snapshot of a won deal
(`scopeLines`, `netAmount`…), not a scheduled work item. **Status:** `RECIBIDA · EN_EJECUCION ·
COMPLETADA · CANCELADA`.

---

## Q2 — Does ANY ops entity schedule work over date ranges? Map to ServiceOrder.

**The only true scheduled RANGE is `WorkPermit`** (`operations.prisma:743`):

```prisma
plannedStart DateTime           // required — the scheduled window START
plannedEnd   DateTime           // required — the scheduled window END
actualStart  DateTime?          // filled during execution
actualEnd    DateTime?
status       WorkPermitStatus @default(DRAFT)
// links: permitTypeId, assetId?, locationId?  (NO serviceOrderId)
```

`WorkPermitStatus = DRAFT · PENDING_AUTHORIZATION · AUTHORIZED · IN_EXECUTION · SUSPENDED · CLOSED
· CANCELLED · EXPIRED`. It is scoped to an **asset/location + permit type**, not to a ServiceOrder.

**Other date-carrying ops entities (single dates, NOT work ranges):**

| Entity                          | Field(s)                     | Nature                                            |
| ------------------------------- | ---------------------------- | ------------------------------------------------- |
| `AssetException` (532)          | `validFrom?` / `validUntil?` | a compliance-exception window (range), not "work" |
| `DocumentRecord` (230)          | `expirationDate?`            | single deadline                                   |
| `Permit` (623)                  | `expirationDate?`            | single deadline                                   |
| `AlertInstance` (350)           | `expirationDate?`            | single deadline                                   |
| `ProcedureAcknowledgment` (996) | `dueDate?`                   | single deadline                                   |
| `Procedure` (901)               | `publishedAt?`               | single event                                      |
| `AuditPackage` (1141)           | `expiresAt?`                 | single event                                      |

**ServiceOrder ↔ scheduling: NO bridge exists.**

- No ops entity references `ServiceOrder` by relation or FK (the only mentions of `ServiceOrder`
  in `operations.prisma` are the enum, the model, and its header comment).
- `ServiceOrder`'s only outward pointers are **soft Comercial provenance** (`sourceOpportunityId`,
  `sourceQuoteId` — bare UUIDs, NO FK), not operational scheduling.
- No `Plan` / `Assignment` / `Asignacion` / `Schedule` / `Task` / `WorkOrder` / `Shift` model
  exists in ops (grep: none).

**Verdict:** WorkPermit is the sole entity that schedules work over a range, and it is
asset/location-bound and **unconnected to ServiceOrder**. There is no existing place where a
ServiceOrder carries, or links to, a delivery date/window.

---

## Q3 — Cost of exporting a read method from the ops calendar service.

**File:** `apps/api/src/modules/operations/calendar/operations-calendar.service.ts`.

**Public read method (the one worth exposing):**

```ts
async getEvents(companyId: string, userId: string, dto: GetEventsDto):
  Promise<{ events: CalendarEvent[]; summary: {
    total: number;
    byType: Record<CalendarEventType, number>;
    bySeverity: Record<Lowercase<CalendarSeverity>, number>;
    byMonth: Record<string, number>;
  } }>
```

(also `getEventsByDate`, `getMonthSummary`, `exportIcal` — all built on `getEvents`.)

**Ops-bound types it returns (all exported from this same file):**

```ts
type CalendarEventType =
  | 'document_expiration'
  | 'permit_expiration'
  | 'work_permit_scheduled'
  | 'acknowledgment_deadline'
  | 'exception_expiration'
  | 'procedure_published';
type CalendarSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKING';
interface CalendarEvent {
  id;
  type: CalendarEventType;
  title;
  date;
  endDate?;
  severity;
  metadata: Record<string, unknown>;
  linkPath;
}
interface GetEventsDto {
  startDate;
  endDate;
  types?;
  assetId?;
  locationId?;
  severity?;
}
```

**Dependencies:** the service injects **only `PrismaService`**; `OperationsCalendarModule`
declares `[controller, service]` with **no module imports** ("PrismaService is provided globally").
`getEvents` needs `userId` for the acknowledgment privacy filter + an inline `Membership` role
lookup (`isAdminOrManager` — platform-common IAM read).

**Cost to export a read method: LOW** — the service is already effectively a Prisma-only leaf.
The real cost is **type coupling**, not wiring: any consumer inherits the 6-value ops
`CalendarEventType` taxonomy and the untyped `metadata` bags.

**Verdict (thin exposed method vs new leaf read module):**

- **Thin export** — export `OperationsCalendarService` from its existing module and import it where
  needed. Cheapest wiring (nothing extra travels; the controller stays put). Consumer must adapt
  `CalendarEvent`/`CalendarEventType` itself.
- **New leaf read module** (the `RrhhBirthdayRead` / `AttributionRead` precedent) — a dedicated
  module that re-exports the reader (or a narrowed `{ events }` contract), imports nothing. Cleaner
  boundary if a **stable, narrowed** contract is wanted, and it decouples the consumer from the ops
  controller/module surface.
- Because the service is _already_ a leaf, the marginal wiring cost between the two is small; the
  decision hinges on whether the consumer should see the raw 6-value ops taxonomy (thin export) or
  a curated contract (leaf module).

---

## Q4 — Can `calendar_activities` take a `kind` enum (ACTIVIDAD | SERVICIO, default ACTIVIDAD)?

**Structurally: nothing blocks it.**

- `calendar_activities` has **no unique constraints** — only `@@index([companyId])`,
  `@@index([companyId, startDate])`, `@@map`. A new column cannot collide with any index/uniqueness.
- `kind` is **unused** anywhere in the schema (grep: no hit); a fresh `enum ActivityKind { ACTIVIDAD
SERVICIO }` + `kind ActivityKind @default(ACTIVIDAD)` is a plain additive migration.
- **Existing rows backfill to `ACTIVIDAD`** via the default — no data migration, no cron.
- Prisma `create` calls that omit `kind` get the default (see write sites below).

**But the default silently WIDENS every read that lacks a kind filter.** The 8 `calendarActivity`
query sites and whether each needs a `where: { kind }`:

| #   | Site                                                       | Op                                                                                                                  | Needs a kind filter?                                                                         |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `activities.service.ts:146` **`findAll`**                  | read — the LIST (Gestión + list endpoint); `where { companyId, +status/areaId/assigneeId/date }`, **no kind today** | **YES** — must filter or SERVICIO leaks into the Gestión table                               |
| 2   | `activities.service.ts:370` **`monthFeed`**                | read — the calendar FEED; `where { companyId, status≠CANCELADA, OR[date] }`, **no kind today**                      | **YES** — must filter or SERVICIO paints on the calendar                                     |
| 3   | `activities.service.ts:87` `getActivityOrThrow`            | read by id (detail/guard)                                                                                           | No filter (returns `kind`; fetches one row by id)                                            |
| 4   | `areas.service.ts:78` `count` (area pristine-delete guard) | read — counts activities referencing an area                                                                        | **Policy choice** — block area delete on any kind, or only ACTIVIDAD; not a correctness need |
| 5   | `activities.service.ts:270` `create`                       | write                                                                                                               | Set `kind` (default ACTIVIDAD); no filter                                                    |
| 6   | `activities.service.ts:317` `update`                       | write by id                                                                                                         | No filter                                                                                    |
| 7   | `activities.service.ts:330` `changeStatus`                 | write by id                                                                                                         | No filter                                                                                    |
| 8   | `activities.service.ts:339` `remove`                       | write by id                                                                                                         | No filter                                                                                    |

Note: the bitácora enrichment queries (`calendarActivityNote` count/findMany) key off `activityId`
and inherit the parent's kind — unaffected.

**Verdict:** adding the column is safe and backfills cleanly; the two reads that **must** be
updated in lockstep are **`findAll` (146)** and **`monthFeed` (370)**. `areas.count` (78) is a
policy decision; all other sites are id-scoped or writes.

---

## Verdict table

| Q   | Finding                                                                                                                           | Verdict                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ServiceOrder has **no** scheduling dates (only `createdAt`/`updatedAt`); status `RECIBIDA/EN_EJECUCION/COMPLETADA/CANCELADA`      | A ServiceOrder cannot supply a calendar date today                                                                                                                                      |
| 2   | **WorkPermit** is the only ranged work entity (`plannedStart`/`plannedEnd`), asset/location-scoped; **no** ops→ServiceOrder link  | No existing bridge from a ServiceOrder to a scheduled date/window                                                                                                                       |
| 3   | `getEvents(companyId, userId, GetEventsDto)` returns ops-bound `CalendarEvent[]`; service is Prisma-only (module imports nothing) | Exposure is cheap either way; **thin export** if consumer adapts the type, **leaf read module** if a narrowed contract is wanted. Real cost = type coupling to the 6-value ops taxonomy |
| 4   | No unique constraints, `kind` unused, default backfills existing rows                                                             | Column is safe; **`findAll` (146)** and **`monthFeed` (370)** must gain the filter together                                                                                             |

---

## Risks

- **No date source for a "service on the calendar."** ServiceOrder carries no date, and the only
  ranged ops entity (WorkPermit) is asset-scoped and unlinked to ServiceOrder. Anything that puts a
  service on the calendar must first establish a date SOURCE (a new field on ServiceOrder, or a
  link to a date-carrying entity) — that source does not exist yet.
- **Silent widening on `kind`.** If SERVICIO rows enter `calendar_activities`, `findAll` and
  `monthFeed` (which have no kind filter) will immediately return them. The column + both filters
  must land together, or SERVICIO leaks into the Gestión table and the calendar feed unnoticed.
- **Type coupling on exposure.** Reusing `OperationsCalendarService` imports the 6-value ops
  `CalendarEventType` + untyped `metadata` bags into the consumer, coupling Actividades to
  Operaciones' event taxonomy unless a narrowed contract is interposed.
- **Status vocabularies overlap but are NOT identical.** `ServiceOrderStatus`
  (`RECIBIDA/EN_EJECUCION/COMPLETADA/CANCELADA`) vs `ActivityStatus`
  (`PENDIENTE/EN_EJECUCION/HECHA/CANCELADA`): `EN_EJECUCION`/`CANCELADA` coincide, but
  `RECIBIDA`↔`PENDIENTE` and `COMPLETADA`↔`HECHA` are semantic, not literal — any unification needs
  an explicit mapping decision.
