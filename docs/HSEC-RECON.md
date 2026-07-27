# HSEC-000 — Read-only reconnaissance for the HSEC module

**Type:** READ-ONLY recon. Findings + verdicts + risks only — no proposals beyond the verdicts.
**Date:** 2026-07-27.
**Scope:** five questions grounding the HSEC design session: the card + gating pattern, the
safety-adjacent boundary in Operaciones and RRHH, the reusable machinery, and prior art /
collisions. Line numbers reflect the code at recon time and may drift.

---

## Q1 — The `hsec` card and the gating pattern

### The card

**File:** `apps/web/src/app/modulos/page.tsx:369-377`. Verbatim:

```tsx
  {
    key: 'hsec',
    name: 'HSEC',
    description: 'Salud, seguridad, medio ambiente y comunidades',
    gradient: 'linear-gradient(135deg, #10B981, #059669)',
    href: null,
    active: false,
    svg: <HsecSvg />,
  },
```

`ModuleDef` type (L10-18): `{ key, name, description, gradient, href: string|null, active:
boolean, svg }`. The icon is `HsecSvg` (L103, a shield with a `hsec-pulse` animated ring —
keyframes `hsecpulse` at L950). The card sits third of 7 entries in `MODULES` (after
finanzas, operaciones) and is the ONLY remaining `active: false` entry.

### The gating mechanism (all of it is in this one file)

Click guard (L438-441):

```tsx
const handleSelect = (mod: ModuleDef) => {
  if (!mod.active || !mod.href) return;
  router.push(mod.href);
};
```

Render gating (L517-543): inactive cards get no `role="button"`, `tabIndex={-1}`,
`aria-disabled`, no arrow, and the badge (L538):

```tsx
{
  !isActive && <div className="module-card__badge">PRÓXIMAMENTE</div>;
}
```

**Nothing else gates the route.** There is no middleware, no server-side module gate: once a
route folder exists under `(dashboard)`, its pages are reachable by direct URL regardless of
the card (the established pattern — MKT-001/CAL-001 ACs verify "placeholder pages reachable
by direct URL" while the card stays gated). Today `/hsec` has no route folder at all (Q5d),
so there is nothing to reach.

### The unlock pattern (COM-015 / MKT-010 / CAL-007)

The freshest executed instance is self-documented on the Calendario card (L407-409),
verbatim:

```tsx
  {
    // CAL-007 — un-gated: Calendario de Actividades is live (three views, chips by area,
    // birthdays feed). Was gated ("Próximamente") through CAL-001..006 (COM-015/MKT-010 pattern).
    key: 'calendario-actividades',
```

The precise two-step pattern HSEC's own tickets will repeat:

1. **Shell ticket** (COM-001 / MKT-001 / CAL-001 analog): the card gains
   `href: '/hsec'` but **keeps `active: false`** — clickable never, badge stays, pages
   reachable only by direct URL for founder validation.
2. **Close ticket** (COM-015 / MKT-010 / CAL-007 analog): flips `active: false → true`
   (and adds the dated un-gating comment). The two fields `href` + `active` are the entire
   gate; no other file participates.

---

## Q2 — Operaciones' safety-adjacent ground (the boundary inventory)

### Q2a — Internal work permits (permisos de trabajo)

**File:** `apps/api/prisma/schema/operations.prisma:686-707` — the category + status enums,
verbatim:

```prisma
enum WorkPermitCategory {
  HEIGHT_WORK
  HOT_WORK
  CONFINED_SPACE
  LOCKOUT_TAGOUT
  EXCAVATION
  LIFTING
  ELECTRICAL_WORK
  CHEMICAL_HANDLING
  OTHER
}

enum WorkPermitStatus {
  DRAFT
  PENDING_AUTHORIZATION
  AUTHORIZED
  IN_EXECUTION
  SUSPENDED
  CLOSED
  CANCELLED
  EXPIRED
}
```

`WorkPermitType` (`operations.prisma:709-741`) — the configurable per-company catalog,
verbatim (key fields):

```prisma
model WorkPermitType {
  id                       String             @id @default(uuid()) @db.Uuid
  companyId                String             @db.Uuid
  name                     String
  code                     String
  category                 WorkPermitCategory
  description              String?
  maxDurationHours         Int                @default(8)
  requiredRoles            String[]           @default([])
  requiresMedicalAptitude  Boolean            @default(false)
  requiresSpecificTraining Boolean            @default(false)
  requiresGasMeasurement   Boolean            @default(false)
  requiresIsolation        Boolean            @default(false)
  defaultRisks             String[]           @default([])
  defaultControls          String[]           @default([])
  ...
  @@unique([companyId, code])
  @@unique([companyId, name])
  @@map("work_permit_types")
}
```

`WorkPermit` (`operations.prisma:743-816`) — the full lifecycle row: planned/actual windows
(`plannedStart/plannedEnd/actualStart/actualEnd`), `workTeam Json` (supports external
workers without user accounts), `identifiedRisks`/`controlMeasures` arrays, authorization +
closure stamps, **`incidentsReported Boolean @default(false)` + `incidentDescription
String?` (L777-778)**, category-specific payloads `gasMeasurements Json?` (append-only
readings log) and `isolationPoints Json?` (live LOTO state), inline `attachments Json`
(max 5, MinIO-or-blob convention), OPS-026 multi-step approval fields
(`currentApprovalStep/totalApprovalSteps/isFullyApproved`), auto-numbered
`permitNumber` "PT-{YEAR}-{0000}".

**Where the altura/caliente/espacio-confinado TYPES live: BOTH a table and a seed.** The
table is `work_permit_types` (per-company rows); the Chilean catalog is a **code constant
seeded on demand** — `DEFAULT_WORK_PERMIT_TYPES` in
`apps/api/src/modules/operations/permits/work-permits/work-permit-types.constants.ts:25-177`,
6 entries: `PT-ALT` Trabajo en Altura (HEIGHT_WORK), `PT-CAL` Trabajo en Caliente (HOT_WORK),
`PT-EC` Espacio Confinado (CONFINED_SPACE), `PT-LOTO` Bloqueo y Tarjeteo (LOCKOUT_TAGOUT),
`PT-EXC` Excavación (EXCAVATION), `PT-IZJ` Izaje de Cargas (LIFTING) — each with Spanish
`defaultRisks`/`defaultControls` and the medical/training/gas/isolation flags. Seeded
idempotently via `POST /operations/work-permit-types/seed-defaults`
(`work-permit-types.controller.ts:24`); the root `seed.ts` does NOT seed them. Recommended
approval chains per code live in
`apps/api/src/modules/operations/permits/approval-rules.constants.ts:17-37`
(`DEFAULT_WORK_PERMIT_APPROVAL_CHAINS` — e.g. `PT-EC` runs Supervisor → Prevención →
Gerencia).

**Surface:** controller `work-permits.controller.ts` — `@Controller('operations/work-permits')`
(L41); reads `findAll` (46), `active-count` (53), `in-execution` (59), attachment download
(65), `findOne` (84); lifecycle POSTs submit/authorize/reject/start/suspend/resume/close/
cancel/gas-measurement (111-207). Service `work-permits.service.ts` — `findAll` (84),
`findOne` (143), `getActiveCount` (163), `getInExecution` (188), cron sweep
`processAllCompaniesExpired` (772). BullMQ worker `work-permits.processor.ts`.

> **DUPLICATION LINE:** a naive HSEC "permisos de trabajo" would re-create the entire
> high-risk internal work-permit engine — the category/status machine, the 6-entry Chilean
> PT catalog with risks+controls, gas/LOTO payloads, multi-step approval, and the
> auto-numbered authorization/closure lifecycle that already exists and runs in production.

### Q2b — External permits

**File:** `operations.prisma:573-590` — enums verbatim:

```prisma
enum PermitCategory {
  MUNICIPAL
  SANITARY
  ENVIRONMENTAL
  FIRE_DEPT
  LABOR
  ELECTRICAL
  OTHER
}

enum PermitStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  REPLACED
  ARCHIVED
}
```

`PermitType` (`operations.prisma:592-621`) carries the expiration/alert/criticality
machinery, verbatim (key fields):

```prisma
model PermitType {
  ...
  category                PermitCategory
  issuingAuthority        String?
  hasExpiration           Boolean             @default(true)
  defaultValidityDays     Int?
  alertDaysBefore         Int                 @default(30)
  criticalAlertDaysBefore Int                 @default(7)
  criticality             DocumentCriticality
  blocksOperation         Boolean             @default(false)
  ...
}
```

`Permit` (`operations.prisma:623-680`): `issueDate DateTime? @db.Date` (634),
**`expirationDate DateTime? @db.Date` (635, indexed at 678)**, exactly-one-of
`assetId`/`locationId` (DB CHECK), file fields with blob fallback, versioned supersession
(`version`, `replacedByPermitId`, `PermitSupersession` relation), OPS-026 approval fields,
relations to `AlertInstance[]` and `PermitApproval[]`. External approval chains include
steps literally named **"Validación HSEC"** for `AUTSAN` and `RCA`
(`approval-rules.constants.ts:39-49` — see Q5a).

**Surface:** controller `permits.controller.ts` — `@Controller('operations/permits')` (35);
reads `findAll` (40), `compliance` (46), `history` (54), file download (66), `findOne` (84);
supersede/archive/approve/reject/resubmit (113-158). Service `permits.service.ts` —
`findAll` (94), `findOne` (221), `getCompliance` (264), `getVersionHistory` (884). Types:
`permit-types.controller.ts` with its own `seed-defaults` (25); catalog in
`permit-types.constants.ts`.

> **DUPLICATION LINE:** a naive HSEC "permisos ambientales/sanitarios" would duplicate the
> external-regulatory-permit store — expiration + `blocksOperation` + criticality, asset-OR-
> location targeting, versioned supersession, and the compliance reads already feeding the
> alert engine (RCA and AUTSAN — the environmental/sanitary permits — are ALREADY first-class
> citizens here).

### Q2c — Procedures

**File:** `operations.prisma:873-899` — enums verbatim:

```prisma
enum ProcedureCategory {
  OPERATION
  MAINTENANCE
  EMERGENCY
  SAFETY
  QUALITY
  ENVIRONMENTAL
  OTHER
}

enum ProcedureStatus {
  DRAFT
  IN_REVIEW
  PUBLISHED
  SUPERSEDED
  DEPRECATED
}

enum RevisionType {
  CREATED
  UPDATED
  REVIEWED
  PUBLISHED
  SUPERSEDED
  DEPRECATED
  RESTORED
}
```

Note `SAFETY`, `EMERGENCY` and `ENVIRONMENTAL` are already procedure categories.

`Procedure` (`operations.prisma:901-963`): authored/reviewed/published/deprecated stamps,
free-form `version` with `@@unique([companyId, code, version])`, supersession chain, the
file inline (`fileName/mimeType/fileSize/filePath/fileData` + `attachments Json`, max 10) —
there is **no separate ProcedureDocument model**; applicability arrays
(`applicableAssetTypeIds/applicableAssetIds/applicableLocationIds/applicableRoles`), and
the acknowledgment knobs `requiresAcknowledgment Boolean` + `acknowledgmentDeadlineDays
Int?`.

`ProcedureRevision` (`operations.prisma:965-982`): append-only revision log with
`previousData/newData Json` snapshots.

`ProcedureAcknowledgment` (`operations.prisma:996-1036`) with `AcknowledgmentStatus`
(988-994: `PENDING/READ/ACKNOWLEDGED/EXPIRED/EXEMPTED`): per-user rows, reading evidence
(`firstViewedAt`, `viewCount`), **signed acuse: `signatureHash` = SHA-256 of (procedureId +
userId + ISO timestamp + notes), plus `acknowledgedFromIp` and `acknowledgedUserAgent`**,
`dueDate` computed from the procedure's deadline days, reminder counters, exemption trail,
`@@unique([companyId, procedureId, userId])`.

**The per-user privacy filter** —
`apps/api/src/modules/operations/calendar/operations-calendar.service.ts:439-447`, verbatim:

```typescript
const where: Prisma.ProcedureAcknowledgmentWhereInput = {
  companyId,
  status: { in: ['PENDING', 'READ'] },
  dueDate: { gte: start, lte: end },
};
/* Non-admins only see their own acknowledgments — privacy guard
       beyond CASL; the dashboard "my pending" already filters by
       userId so this matches the same contract. */
if (!isAdminOrManager) where.userId = userId;
```

**Surface:** `procedures.controller.ts` — `@Controller('operations/procedures')` (41); reads
`findAll` (46), `kpi` (57), `category-counts` (63), `applicable` (69), file/attachments
(79/99), `revisions` (118), `findOne` (124); lifecycle submit/review/publish/new-version/
deprecate (164-210). Acknowledgments: `acknowledgments.controller.ts` —
`@Controller('operations/acknowledgments')` (12); `my-pending` (17), `my-pending-count`
(23), `company-coverage` (29), `findAll` (35), per-procedure and per-user coverage (45/54);
acknowledge/exempt/reapply (60/75/87). Service `acknowledgments.service.ts` — coverage reads
(645/714/741), cron `processExpiredForAllCompanies` (439) which emits the
`procedure.acknowledgment-expired` domain event.

> **DUPLICATION LINE:** a naive HSEC "procedimientos" would duplicate the whole versioned
> procedures library plus the signed-acknowledgment engine — SHA-256 + IP evidence, per-user
> due dates, coverage reporting, and the only-my-acks privacy filter — which the legal
> framework constant already presents as the Ley 16.744 coverage story (Q5b).

### Q2d — Document control criticality, blocking, and the alert engine

Criticality — `operations.prisma:180-185`, verbatim:

```prisma
enum DocumentCriticality {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

Used on `OperationalDocumentType.criticality` (198) with `blocksOperation` (199),
`alertDaysBefore` 30 (200), `criticalAlertDaysBefore` 7 (201) — and on `PermitType` (603).

Operational blocking — `AssetStatus` (`operations.prisma:8-17`), verbatim:

```prisma
enum AssetStatus {
  OPERATIONAL
  WITH_OBSERVATIONS
  NON_OPERATIONAL
  IN_MAINTENANCE
  BLOCKED_DOCUMENTAL
  BLOCKED_PERMIT
  OUT_OF_SERVICE
  DECOMMISSIONED
}
```

Severities — `apps/api/prisma/schema/alerts.prisma:12-17`, verbatim:

```prisma
enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
  BLOCKING
}
```

`AlertRule` (`operations.prisma:302-327`): per-document-type threshold rules —
`daysBeforeExpiration`, `severity`, `channels Json` (inApp/email), `targetRoles`,
`notifyAssignedUser`, `escalateAfterDays` + `escalateToRoles`.

`AlertInstance` (`operations.prisma:350-413`) with `AlertTriggerType` (335-340:
`EXPIRING_SOON/EXPIRED/MISSING/BLOCKING`) and `AlertInstanceStatus` (342-348:
`ACTIVE/ACKNOWLEDGED/RESOLVED/ESCALATED/DISMISSED`): dual-path references (document pair OR
permit pair, OPS-024), idempotency
`@@unique([companyId, assetId, documentTypeId, triggerType, daysBeforeExpiration, status])`

- a permit-side partial index in the migration, ack/resolve/escalate trail, notification
  fan-out (`notifiedRoles`, `notifiedUsers`, relation to `UserNotification[]`).

`CompanyAlertSettings` (`operations.prisma:418-436`): per-company thresholds
(`defaultDaysBefore` 30 / `defaultCriticalDaysBefore` 7 / `defaultBlockingDaysBefore` 0),
`enableAutoBlocking`, `enableEmailNotifications`, `defaultEscalationDays`,
`enableAutoCommitments` (OPS-033 Finance toggle).

**Engine files** (`apps/api/src/modules/operations/alerts/`): `alert-engine.service.ts` —
`processCompany` (56), `processAllCompanies` (325), `processCompanyPermits` (466);
`alert-engine.processor.ts` — BullMQ `@Processor(OPERATIONS_ALERT_ENGINE_QUEUE)` (43),
`onModuleInit` registers SIX repeatables (78-107): DAILY / ESCALATION /
EXCEPTION_EXPIRATION / ACK_REMINDERS / ACK_EXPIRATION / DOMAIN_EVENTS_RETRY;
`asset-blocking.service.ts` — `evaluateAssetBlocking` (69), `processBlocking` (289) (emits
`asset.blocked`/`asset.unblocked`); `alert-escalation.service.ts`,
`alert-instances.service.ts` (reads: `findAll` 21, `getKpis` 218),
`alert-rules.service.ts`, `alert-rule-presets.service.ts` (Chilean presets),
`company-alert-settings.service.ts`.

> **DUPLICATION LINE:** a naive HSEC "vencimientos/alertas de seguridad" would duplicate the
> entire criticality-driven expiration engine — thresholds, idempotent instances, the four
> severities, escalation, per-company settings, and the automatic
> BLOCKED_DOCUMENTAL/BLOCKED_PERMIT gating already wired to a daily BullMQ scheduler.

### Q2e — AssetException

**File:** `operations.prisma:524-565`, verbatim (key fields):

```prisma
enum ExceptionStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  REVOKED
}

model AssetException {
  id                        String          @id @default(uuid()) @db.Uuid
  companyId                 String          @db.Uuid
  assetId                   String          @db.Uuid
  requestedBy               String          @db.Uuid
  requestedReason           String
  requestedDocumentTypeIds  String[]        @default([]) @db.Uuid
  status                    ExceptionStatus @default(PENDING)
  approvedBy                String?         @db.Uuid
  approvedReason            String?
  validFrom                 DateTime?
  validUntil                DateTime?
  previousStatus            AssetStatus?
  expiresHandled            Boolean         @default(false)
  revokedBy                 String?         @db.Uuid
  ...
  @@map("asset_exceptions")
}
```

Enforced by `exceptions.service.ts` (`approve` ~228 lifts the block and snapshots status;
`processExpired` 424 / `processAllCompaniesExpired` 501 restore `previousStatus` via the
EXCEPTION_EXPIRATION cron); also read by `asset-blocking.service.ts` (blocking gate),
`asset-qr.service.ts` (public QR view banner), and the ops dashboard.

> **DUPLICATION LINE:** a naive HSEC "excepciones/waivers de seguridad" would duplicate the
> temporary compliance-waiver workflow — the PENDING→APPROVED→(EXPIRED/REVOKED) lifecycle
> that lifts a documental block for a bounded window and auto-restores the prior status.

---

## Q3 — RRHH's safety-adjacent ground

### Q3a — AreaRRHH enum

**File:** `apps/api/prisma/schema/rrhh.prisma:14-23`, verbatim:

```prisma
enum AreaRRHH {
  OPERACIONES
  ADMINISTRACION
  COMERCIAL
  GERENCIA
  FINANZAS
  PREVENCION_RIESGOS
  MANTENIMIENTO
  RRHH
}
```

`PREVENCION_RIESGOS` confirmed (L20). Per the coexistence doctrine (CLAUDE.md, Calendario
block) this is **organizational membership of the employee**, a fixed 8-value enum — not a
planning lane and not a module boundary.

### Q3b — Employee certifications (and the capacitaciones negative)

Migration `20260625190000_add_certifications` exists
(`apps/api/prisma/schema/migrations/`). Models — `rrhh.prisma:690-748`, verbatim:

```prisma
enum CertificationCategory {
  CERTIFICACION
  HABILITACION_CLIENTE
  HABILITACION_FAENA
}

enum CertificationStatus {
  VIGENTE
  POR_VENCER
  VENCIDA
  ANULADA
}

model CertificationType {
  id                  String                @id @default(uuid()) @db.Uuid
  companyId           String                @db.Uuid
  name                String
  category            CertificationCategory @default(CERTIFICACION)
  defaultValidityDays Int?
  requiresExpiry      Boolean               @default(false)
  issuingEntity       String? // organismo certificador (optional)
  active              Boolean               @default(true)
  ...
  @@unique([companyId, name])
  @@map("certification_types")
}

model Certification {
  id                  String                @id @default(uuid()) @db.Uuid
  companyId           String                @db.Uuid
  employeeId          String                @db.Uuid
  certificationTypeId String                @db.Uuid
  category            CertificationCategory // denormalised from the type for filtering
  issueDate           DateTime?             @db.Date
  expiryDate          DateTime?             @db.Date // auto from defaultValidityDays when the type requiresExpiry
  status              CertificationStatus   @default(VIGENTE) // persisted: VIGENTE | ANULADA; POR_VENCER/VENCIDA derived on read
  documentId          String?               @db.Uuid // optional link to the certificate PDF (EmployeeDocument)
  clientOrSite        String? // which client/faena this habilitación is for, when relevant
  notes               String?
  ...
  employee          Employee          @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  certificationType CertificationType @relation(fields: [certificationTypeId], references: [id], onDelete: Restrict)
  document          EmployeeDocument? @relation(fields: [documentId], references: [id], onDelete: SetNull)
  ...
  @@map("certifications")
}
```

So: expiration = YES (`expiryDate` + `defaultValidityDays`/`requiresExpiry`); issuer = YES
(`issuingEntity`, on the type); category = YES (`CertificationCategory` + the type itself).

**Capacitaciones / charlas / inducciones / ODI — NEGATIVE, structurally.** Grep (accent-aware
re-run included):

```
$ grep -rniE 'capacitaci|charla|inducci|obligaci.n de informar|\bodi\b|training' \
    apps/api/prisma/schema/ apps/api/src/modules/rrhh/
apps/api/prisma/schema/operations.prisma:722:  requiresSpecificTraining Boolean            @default(false)
apps/api/prisma/schema/migrations/20260428240000_add_work_permits/migration.sql:48:    "requiresSpecificTraining" BOOLEAN NOT NULL DEFAULT false,
apps/api/src/modules/rrhh/employee-documents/employee-document-types.service.ts:77:    name: 'Certificado de capacitación',
apps/api/src/modules/rrhh/employee-documents/employee-document-types.service.ts:126:    name: 'Obligación de informar (ODI)',
apps/api/src/modules/rrhh/employee-documents/employee-document-types.service.ts:133:    name: 'Inducción de seguridad',
apps/api/src/modules/rrhh/certifications/certification-types.service.ts:50:    name: 'Inducción de seguridad',
```

Every hit is either an unrelated Operations flag (`requiresSpecificTraining` on
WorkPermitType) or a **string `name` inside a seed catalog**: `'Certificado de
capacitación'`, `'Obligación de informar (ODI)'`, `'Inducción de seguridad'` are
`EmployeeDocumentType` seed rows (category `SEGURIDAD`), and `'Inducción de seguridad'` is
also a `CertificationType` seed row. **There is NO first-class model for a capacitación /
charla / inducción / ODI event** (no attendees, no date-held, no topic, no instructor) —
only (1) formal certifications and (2) generic document uploads whose types happen to carry
those labels.

### Q3c — Absence and the health-PII line, as implemented

Taxonomy — `rrhh.prisma:418-435`, verbatim:

```prisma
enum AbsenceCategory {
  PERMISO
  LICENCIA
}

enum AbsenceDayUnit {
  CORRIDOS
  HABILES
  MEDIO_DIA
  HORAS
}

enum AbsenceStatus {
  PENDIENTE
  APROBADO
  RECHAZADO
  CANCELADO
}
```

`Absence` (`rrhh.prisma:459-492`) — the sensitive columns, verbatim (key fields):

```prisma
model Absence {
  ...
  category           AbsenceCategory
  absenceTypeId      String?         @db.Uuid // permisos reference a type; licencias may not
  startDate          DateTime        @db.Date
  endDate            DateTime        @db.Date
  withPay            Boolean         @default(true)
  blocksAvailability Boolean         @default(true)
  status             AbsenceStatus   @default(PENDIENTE)
  // licencia-specific (nullable; only used when category = LICENCIA). NO subsidy calc.
  medicalFolio       String?
  healthEntity       String? // Isapre/Fonasa — free text
  ...
}
```

**Inside RRHH** (`disponibilidad.service.ts:79-124`, `loadCoveringMaps`): the WHERE is
`status: 'APROBADO', blocksAvailability: true`, date covering, employees ACTIVO; the select
DOES read `category` and `absenceType.name` — but only to feed `resolveState` (60-74),
which builds the human `reason` shown exclusively on the internal availability board
(MANAGER/ADMIN/SUPER_ADMIN only, HR-015/16).

**Across the module boundary** (CAL-018 leaf,
`apps/api/src/modules/rrhh/absence-read/absence-read.service.ts:12-18`), verbatim:

```typescript
export interface AusenciaCalendarEntry {
  employeeId: string; // stable render key + the id the ability-shaped link resolves
  fullName: string;
  startDate: string; // ISO of the @db.Date (UTC midnight)
  endDate: string; // ISO of the @db.Date (UTC midnight)
  // NO category. NO medicalFolio. NO healthEntity. NO type/motivo. NO status. The absence is the guarantee.
}
```

Its query (L51-66) replicates the owner's derivation (`APROBADO` + `blocksAvailability` +
employee `ACTIVO`) but selects ONLY `employeeId, startDate, endDate, employee.fullName`.
**Fields that never cross the boundary today:** `category`, `absenceTypeId`/
`absenceType.name` (motivo), `medicalFolio`, `healthEntity`, `status`, `withPay`,
`blocksAvailability` (WHERE-only), `dias`, approver/requestor stamps, `rejectionReason`,
`notes`, `documentId`. There is no reason-shaped slot in the payload — the COM-012 line
("la PII de salud nunca cruza de módulo") is structural, not a filter.

### Q3d — Employee fields relevant to a safety record (+ EPP negative)

`rrhh.prisma:76-137` (Employee, relevant fields):

```prisma
  fullName         String                                  // L84
  rut              String // validated Módulo-11 (@erp/utils validateRut) at the service layer   // L85
  birthDate        DateTime? @db.Date                      // L86
  jobPositionId String?      @db.Uuid                       // L95 (position/cargo = JobPosition.name relation)
  area AreaRRHH                                             // L98
  status       EmployeeStatus @default(ACTIVO)             // L106
  certifications     Certification[]                       // L127
```

`rut` is unique per company (`@@unique([companyId, rut])`, L134). `JobPosition` carries
`name`, `area`, and `requiredCertTypes` — the required-certifications-per-position hook the
disponibilidad matrix already consumes.

**EPP delivery / charla-ODI record — NEGATIVE, structurally.** Schema grep:

```
$ grep -rniE 'epp|elemento.*proteccion|entrega.*epp|proteccion personal' apps/api/prisma/schema/
(exit 1 — zero matches)
```

Source grep (`apps/api/src/`) hits ONLY string literals: `'Uso de EPP'` as a
`CertificationType` seed (`certification-types.service.ts:44`), `'Entrega de EPP'` as an
`EmployeeDocumentType` seed (`employee-document-types.service.ts:112`), spec fixtures, and
one work-permit checklist string (`work-permit-types.constants.ts:70`: `'EPP completo
(careta, mangas largas, guantes)'`). **No EPP entity, no delivery/issuance model, no
per-item tracking** — "Entrega de EPP" is only a label an admin can hang a PDF acuse on.

---

## Q4 — Reusable machinery inventory

### Q4a — Storage

Canonical service: `apps/api/src/modules/common/storage/storage.service.ts` —
`@Injectable() export class StorageService` (L6-7), a thin S3 client with R2-vs-MinIO
endpoint negotiation (constructor 11-38), `isConfigured()` (45-47), `uploadFile` (49),
`downloadFile` (62), `getFileUrl` (83). **The blob fallback lives in each consumer**, same
shape twice:

- Operations — `document-records.service.ts:558-581` `storeFile(...)`: returns
  `{ filePath, fileData }`; tries `storage.uploadFile(DOCUMENTS_BUCKET, ...)` when
  `isConfigured()`, else logs `'MinIO not available, storing document in DB blob'` and
  returns the buffer as `fileData`.
- RRHH — `employee-documents.service.ts:156-175` `storeFile(...)`: identical logic, keys
  named `{ storageKey, blobFallback }` (the comment at 153-155 says it mirrors Operations).

Read paths prefer the DB blob when present (`document-records.service.ts:1096-1097`,
`employee-documents.service.ts:417`). This double-implementation IS the house pattern a new
module imitates (copy-adapt, per RRHH-RECON R1 — the engine was deliberately not
generalized).

### Q4b — Leaf read modules (the import-nothing pattern)

All five are `@Module({ providers: [Svc], exports: [Svc] })` with **no `imports` array at
all** (PrismaService is global):

| Leaf                 | Module (file:line)                                           | Exports → contract                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RrhhBirthdayRead     | `rrhh/birthday-read/birthday-read.module.ts:8-12`            | `BirthdayReadService.listForMonth(companyId, month) → BirthdayEntry[]` = `{ employeeId, fullName, day, month }` — no year/age                                                                        |
| RrhhAbsenceRead      | `rrhh/absence-read/absence-read.module.ts:12-16`             | `RrhhAbsenceReadService.listAusenciasForRange(...) → AusenciaCalendarEntry[]` = `{ employeeId, fullName, startDate, endDate }`                                                                       |
| OpsCalendarRead      | `operations/calendar-read/ops-calendar-read.module.ts:11-15` | `OpsCalendarReadService.listServiciosForRange` (36-40) + `listVencimientosForRange` (82-86) → `{ serviceOrderId, label, executionStart, executionEnd, status }` (no amounts) / `{ id, label, date }` |
| ComercialCierresRead | `comercial/cierres-read/cierres-read.module.ts:10-14`        | `ComercialCierresReadService.listCierresForRange(...) → { opportunityId, name, expectedDate }` (no stage/amount)                                                                                     |
| AttributionRead      | `comercial/attribution-read/attribution-read.module.ts:9-13` | `AccountAttributionReadService`: `countBySourceCampaign` (47), `getCampaignReturn` (62), `getOpportunityOrigin` (100-103), `listWonDeals` (126)                                                      |

Representative verbatim (`birthday-read.module.ts:8-12`):

```ts
@Module({
  providers: [BirthdayReadService],
  exports: [BirthdayReadService],
})
export class RrhhBirthdayReadModule {}
```

### Q4c — Notifications: the two available paths

1. **Operations alert engine** (heavy, rule-driven): `AlertEngineService`
   (`alerts/alert-engine.service.ts:34`) evaluated by BullMQ
   `alert-engine.processor.ts` — `@Processor(OPERATIONS_ALERT_ENGINE_QUEUE)` (43),
   `onModuleInit` (61) registers six repeatables (78-107); queue registered in
   `alert-rules.module.ts:41`. Rule/instance tables, severities, escalation, auto-blocking.
   Per RRHH-RECON R2 the engine enumerates `operational_assets`+`permits` by hard-coded
   queries — it is NOT generic.
2. **RRHH fine path** (thin, cron→inbox — the precedent for post-Operations modules):
   `rrhh/contracts/rrhh-reminders.processor.ts` — `@Processor(RRHH_REMINDERS_QUEUE)` (33),
   one `DAILY_CRON = '0 7 * * *'` (20) hosting contract/document/certification sweeps
   (registration 54-58). Sweeps call
   `NotificationService.createGeneric(companyId, dto, options)` —
   `operations/notifications/notification.service.ts:152-156` — which writes rows into the
   generic `user_notifications` inbox (161-171). RRHH imports only
   `NotificationModule` for this (`employee-documents.module.ts:2`).

### Q4d — CASL: factory location and the COM-001 new-subject checklist

Factory: `apps/api/src/modules/common/casl/casl-ability.factory.ts` (~717 lines) —
`defineAbilityFor(role)` (443) via `AbilityBuilder<AppAbility>(createMongoAbility)` (444),
`switch (role)` (446). ADMIN/SUPER_ADMIN = `can('manage','all')` and NEVER receive
`cannot()`; MANAGER/ACCOUNTANT/(VIEWER/ANALYST branches) start from broader reads then
floor + re-grant, last-rule-wins. Guard: `common/guards/policies.guard.ts` (fails open —
hence `@CheckPolicies` on every endpoint); decorator:
`common/decorators/check-policies.decorator.ts`.

What COM-001 touched (the checklist a new subject follows):

1. **Factory — subject declarations:** union `type Subjects` members (52-57), subject class
   declarations (234-256), bulk array `COMERCIAL_SUBJECTS` (311-322), `AppAbility` export
   list (428-430).
2. **Factory — default-deny floor per blanket-read role:**
   `COMERCIAL_SUBJECTS.forEach((subject) => cannot('read', subject));` — MANAGER (535),
   ACCOUNTANT (601), VIEWER (599), ANALYST (644). Verbatim (MANAGER):

   ```ts
   /* COM-001 — default-deny floor: revoke the inherited blanket `read all`
              on Comercial subjects; per-subject grants are added by each COM ticket. */
   COMERCIAL_SUBJECTS.forEach((subject) => cannot('read', subject));
   ```

3. **Factory — per-role re-grants after the floor:** MANAGER (536-550, e.g.
   `can(['read','create','update','delete'], AccountSubject)` at 541); ACCOUNTANT read-only
   (605-615); ANALYST/VIEWER per decision.
4. **Controllers — `@CheckPolicies` per endpoint** importing the subject
   (`comercial/accounts/accounts.controller.ts:36/57/67/78` — read/create/update/delete).

### Q4e — Module registration: sidebar mapping and seed-defaults precedent

**Multi-sidebar** — `apps/web/src/app/(dashboard)/layout.tsx:52-56` + 62-74, verbatim:

```ts
const isOperations = pathname?.startsWith('/operaciones') ?? false;
const isRrhh = pathname?.startsWith('/rrhh') ?? false;
const isComercial = pathname?.startsWith('/comercial') ?? false;
const isMarketing = pathname?.startsWith('/marketing') ?? false;
const isActividades = pathname?.startsWith('/actividades') ?? false;
```

```tsx
{
  isActividades ? (
    <ActividadesSidebar />
  ) : isMarketing ? (
    <MarketingSidebar />
  ) : isComercial ? (
    <ComercialSidebar />
  ) : isRrhh ? (
    <RrhhSidebar />
  ) : isOperations ? (
    <OperationsSidebar />
  ) : (
    <FinanceSidebar />
  );
}
```

An `HsecSidebar` slots as one more `pathname?.startsWith('/hsec')` flag + one more ternary
branch; sidebar components live in `apps/web/src/components/sidebars/`.

**Seed-defaults (OPS-004)** — endpoint `document-types.controller.ts:36-39`
(`@Post('seed-defaults')`, gated `can('manage', DocumentTypeSubject)`), service
`document-types.service.ts:103` `seedDefaults` (idempotent upsert on `companyId_code` over
`DEFAULT_DOCUMENT_TYPES`). The catalog:
`document-types.constants.ts:27-146` — **12** Chilean types (PERMCIRC, SOAP, REVTEC, PADRON
[LEGAL]; ANROC, PROCSEG, CAPOP [SAFETY]; MANOP, PLANMTO, BITOP [OPERATIONAL]; FICHATEC,
ESPEC [TECHNICAL]). First entry verbatim:

```ts
export const DEFAULT_DOCUMENT_TYPES: DefaultDocumentTypeSeed[] = [
  // LEGAL — every LEGAL doc is CRITICAL and blocks operation if missing/expired.
  {
    code: 'PERMCIRC',
    name: 'Permiso de Circulación',
    category: 'LEGAL',
    criticality: 'CRITICAL',
    blocksOperation: true,
    hasExpiration: true,
    defaultValidityDays: 365,
    alertDaysBefore: 30,
    criticalAlertDaysBefore: 7,
  },
```

Same pattern repeated by work-permit types (Q2a), permit types (Q2b), RRHH employee-document
types and certification types (Q3b) — the established precedent for any HSEC catalog.

---

## Q5 — Prior art & collisions (negative proofs)

### Q5a — `hsec` across the codebase

```
$ grep -rli "hsec" apps/web/src apps/api/src apps/api/prisma
apps/web/src/app/modulos/page.tsx
apps/web/src/app/(dashboard)/dashboard/page.tsx
apps/api/src/modules/operations/procedures/acknowledgments/acknowledgments.service.ts
apps/api/src/modules/operations/permits/approval-rules.constants.ts
apps/api/src/modules/operations/events/domain-event-types.ts
exit=0
```

Characterization of each hit:

- `modulos/page.tsx` — the card + `HsecSvg` + CSS keyframes (Q1). The expected hit.
- `dashboard/page.tsx` — **false positive**: `RealtimeCashSection` contains the substring
  `hSec` (case-insensitive match). No HSEC content.
- `acknowledgments.service.ts:478` — comment: `/* OPS-032 — domain event so Finance/HSEC
consumers see the …`. Prior art: HSEC was anticipated as a domain-event CONSUMER.
- `domain-event-types.ts:2` — header comment: "Each event carries everything a Finance/HSEC
  handler needs to react without round-tripping back to Operations." Same anticipation.
- `approval-rules.constants.ts:42,46` — verbatim:

  ```ts
  AUTSAN: [
    { stepOrder: 1, name: 'Validación HSEC', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Aprobación gerencial', roles: ['ADMIN'] },
  ],
  RCA: [
    { stepOrder: 1, name: 'Validación HSEC', roles: ['MANAGER'] },
    { stepOrder: 2, name: 'Aprobación gerencial', roles: ['ADMIN'] },
  ],
  ```

  The word "HSEC" already names an approval STEP (a MANAGER validation) inside Operations'
  external-permit chains for the sanitary (AUTSAN) and environmental (RCA) permits.

### Q5b — incident / inspection / capacitación / EPP terms

Schema:

```
$ grep -rinE "incident|incidente|inspection|inspeccion|capacitacion|\bepp\b" apps/api/prisma/schema/*.prisma
apps/api/prisma/schema/operations.prisma:777:  incidentsReported   Boolean          @default(false)
apps/api/prisma/schema/operations.prisma:778:  incidentDescription String?
exit=0
```

**The ONLY incident-shaped data in the entire schema is two fields on `WorkPermit`** —
captured at close time (`work-permits.service.ts:545-572`: close requires
`incidentDescription` when `incidentsReported`, logs "Cerrado con incidentes reportados",
severity WARNING) and carried on the `work-permit.closed` domain event
(`incidentsReported: boolean`, `domain-event-types.ts:136`) and the work-permits Excel
report generator. There is **no Incident/Incidente model, no Inspection/Inspección model,
no Capacitación model** anywhere in the schema.

Source hits (files) beyond those flows: RRHH seed-catalog labels + spec fixtures (Q3b/Q3d),
`operations/audit/legal-framework.constant.ts` (OPS-036 — the Chilean legal-framework
constant whose `LEY_16744` entry lists "Registro de capacitaciones de prevención" as a
requirement and claims coverage via procedures/acuses/permits, L30-52), and prose in the
operations `API_REFERENCE.md`/`MODULE_OVERVIEW.md`.

### Q5c — The domain-event registry

Declared in `apps/api/src/modules/operations/events/domain-event-types.ts` (typed
interfaces + union `OperationsDomainEvent` L176-184). The complete list today —
`EVENT_TYPES` (L247-256), verbatim:

```ts
export const EVENT_TYPES = [
  'document.renewal-imminent',
  'permit.renewal-imminent',
  'asset.blocked',
  'asset.unblocked',
  'work-permit.closed',
  'procedure.acknowledgment-expired',
  'operational.cost',
  'comercial.opportunity-won',
] as const;
```

Idempotency: persisted with UNIQUE `(companyId, eventType, aggregateId, occurredAt)`
(header comment L5-8); `aggregateId` must be a real UUID (`@db.Uuid` — the
composite-string landmine, L239-241). Notably, `work-permit.closed` already carries
`incidentsReported: boolean` (L136), and `procedure.acknowledgment-expired` (L109-118) is
"currently no-op (logged for compliance dashboards)" on the Finance side — events an HSEC
consumer was explicitly anticipated to join (the file header names "Finance/HSEC handler").

### Q5d — No hsec route, module folder, or table

```
$ grep -rin "hsec" apps/api/prisma
exit=1

$ ls apps/web/src/app/(dashboard) | grep -i hsec
exit=1
$ ls apps/api/src/modules | grep -i hsec
exit=1
```

Zero `hsec` in the Prisma schema or any migration (the `apps/api/prisma` tree), no
`(dashboard)/hsec` route folder, no `apps/api/src/modules/hsec`. The card is the only
HSEC artifact; the frontend + backend surface is virgin ground.

---

## Verdict table

| Q   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `hsec` card: `href: null, active: false` (`modulos/page.tsx:369-377`); gate = those two fields only, no route middleware; no `/hsec` route exists                                                                                                                                                                                                                                                                                | HSEC repeats the two-step gate: shell ticket sets `href: '/hsec'` (still gated), close ticket flips `active: true` — COM-015/MKT-010/CAL-007 verbatim                                                                                                                                       |
| 2   | Operaciones ALREADY owns: the internal PT engine (6 Chilean types incl. altura/caliente/espacio confinado, approval chains, gas/LOTO, `incidentsReported` at close), external regulatory permits (incl. RCA ambiental + AUTSAN sanitario), versioned procedures + SHA-256 signed acuses (categories SAFETY/EMERGENCY/ENVIRONMENTAL), the criticality→alert→auto-blocking engine, and bounded compliance waivers (AssetException) | This is the boundary: HSEC must READ these surfaces (EXPOSE/CONSUME — leaves and/or the 8 domain events), never rebuild them. "Permisos" and "procedimientos" are NOT HSEC's ground — they are Operaciones'                                                                                 |
| 3   | RRHH ALREADY owns: `PREVENCION_RIESGOS` as employee membership, formal `Certification`/`CertificationType` (expiry+issuer+category; 'Uso de EPP' and 'Inducción de seguridad' as seed labels), safety-labeled `EmployeeDocumentType` seeds ('Entrega de EPP', 'ODI', 'Certificado de capacitación'), and the structurally reason-free absence exposure                                                                           | Person-bound safety COMPLIANCE (certs, doc acuses) is RRHH's ground. What does NOT exist anywhere: first-class capacitación/charla/ODI EVENTS (attendees/date/topic/instructor) and physical EPP delivery tracking — genuinely virgin, but its vocabulary already lives in RRHH seed labels |
| 4   | Machinery proven and repeatable: StorageService + per-module blob fallback (copy-adapt, twice-established), the 5 import-nothing leaf modules, two notification paths (heavy ops engine — NOT generic per RRHH-RECON R2 — vs thin cron→`createGeneric` inbox), the 4-step CASL new-subject checklist, one-branch sidebar registration, idempotent seed-defaults catalogs                                                         | A new HSEC module composes these patterns wholesale; nothing machinery-shaped needs inventing                                                                                                                                                                                               |
| 5   | Zero HSEC code/tables/routes. Prior art: OPS-032 comments name "Finance/HSEC" as anticipated event consumers; "Validación HSEC" is an approval-step label in AUTSAN/RCA chains; the only incident-shaped data is 2 fields on WorkPermit close; LEY_16744's "registro de capacitaciones" requirement is claimed as covered by Operations surfaces (OPS-036)                                                                       | Virgin ground with a reserved seat: the 8-type domain-event registry is the ready-made consumption channel HSEC was designed to join                                                                                                                                                        |

---

## Risks

- **The boundary is the whole game.** "Inspecciones / permisos / procedimientos /
  capacitaciones" naively read as HSEC scope, but permisos (internal AND external, including
  the environmental RCA and sanitary AUTSAN), procedimientos (with signed acuses), safety
  alerts/blocking, and waivers are ALL live Operaciones production surfaces (Q2), and
  person-bound safety compliance (certifications, EPP/ODI document acuses) is live RRHH
  surface (Q3). Any HSEC table that overlaps them creates a second source of truth for
  safety compliance. The genuinely unowned candidates observed in this recon: incident
  REGISTRY beyond the two WorkPermit fields, inspection records, first-class
  capacitación/charla/ODI events, physical EPP delivery, HSEC indicators/KPIs, and the
  "comunidades" dimension (zero prior art anywhere).
- **Vocabulary triple-collision on capacitaciones/EPP.** 'Uso de EPP' and 'Inducción de
  seguridad' exist as `CertificationType` seed labels; 'Entrega de EPP', 'ODI',
  'Certificado de capacitación', 'Inducción de seguridad' as `EmployeeDocumentType` seed
  labels (Q3b/Q3d). A new HSEC capacitaciones/EPP entity would be the THIRD place the same
  words live, with no structural link between them — same class of trap as
  ServiceOrderStatus↔ActivityStatus (coexistence doctrine) but worse, because these are
  free-text catalog rows admins can rename.
- **Incident double-reporting seam.** `WorkPermit.incidentsReported`/`incidentDescription`
  (close-time capture, WARNING severity, carried on `work-permit.closed`) is a live mini
  incident record. An HSEC incident registry must decide its relationship to it at design
  time — ignore it and the same real-world event exists twice with no join; the
  `work-permit.closed` event already carries the flag a consumer would need.
- **Ley 16.744 coverage claims already point at Operations.** The OPS-036 legal-framework
  constant claims "Registro de capacitaciones de prevención" and "Reporte de accidentes"
  coverage via procedures/acuses/permits (`legal-framework.constant.ts:37-49`). If HSEC
  becomes the home of capacitaciones/incidentes, the audit-package narrative splits across
  two modules — the coverage story needs a single owner per requirement.
- **Health-PII line extends to HSEC by construction.** Medical aptitude
  (`WorkPermitType.requiresMedicalAptitude`), licencia folios (`Absence.medicalFolio`,
  `healthEntity`) and any future occupational-health data sit exactly on the COM-012 line
  that today is enforced STRUCTURALLY (the CAL-018 leaf's entry type cannot carry a reason,
  Q3c). Incident/occupational-health records are the same class of data; any HSEC exposure
  crosses role AND module lines and therefore requires a founder-signed matrix (birthdays/
  members/ausencias precedents).
- **The "HSEC" name is already taken inside Operations.** "Validación HSEC" is a MANAGER
  approval step in the AUTSAN/RCA chains (Q5a) — a role-flavored label, not the module.
  Once a module named HSEC exists, that label reads as "the HSEC module approves this",
  which is not (today) true. Naming/UX ambiguity to resolve at design time.
- **Two notification paths, one correct precedent.** The Operations alert engine is
  hard-bound to `operational_assets`/`permits` (RRHH-RECON R2 verdict stands); every
  post-Operations module (RRHH, and Marketing's V2 seed note) chose the thin
  cron→`createGeneric` inbox instead. An HSEC design that tries to "register rules" in the
  ops engine fights its hard-coded enumeration.
- **Line-number drift.** `casl-ability.factory.ts` (~717 lines) and `operations.prisma`
  absorb edits with every module; the citations here date to 2026-07-27 and should be
  re-verified at implementation time, not trusted blindly.
