# MARKETING-RECON — MKT-000 read-only reconnaissance of the reuse surface

Status: reconnaissance only. No product code, migrations, or config were changed by
this ticket. Findings, not proposals — data-model design happens after this recon.

Scope investigated: the reuse surface for the Marketing V1 module (campaigns +
campaign calendar, marketing expense tracking, a lightweight SEO/digital-presence
dashboard, and campaign→account attribution through the prepared hook
`accounts.sourceCampaignId`), against the completed Comercial, Operaciones, RRHH and
Finanzas modules as of `develop`.

All file references are repo-relative to `apps/…` unless noted. Line numbers reflect
the code at recon time and may drift.

---

## M1 — Module scaffold + menu surface

### The Comercial (COM-001) scaffold — the template for MKT-001

**Nest module declaration** — `api/src/modules/comercial/comercial.module.ts:23-35`.
The aggregator has **no providers of its own**; it composes feature submodules and
re-imports one cross-module feature:

```ts
@Module({
  imports: [
    ServiceCatalogModule, // COM-002
    AccountsModule, // COM-003
    ContactsModule, // COM-004
    OpportunitiesModule, // COM-005
    ActivitiesModule, // COM-008
    QuotesModule, // COM-010
    DisponibilidadModule, // COM-012 — imported from ../rrhh/disponibilidad
  ],
  controllers: [ComercialController],
})
export class ComercialModule {}
```

`PoliciesGuard` / `CaslAbilityFactory` / `PrismaService` are provided by the **global**
Casl/Prisma modules, not per-module (comment lines 11-22). Each submodule lives in its
own subdir with its own `.module.ts` / `.controller.ts` / `.service.ts` / `dto/`.

**Registration** — `api/src/app/app.module.ts`: import at line 20, `ComercialModule,`
in the `imports:` array at line 67 (peers: `FinanceModule` L75, `OperationsModule` L77,
`RrhhModule` L80).

**Guarded ping/health controller** — `api/src/modules/comercial/comercial.controller.ts`:

```ts
@Controller('comercial')                       // L33 → /api/comercial/*
@UseGuards(JwtAuthGuard, PoliciesGuard)         // L34
export class ComercialController {
  @Get('health')                                // L41
  @CheckPolicies((ability) => ability.can('read', AccountSubject))   // L42
  health() { return { status: 'ok', module: 'comercial', ... }; }
}
```

Two sibling endpoints (`@Get('permissions')`, `@Get('available-staff')`) follow the same
guard+policy pattern. **PoliciesGuard FAILS OPEN** (comment L24-32): a route with no
`@CheckPolicies` is authorized-by-default, so every route must declare one.

Imports: `CheckPolicies` from `../common/decorators/check-policies.decorator`,
`PoliciesGuard` from `../common/guards/policies.guard`, `JwtAuthGuard` from
`../iam/guards/jwt-auth.guard`.

**Route namespace**: global prefix `api` set in `api/src/main.ts:13-14`
(`app.setGlobalPrefix('api')`) + `@Controller('comercial')` → `/api/comercial/...`. Feature
controllers use `@Controller('comercial/...')` under the same `/api` root. Convention
across modules: `/api/<module>/...` (e.g. operations calendar is `/api/operations/calendar/events`).

**CASL default-deny floor** — `api/src/modules/common/casl/casl-ability.factory.ts`.
Six Comercial subject classes, each a class with `static readonly modelName` (L234-251):
`AccountSubject`→`'Account'`, `ContactSubject`→`'Contact'`, `OpportunitySubject`→`'Opportunity'`,
`ActivitySubject`→`'Activity'`, `ServiceCatalogSubject`→`'ServiceCatalog'`, `QuoteSubject`→`'Quote'`.
Added to the `Subjects` union (L52-57) and re-exported (L382-387). Bulk floor array
`COMERCIAL_SUBJECTS` at L279-286.

`@casl/ability` resolves conflicts by **last-rule-wins**, so the pattern per role is:
grant blanket `read all` → revoke the subjects → re-grant per role AFTER the revoke.
MANAGER branch (L404-500):

```ts
can('read', 'all'); // L405 blanket
COMERCIAL_SUBJECTS.forEach((subject) => cannot('read', subject)); // L484 FLOOR
can(['read', 'create', 'update', 'delete'], AccountSubject); // L490 re-grant
// … Contact/Opportunity/Activity/Quote re-granted after the floor …
```

- **ACCOUNTANT** (L502-551): same floor, read-only re-grants of all six.
- **ANALYST** (L553-573): floor, only `ServiceCatalogSubject` re-granted.
- **VIEWER** (L575-620): no blanket `read all`, so no revoke needed; only explicitly
  grants `read ServiceCatalogSubject`.
- **SUPER_ADMIN / ADMIN** (L396-401): `can('manage', 'all')`.

This mirrors the RRHH pattern (`RRHH_SUBJECTS` L254-268, `RRHH_COMPENSATION_SUBJECTS`
L270-274). A future Marketing module clones this: subject classes → `Subjects` union +
exports → a `MARKETING_SUBJECTS` array → per-role `cannot('read', …)` floor + re-grants.

**Config-driven sidebar** — `web/src/components/sidebars/` holds one per module
(`ComercialSidebar.tsx`, `OperationsSidebar.tsx`, `RrhhSidebar.tsx`, `FinanceSidebar.tsx`,
shared `SidebarBrand.tsx`). Selection is per-route in the dashboard layout
`web/src/app/(dashboard)/layout.tsx:50-66`:

```tsx
const isComercial = pathname?.startsWith('/comercial') ?? false;
{
  isComercial ? (
    <ComercialSidebar />
  ) : isRrhh ? (
    <RrhhSidebar />
  ) : isOperations ? (
    <OperationsSidebar />
  ) : (
    <FinanceSidebar />
  );
} // Finance = default fallback
```

The sidebar body is a `navItems` array (`ComercialSidebar.tsx:15-18`) mapped to links with
`isActive` computed as `pathname === href || pathname.startsWith(href + '/')`, reusing
shared `.tn-sidebar*` CSS (zero new CSS). Adding Marketing = new
`isMarketing = pathname.startsWith('/marketing')` branch + a `MarketingSidebar.tsx`.

### Module selector menu — `web/src/app/modulos/page.tsx`

`ModuleDef` type (L10-18): `{ key, name, description, gradient, href: string|null,
active: boolean, svg }`.

**Gating**: `handleSelect` (L407-410) early-returns if `!mod.active || !mod.href`. Render
(L486-518): inactive cards get `cursor:not-allowed; opacity:0.72`, `aria-disabled`, and a
`PRÓXIMAMENTE` badge (L507); active cards get an `ArrowRight` and push to `href`.

**The "Calendario" card** (L370-377):

```ts
{ key: 'calendario', name: 'Calendario',
  description: 'Calendario general de actividades y gestión organizacional',
  gradient: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
  href: null, active: false, svg: <CalendarioSvg /> },
```

`href: null`, `active: false` → renders PRÓXIMAMENTE, not clickable. **Nothing lives behind
it** — there is no `/calendario` route. The only real calendar page in the app is the
Operaciones one at `web/src/app/(dashboard)/operaciones/calendario/page.tsx`, reached via
`/operaciones/calendario`, unrelated to this card. **The plan to "rename the Calendario card"
therefore repurposes an inactive, route-less placeholder card into Marketing** — no existing
route or feature is displaced.

**A "Marketing" card does NOT exist.** The `MODULES` array (L332-387) has 6 entries:
`finanzas` (active,`/dashboard`), `operaciones` (active,`/operaciones`), `hsec`
(inactive,null), `comercial` (active,`/comercial`), `calendario` (inactive,null), `rrhh`
(active,`/rrhh`). The only forward-reference to Marketing in the entire codebase is the
`sourceCampaignId` hook comment (see M2). Comercial card for comparison (L360-368): `key
'comercial'`, `href '/comercial'`, `active: true`, pink gradient — comment records COM-015
flipping it live.

---

## M2 — The `sourceCampaignId` contract (Comercial side)

**Schema** — `api/prisma/schema/comercial.prisma`, `Account` model (L72-96), field at L83:

```prisma
sourceCampaignId String?  @db.Uuid  // Marketing hook — NO FK (campaigns table not created yet)
```

Nullable Postgres `UUID`, no `@map`, **no `@relation`, no `@@index`**. The only FK on
`Account` is `counterparty` (L89, `onDelete: SetNull`); the only index is `@@index([companyId])`
(L94). Model doc comment (L61-71) states the hook is intentional and FK-less. Confirmed in
migration `api/prisma/schema/migrations/20260702130000_add_accounts/migration.sql`: column
declared `"sourceCampaignId" UUID,`, the only index is `accounts_companyId_idx`, the only FK
is `accounts_counterpartyId_fkey`.

**Settable through the API? Yes — shape-validated only (no existence check, since there is no
table to check).**

- `accounts/dto/create-account.dto.ts:56-59`: `@IsOptional() @IsUUID() sourceCampaignId?: string;`
- `accounts/dto/update-account.dto.ts:7`: `UpdateAccountDto extends PartialType(CreateAccountDto)` → inherited updatable.
- `accounts/accounts.service.ts`: create L54 `sourceCampaignId: dto.sourceCampaignId ?? null`; update
  L68-70 spreads `...dto` straight through. Unlike `counterpartyId`, there is **no
  `assertCounterpartyInCompany`-style validation** (there can't be — no campaigns table).

**Rendered? Read-only, in one place only.**
`web/src/app/(dashboard)/comercial/cuentas/[id]/page.tsx`: type field L34; conditional
read-only display L234-236 (`<KV label="Campaña de origen" value={account.sourceCampaignId} mono />`).
No create/edit form field exposes it. (Other `campaign`/`sourceCampaignId` hits in `web` are
`.next` build artifacts.)

**Converting to a real FK + index — what it takes.** Two reference migration shapes:

1. _Altering an existing table needs no RLS/GRANT/audit boilerplate._ Per
   `20260708160000_add_account_payment_term_days/migration.sql` (single `ALTER TABLE
"accounts" ADD COLUMN …`), whose own comment notes: accounts already has its RLS policy,
   `app_user` GRANT, and row-level `audit_trigger_function()` trigger — a `FOR EACH ROW`
   trigger reads the whole `NEW` row, so an added column is captured automatically.
2. _New-table boilerplate_ (for the `campaigns` table itself) is the standard block, verbatim
   from `20260702150000_add_opportunities/migration.sql`: `CREATE INDEX` + `ADD CONSTRAINT …
FOREIGN KEY … REFERENCES …` + `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY … USING
("companyId" = current_setting('rls.company_id', true)::uuid)` + `GRANT SELECT, INSERT,
UPDATE, DELETE … TO app_user` + `CREATE TRIGGER audit_… AFTER INSERT OR UPDATE OR DELETE …
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function()`.

So the FK conversion needs only: (a) a `campaigns` table to reference, (b)
`CREATE INDEX "accounts_sourceCampaignId_idx" ON "accounts"("sourceCampaignId");`, and (c)
`ALTER TABLE "accounts" ADD CONSTRAINT accounts_sourceCampaignId_fkey FOREIGN KEY
("sourceCampaignId") REFERENCES "campaigns"("id") …`. **Recommended `ON DELETE`: `SET NULL`**
(preserve the account, drop the dangling campaign attribution) — matches the existing
`counterparty` FK's `SetNull` posture and avoids `RESTRICT` blocking campaign deletion.

**Checking for existing production rows (do NOT execute — noted only):** a read-only
`SELECT count(*) FROM accounts WHERE "sourceCampaignId" IS NOT NULL;` (run per-tenant under
RLS, or as a superuser aggregate) would reveal whether any rows already carry a value that a
new FK constraint would reject as orphaned. Because the column has never been FK-backed, any
non-null value is currently unvalidated and could point at a non-existent campaign — such
rows must be reconciled (or nulled) **before** the FK is added, or the `ADD CONSTRAINT` will
fail.

---

## M3 — Calendar UI reuse

**Location.** Page: `web/src/app/(dashboard)/operaciones/calendario/page.tsx`. View
components: `web/src/components/operations/calendar/` — `MonthView.tsx`, `WeekView.tsx`,
`DayView.tsx`, `ListView.tsx`, `EventDetailModal.tsx`, `types.ts`, `utils.ts`.

**Architecture: hybrid — presentational views are props-driven and reusable; the data
contract, page shell, and backend are operations-bound.**

`MonthView` is purely presentational (`MonthView.tsx:18-23`):

```ts
interface MonthViewProps {
  focusedDate: Date;
  events: CalendarEvent[];
  onSelectDay: (day: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}
```

It renders a fixed 6×7 grid, caps at 3 events/cell, has no fetch, no ops queries — genuinely
reusable as a grid renderer.

**The coupling is the contract.** `CalendarEvent` (`types.ts:16-25`) carries a
`type: CalendarEventType`, which is a **closed union of operations concepts** (`types.ts:6-12`):
`'document_expiration' | 'permit_expiration' | 'work_permit_scheduled' |
'acknowledgment_deadline' | 'exception_expiration' | 'procedure_published'`. `TYPE_META`
(`types.ts:56-96`) hardcodes label/color/bg for exactly those 6 types, and `MonthView.tsx:118`
does `const meta = TYPE_META[e.type]` — an unknown type yields `undefined` and crashes.
`CalendarFilters` (`types.ts:45-50`) bakes in `assetId`/`locationId`. The page fetches
`/api/operations/calendar/events` (`page.tsx:221-223`) and exports `/api/operations/calendar/export`
(iCal). Backend `api/src/modules/operations/calendar/operations-calendar.service.ts` fans out
to 6 private fetchers, each querying operations tables and hardcoding `type` + `/operaciones/*`
`linkPath`.

**Verdict: extract-and-parameterize the views, build new backend feed + page.** The
`MonthView`/`WeekView`/`DayView`/`ListView` + `utils` are worth extracting out of
`operations/` into a shared calendar with `TYPE_META`/type-union passed in (or made generic);
Marketing then builds its own `/api/marketing/calendar/events` feed and a page shell (the ops
`page.tsx` is hardcoded to ops title/filters/endpoints). Rebuilding the grid from scratch is
unnecessary; rewiring the data contract is unavoidable.

---

## M4 — Alert engine fit

**Schema** — `api/prisma/schema/operations.prisma`. `AlertRule` → `alert_rules` (L302-327) is
**hardcoded to documents**: its only subject is `documentTypeId` (FK →
`OperationalDocumentType`, nullable = global default) and its only trigger dimension is
`daysBeforeExpiration Int`. **There is no `ruleType`/`type`/`module`/`source` discriminator** a
non-operations module could set. `AlertInstance` → `alert_instances` (L350-413) requires
operations FKs (`assetId`, `documentTypeId`, `documentRecordId`, `permitTypeId`, `permitId`,
`locationId`); its `triggerType` enum is `EXPIRING_SOON | EXPIRED | MISSING | BLOCKING`
(document-expiry semantics only); idempotency key `(companyId, assetId, documentTypeId,
triggerType, daysBeforeExpiration, status)` (L407) is asset/document-shaped.
`CompanyAlertSettings` → `company_alert_settings` (L418-436) is expiry/blocking oriented
(`defaultDaysBefore`, `enableAutoBlocking`, `enableAutoCommitments`). A separate, unrelated
finance alerts schema exists at `api/prisma/schema/alerts.prisma` (`AlertType` =
`COMMITMENT_DUE | LOW_CASH_BALANCE | DRAFT_MOVEMENTS | PERIOD_CLOSING | RECONCILIATION`) — also
not a generic registration surface.

**The daily job is a hardcoded entity scan, not pluggable.**
`api/src/modules/operations/alerts/alert-engine.processor.ts`: `@Processor(OPERATIONS_ALERT_ENGINE_QUEUE)`,
`DAILY_CRON = '0 6 * * *'`, registered idempotently in `onModuleInit`.
`alert-engine.service.ts`: `processCompany` loads `prisma.operationalAsset.findMany(...)` and
loops assets, resolving `DocumentRequirements` and creating `AlertInstance` rows; a second pass
`processCompanyPermits` scans `prisma.permit.findMany(...)`. **No rule-type registry, no handler
map, no plugin interface** — the scanned entities are literally `operationalAsset`,
`documentRecord`, `permit`.

**RRHH precedent: it did NOT register into the ops engine — it built its own thin parallel
path.** `api/src/modules/rrhh/contracts/rrhh-reminders.processor.ts`:
`@Processor(RRHH_REMINDERS_QUEUE)` — its **own** queue and cron (`0 7 * * *`), header comment
calling it "a SIBLING daily job … mirroring how the Operations AlertEngineProcessor hosts
several repeatables." The RRHH reminder services do **not** write `AlertInstance`/`alert_rules`;
they reuse only the generic notification inbox — `contract-reminders.service.ts` injects
`NotificationService` from `../../operations/notifications/notification.service` and calls
`createGeneric(... sourceType: 'GENERAL' ...)` with its own same-day `linkPath` idempotency
(L100-106). RRHH shares only the `user_notifications` sink and the `AlertSeverity` enum.

**Verdict: Marketing cannot register "campaign ends in N days" / "campaign over budget" into
the existing ops engine.** `alert_rules` has no module discriminator and no representable
trigger for "over budget" (expiry-only model); `alert_instances` demands ops FKs.
**Marketing should follow the RRHH precedent** — its own `MARKETING_REMINDERS_QUEUE` +
processor + campaign-scan/threshold services, emitting into the shared
`user_notifications` inbox via `NotificationService.createGeneric`. "Over budget" in particular
has no home in the ops rule model and must be computed in a Marketing-owned service.

---

## M5 — Finance touchpoints for marketing expenses

**Movement** — `api/prisma/schema/movements.prisma:20-56`. Enums (L1-18):
`MovementType {INCOME EXPENSE}`, `MovementStatus {DRAFT CONFIRMED RECONCILED CANCELLED}`,
`MovementSource {MANUAL IMPORT BANK_SYNC TAX_SYNC}`. Key fields: `fiscalPeriodId @db.Uuid`
(**required**), `categoryId @db.Uuid` (**required, non-null**), `counterpartyId?`,
`type`, `status @default(DRAFT)`, `source @default(MANUAL)`, `amount Decimal(18,2)`,
`date @db.Date`, `metadata Json?`. `@@index([companyId, type, status])`. **Note: Movement has
no `sourceType`/`sourceId`** — that provenance pair lives only on `Commitment`.

**Commitment** — `api/prisma/schema/cashflow.prisma:58-94`. `CommitmentStatus {PENDING PAID
CANCELLED FULFILLED}` (FULFILLED = auto-cleared, no cash). Fields: `fiscalPeriodId @db.Uuid`
(**required**), `categoryId? @db.Uuid` (**optional**), `type MovementType` (reuses INCOME/EXPENSE),
`amount Decimal(18,2)`, `dueDate @db.Date`, `status @default(PENDING)`, `movementId? @db.Uuid`
(link to realized Movement), **`sourceType String?` + `sourceId? @db.Uuid`** (provenance),
`sourceMetadata Json?`, `isAutoGenerated @default(false)`. Dedup index
`@@index([companyId, sourceType, sourceId])`. Also `CommitmentTemplate`
(`cashflow.prisma:101-124`) — per-(documentType|permitType) cost templates the renewal
listeners use.

**Category** — `api/prisma/schema/catalogs.prisma:1-27`: `CategoryType {INCOME EXPENSE}`,
`name`, `type`, `parentId?` (self-tree), `@@unique([companyId, name, type])`.
**CategoryRule** — `api/prisma/schema/category-rules.prisma:1-29`: `CategoryRuleType {RUT
KEYWORD DEFAULT}`, `CategoryRuleMovementType {INCOME EXPENSE BOTH}`, `priority`, `ruleType`,
`matchValue?`, `categoryId`, `movementType`, `@@index([companyId, isActive, priority])`.

**The COM-014 listener template** — lives in the **finance** module (not comercial):
`api/src/modules/finance/opportunity-commitment.listener.ts`. Constants:
`SOURCE_TYPE = 'comercial_opportunity_won'`, `HANDLER = 'comercial-income-commitment'`.

- **Event**: `@OnEvent('comercial.opportunity-won')` (L48), `handleOpportunityWon(event:
ComercialOpportunityWonEvent)`.
- **Payload** (`ComercialOpportunityWonEvent`, `operations/events/domain-event-types.ts:153-173`):
  `type, companyId, occurredAt, opportunityId, quoteId, clientName, counterpartyId|null, title,
description, scopeLines[], netAmount, taxAmount, totalAmount, currency, ownerId,
paymentTermDays`. The payment term rides in the payload, so the listener never reads a
  comercial/accounts table.
- **Toggle** (L53-56): `settings = alertSettings.getOrCreate(companyId, null)`; `if
(!settings.enableAutoCommitments) return { skipped: 'auto-commitments disabled' }`. Same
  company-wide toggle the renewal handlers use; no separate income toggle in V1.
- **Dedup before insert** (L62-73): `prisma.commitment.findFirst({ where: { companyId,
sourceType: SOURCE_TYPE, sourceId: event.opportunityId, autoFulfilledAt: null }})` → early
  return `{ skipped: 'commitment exists', commitmentId }`.
- **Fiscal-period graceful skip** (L83-96): compute `dueDate =
projectedDueDate(occurredAt, paymentTermDays)`, then `fiscalPeriod.findFirst({ companyId,
year, month })`; if missing → warn + `return { skipped: 'no fiscal period' }` — **does not
  throw**.
- **Create** (L101-137): via `rls.executeWithRls(companyId, null, tx =>
tx.commitment.create(...))`; `type: 'INCOME'`, `amount = totalAmount`, `status: 'PENDING'`,
  `sourceType/sourceId`, `categoryId: null`, `isAutoGenerated: true`, rich `sourceMetadata`.
- **Discipline** (L138-143): genuine failure **re-throws** so `DomainEventsService.markFailed`
  flips the audit row FAILED and the retry cron re-delivers; expected no-ops **return** a
  `{ skipped }` object.

Its sibling template is `api/src/modules/finance/operations-listeners.service.ts` (renewal
handlers `@OnEvent('document.renewal-imminent')` L41, `permit.renewal-imminent` L65) — same
enable→dedupe→fiscal-period-or-skip→create sequence. A future **marketing-expense → Finanzas**
projection (`type: 'EXPENSE'`) copies this shape.

**SII double-count collision point** — `api/src/modules/tax/tax.service.ts`.
`createMovementFromDocument` (L515-592): idempotency guard `if (taxDoc.movementId) return
false;` (L540); `RECIBIDO` → **EXPENSE** (L542); category via `applyCategoryRules` (RUT then
keyword, L462-483); Movement created with `source: TAX_SYNC, status: CONFIRMED, amount:
taxDoc.totalAmount` (L565-584); then links back `taxDocument.update({ movementId, isReconciled:
true })` (L586-589). **Collision:** a hand-entered marketing expense is a `Movement` with
`source: MANUAL` and no `TaxDocument` link (Movement has no `sourceType/sourceId`, no folio
field). The SII idempotency checks are (1) `TaxDocument` `@@unique([companyId, type, folio,
direction])` and (2) `taxDoc.movementId` — **neither sees the manual movement**. So when the
same supplier invoice later arrives via SII, the sync creates a **second** EXPENSE movement
(`source: TAX_SYNC`). The colliding real-world key is **supplier RUT + folio** (`issuerRut` +
`folio` on the arriving TaxDocument), which today has **no counterpart field on the manual
Movement** to reconcile against. A marketing-expense feature that projects into Finanzas must
plan to stamp RUT+folio (or the `taxDoc.movementId` link) onto its movement/commitment to
prevent this double-count.

---

## M6 — domain_events conventions

**Table** — `api/prisma/schema/operations.prisma:1084-1133`. `DomainEventStatus {PENDING
PROCESSED FAILED}`. Columns: `eventType String` (dotted name), `aggregateType String`,
**`aggregateId String @db.Uuid`** (L1103 — the landmine), `payload Json`, `occurredAt
@default(now())`, `handledAt?`, `status @default(PENDING)`, `handlerResults Json?`,
`failureReason?`, `retryCount @default(0)`. Idempotency `@@unique([companyId, eventType,
aggregateId, occurredAt])` (L1128). **No `sourceType`/`sourceId` on the event itself** — those
live on `Commitment`.

**Emitter** — `api/src/modules/operations/events/domain-events.service.ts:40`:
`async emit<T extends OperationsDomainEvent>(event: T): Promise<string | null>`. Persistence-first,
then async broadcast via `emitter.emitAsync(event.type, event)` wired to `markProcessed` /
`markFailed`. Returns the row id, or **`null`** on a P2002 dedup **or any other persistence
failure** (L58-71). `emitMany` fans out one-by-one.

**Registry** — `api/src/modules/operations/events/domain-event-types.ts`. Event names in the
`EVENT_TYPES` array (L247-256): `document.renewal-imminent`, `permit.renewal-imminent`,
`asset.blocked`, `asset.unblocked`, `work-permit.closed`, `procedure.acknowledgment-expired`,
`operational.cost`, `comercial.opportunity-won`. Union `OperationsDomainEvent` (L176-184),
`AGGREGATE_TYPES` (L189-197), `aggregateIdForEvent()` (L221-243). Emit call site
(`comercial/opportunities/opportunities.service.ts:358-376`): emit FIRST, stamp `handoffAt`
only after a non-null id returns; a null return throws `InternalServerErrorException` and
leaves the opportunity resendable.

**The `aggregateId @db.Uuid` landmine** — `domain-event-types.ts:238-241`:

```ts
case 'comercial.opportunity-won':
  /* MUST be the raw opportunity UUID — aggregateId is a @db.Uuid column, so a
     composite string would make emit() silently swallow the row (the landmine). */
  return event.opportunityId;
```

Mechanism: a non-UUID string fails the Postgres uuid cast → Prisma throws → `emit()`'s catch
returns `null` (only P2002 is treated as a benign dupe; all other errors are swallowed to
null). Contrast `procedure.acknowledgment-expired` (L233-235) which uses a composite
`${procedureId}:${userId}` key — **a future `marketing.*` event must use a real UUID
aggregateId** (the campaign id), never a composite string.

**occurredAt**: column default `@default(now())` but in practice **passed in** — emitters stamp
a stable ISO timestamp once and reuse it as both the event `occurredAt` and the domain object's
timestamp, so a re-emit hits the `@@unique(...occurredAt)` and dedups instead of duplicating.

**Retry cron** — `alert-engine.processor.ts`: `DOMAIN_EVENTS_RETRY_CRON = '*/15 * * * *'`
(every 15 min) → `domainEvents.retryFailed()`. `retryFailed()`
(`domain-events.service.ts:151-197`): selects `status: FAILED, retryCount < MAX_RETRIES (3)`,
take 100 oldest-first; resets to `PENDING` + increments `retryCount` **before** re-broadcasting
the **original row's payload** (does not re-persist). **Listener idempotency requirement:**
because the cron re-delivers the same payload, every `@OnEvent` handler must dedupe before
inserting (convention: `findFirst` on `(companyId, sourceType, sourceId)` → early-return),
**throw** on genuine failure (so `markFailed` + retry), and **return** `{ skipped }` on expected
no-ops (so `markProcessed`).

---

## M7 — Attribution / ROI query path

**Models** (`api/prisma/schema/comercial.prisma`):

- `Account` (accounts, L72-96): `sourceCampaignId String? @db.Uuid` (L83), `opportunities
Opportunity[]` (FK on child, `onDelete: Restrict`).
- `Opportunity` (opportunities, L158-187): `accountId @db.Uuid` (FK → accounts RESTRICT),
  `stage OpportunityStage @default(PROSPECTO)`, `quotes Quote[]` (FK on child RESTRICT).
- `OpportunityStage` enum (L131-140): `PROSPECTO, CONTACTO, VISITA_TECNICA, COTIZACION,
NEGOCIACION, GANADA, PERDIDA, EN_PAUSA` — **won = `GANADA`** (semi-terminal, reopen-only).
- `Quote` (quotes, L293-321): `opportunityId @db.Uuid` (FK → opportunities RESTRICT), `status
QuoteStatus @default(BORRADOR)`, money all `Decimal(18,2)`: `netAmount, taxAmount,
totalAmount, taxRate(5,2)`, plus `acceptedAt DateTime?`.
- `QuoteStatus` enum (L273-279): `BORRADOR, ENVIADA, ACEPTADA, RECHAZADA, SUPERSEDIDA` —
  **accepted = `ACEPTADA`**.

**ROI read path**: `accounts WHERE sourceCampaignId = X` → `opportunities ON accountId WHERE
stage = 'GANADA'` → `quotes ON opportunityId WHERE status = 'ACEPTADA'` → sum
`netAmount`/`totalAmount`. All three joins are on real columns; only the first hop has no
supporting index.

**Indexes along the path:**

| Table         | Index                                                                                                     | Status vs ROI path                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| accounts      | `accounts_companyId_idx` (L94)                                                                            | exists                                                                                                                                                                              |
| accounts      | `sourceCampaignId`                                                                                        | **MISSING** — the ROI entry-point filter; seq-scan bounded only by RLS companyId                                                                                                    |
| opportunities | `opportunities_companyId_idx`, `_accountId_idx`, `_stage_idx` (L183-185)                                  | exist (join + filter covered individually; no composite `(accountId, stage)`)                                                                                                       |
| quotes        | `quotes_opportunityId_idx` (L318)                                                                         | exists (covers the join)                                                                                                                                                            |
| quotes        | `quotes_one_accepted_per_opportunity` — PARTIAL UNIQUE `ON quotes(opportunityId) WHERE status='ACEPTADA'` | exists **in raw SQL only** (migration `20260707120000` L56), NOT in the Prisma schema (Prisma can't express a filtered unique index); doubles as an efficient accepted-quote lookup |

Net: the two child joins and the `stage`/`ACEPTADA` filters are well-indexed. **The one missing
index for the ROI path is `accounts.sourceCampaignId`** — it should be added alongside the FK
conversion (M2).

**Pitfalls (what the model actually allows):**

1. **A GANADA deal can be reopened.** `opportunities/opportunities.service.ts:253-270`
   `reopen()` sets `stage: NEGOCIACION`, `closedAt: null`. So `stage = GANADA` is not permanent
   — an ROI snapshot and a later re-query can differ.
2. **A quote stays ACEPTADA when its deal is reopened.** `reopen()` touches only the
   opportunity row; it does not reset/supersede quotes. You can have an ACEPTADA quote hanging
   off an opportunity now in `NEGOCIACION`. A `stage=GANADA AND ACEPTADA` path misses such
   revenue; an `ACEPTADA`-only path counts deals no longer won. (Accept logic
   `quotes.service.ts:194-235` auto-supersedes sibling BORRADOR/ENVIADA quotes to SUPERSEDIDA.)
3. **Multiple accounts per campaign — allowed and intended** (1 campaign → N accounts fan-out).
   No uniqueness on `sourceCampaignId`; and with no FK, a value may point at a non-existent
   campaign (no referential integrity until the FK is added).
4. **At most ONE ACEPTADA quote per opportunity — enforced at DB level** by the partial unique
   index + an in-transaction pre-check (`quotes.service.ts:202-235`). No double-counting within
   an opportunity. (An opportunity may hold many quote versions via `@@unique([opportunityId,
version])`, only one ACEPTADA at a time.)
5. **Multiple opportunities / multiple GANADA per account — allowed.** One campaigned account
   can contribute several won deals to the ROI sum.
6. **`Opportunity.estimatedValue Decimal? @db.Decimal(18,2)`** (L165, nullable) is a pipeline
   estimate, distinct from realized `Quote.netAmount/totalAmount`. For ROI use the accepted
   quote's money, not `estimatedValue`.

---

## Reuse verdict table

| Surface                                                                                  | Verdict                                                                                       | Risk                                                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Nest module scaffold (COM-001: aggregator + submodules + guarded controller)             | **reuse as-is** (clone the pattern)                                                           | Low                                                                                    |
| CASL default-deny floor (`MARKETING_SUBJECTS` + per-role floor/re-grant, last-rule-wins) | **reuse as-is** (clone the pattern)                                                           | Med — PoliciesGuard fails open; every route needs `@CheckPolicies`                     |
| Config-driven sidebar + `(dashboard)/layout.tsx` route branch                            | **reuse as-is** (add `MarketingSidebar` + `isMarketing` branch)                               | Low                                                                                    |
| Module selector card (rename/repurpose the inactive "Calendario" card, or add a new one) | **parameterize** (`ModuleDef` entry, later flip `active`/`href`)                              | Low — Calendario card is route-less placeholder; nothing displaced                     |
| `accounts.sourceCampaignId` hook → real FK + index                                       | **parameterize** (add `campaigns` table, index, FK `ON DELETE SET NULL`)                      | Med — unvalidated existing values may orphan the FK; reconcile before `ADD CONSTRAINT` |
| Operaciones month-grid calendar views                                                    | **parameterize** (extract views out of `operations/`, inject `TYPE_META`/type union)          | Med — closed `CalendarEventType` union + `TYPE_META[e.type]` crashes on unknown types  |
| Operaciones calendar backend/page                                                        | **build new** (`/api/marketing/calendar/events` + Marketing page shell)                       | Low                                                                                    |
| Operations alert engine (`alert_rules`/`alert_instances`/`AlertEngineService`)           | **thin own path** (RRHH precedent: own queue+processor → `NotificationService.createGeneric`) | Med — engine is document-expiry-hardcoded; "over budget" has no representable trigger  |
| Finance projection listener (COM-014 → Commitment)                                       | **reuse as-is** (clone the enable→dedupe→fiscal-skip→create shape, `type: EXPENSE`)           | Med — SII double-count if not reconciled on RUT+folio                                  |
| domain_events emit/registry/retry                                                        | **reuse as-is** (register `marketing.*` names, real-UUID aggregateId, idempotent listeners)   | High — `aggregateId @db.Uuid` landmine silently swallows the row                       |
| ROI attribution query                                                                    | **build new** (the read path exists but needs its entry-point index)                          | Med — reopened-deal / accepted-quote drift; `sourceCampaignId` unindexed               |

---

## Open risks & landmines (things Marketing must not step on)

1. **`aggregateId` is `@db.Uuid`.** Any `marketing.*` domain event MUST use a real UUID (the
   campaign id) as `aggregateId`. A composite string fails the uuid cast and `emit()` returns
   `null` — the row is silently swallowed, no error surfaces. (`domain-event-types.ts:238-241`.)
2. **PoliciesGuard fails open.** Every Marketing endpoint needs
   `@UseGuards(JwtAuthGuard, PoliciesGuard)` + a `@CheckPolicies`. A missing decorator = a
   world-open endpoint. New CASL subjects need the `cannot('read', …)` floor + per-role
   re-grants placed AFTER the floor (last-rule-wins).
3. **`sourceCampaignId` has no FK and no index today, and values are unvalidated.** Before
   adding the FK, check for existing non-null values that would orphan the constraint (they may
   point at nothing) and reconcile/null them; add `accounts_sourceCampaignId_idx` in the same
   migration or ROI queries seq-scan. Recommended FK: `ON DELETE SET NULL`.
4. **Calendar type union is closed and unguarded.** `MonthView` does `TYPE_META[e.type]` with no
   fallback — feeding it a campaign event type it doesn't know crashes the render. Parameterize
   `TYPE_META`/the union before reusing.
5. **"Campaign over budget" has no home in the ops alert engine.** `alert_rules` models only
   `daysBeforeExpiration`; there is no budget/threshold trigger and no module discriminator.
   Follow the RRHH thin-path precedent (own queue → `user_notifications` inbox), don't try to
   extend `alert_rules`/`alert_instances`.
6. **SII double-count for marketing expenses.** A hand-entered marketing `Movement`
   (`source: MANUAL`) shares no reconcilable key with the same invoice arriving via SII
   (`source: TAX_SYNC`); SII idempotency only checks `TaxDocument` uniqueness and
   `taxDoc.movementId`, never manual movements. Any Finanzas projection must stamp RUT+folio (or
   the taxDoc link) to dedup.
7. **GANADA is reopenable and ACEPTADA persists across reopen.** ROI must define its stance:
   `stage=GANADA` and "has an ACEPTADA quote" can disagree after a `reopen()`. Pick one as the
   revenue source of truth and document it — the two paths produce different totals.
8. **Cross-module discipline.** Marketing must not import Comercial/Finanzas modules. Reach
   Comercial data only through schema-only Prisma relations (Prisma is `@Global`) and the
   `domain_events` bus; idempotent, retry-cron-tolerant listeners only.
9. **Migrations are hand-authored.** Do not rely on `prisma migrate dev` autogen (known DB
   drift). Every new table needs RLS policy + audit trigger + `app_user` GRANT in the same
   migration; altering an existing table (e.g. adding the FK to `accounts`) needs none of that
   boilerplate (the row-level audit trigger captures new columns automatically).
