# Excelsia — HSEC V1: Plan PART 1 — Decisions & Data Model

**Status:** Validated by founder — 2026-07-27 (scope, CASL matrix, exposures,
decisions 1–10 below). Source of truth for HSEC-001..HSEC-011 together with
PART2.
**References:** `docs/HSEC-RECON.md` (HSEC-000 findings — the boundary),
`CLAUDE.md`, `docs/EXCELSIA-ACTIVIDADES-GESTION-PLAN.md` (doctrine precedents).

---

## 1. Decision record

1. **V1 scope (founder, 2026-07-27):** incidentes + capacitaciones/charlas +
   entregas de EPP — the three living AGS spreadsheets. Inspecciones,
   indicadores (IF/IG — derived, never stored) and the comunidades dimension
   are V2 seeds.
2. **Boundary (founder: "no migrar nada"):** HSEC READS neighbors, never
   duplicates. Permisos (internal PTs and external regulatory), procedimientos
   - signed acuses, the criticality/alert/blocking engine and waivers are
     Operaciones's ground; person-bound compliance (certifications, document
     acuses) is RRHH's. Any overlap is a design error (HSEC-RECON verdict Q2/Q3).
3. **FOUNDER-SIGNED CASL MATRIX (2026-07-27):** the ENTIRE module is
   MANAGER / ADMIN / SUPER_ADMIN — MANAGER full CRUD on all five subjects,
   ADMIN/SUPER_ADMIN via `manage all` (never receive `cannot()`).
   ACCOUNTANT / ANALYST / VIEWER: NO access in V1 (default-deny floor, COM-001
   pattern, no re-grants). No money in HSEC, but health-adjacent PII — the
   Actividades open-read matrix is explicitly NOT a template here. Widening is
   a future dated founder decision; it is additive by construction.
4. **FOUNDER-SIGNED EXPOSURE (2026-07-27) — RRHH roster-lite → HSEC:** a new
   leaf `RrhhEmployeeReadModule` (imports NOTHING) exposes exactly two
   methods: `listActiveLite(companyId)` → `{ employeeId, fullName }[]`
   (pickers; ACTIVO only) and `resolveNamesByIds(companyId, ids)` →
   `Record<employeeId, fullName>` (display; any status — a DESVINCULADO afectado
   keeps their name in old records). STRUCTURAL two-key contract — no rut, no
   area, no status, no email can travel. Signature recorded in the service
   header and CLAUDE.md at close.
5. **Afectados (founder, 2026-07-27):** own employees only in V1
   (`employeeId` required). External workers as affected persons = V2 seed.
6. **Edit/delete policy (director ruling under founder delegation,
   2026-07-27):** free EDIT in any status and free DELETE for writers on all
   three surfaces (incidents, trainings, EPP deliveries). The platform audit
   trigger is the forensic layer (bitácora doctrine, CAL-012). Deletes
   CASCADE children (persons / attendees / lines) — audit keeps everything.
   Accepted V1 caveat: deleting the year's latest incident lets its number be
   reused (next = max+1 over existing rows); UUID + audit disambiguate; a
   dedicated counter = seed.
7. **Severity notification (founder, 2026-07-27):** creating an incident as
   GRAVE|FATAL — or editing one INTO GRAVE|FATAL — writes an in-app
   notification to the company's ADMIN-role users via
   `NotificationService.createGeneric` (the RRHH thin path; direct call, NO
   cron, NO ops alert engine). Edits that stay GRAVE do not re-notify.
8. **Incident ↔ WorkPermit seam:** `sourceWorkPermitId String? @db.Uuid` —
   bare soft pointer, NO FK, NO picker in V1 (the `assigneeId` precedent:
   the column is born ready, the join arrives later). Decision recorded:
   `WorkPermit.incidentsReported` and the HSEC registry COEXIST WITHOUT JOIN
   in V1.
9. **COEXISTENCE DOCTRINE (the ActivityArea↔AreaRRHH class):** an HSEC
   training EVENT (fecha + tema + relator + asistentes) ≠ an RRHH
   `EmployeeDocumentType` acuse ('ODI', 'Inducción de seguridad',
   'Certificado de capacitación') ≠ an RRHH `CertificationType` credential
   ('Inducción de seguridad', 'Uso de EPP'). Three surfaces, three natures
   (event / per-person document / expiring credential). NO future ticket
   unifies or maps them without an express founder decision.
10. **DIAT alignment, internal-only:** incident + person fields cover the
    DIAT core (afectado, fecha/hora, lugar, descripción, lesión/parte del
    cuerpo). DIAT/DIEP export and mutual integration = V2 seeds.

## 2. Data model — `apps/api/prisma/schema/hsec.prisma`

House rules apply to every table: RLS policy (`account_isolation` shape,
`current_setting('rls.company_id', true)::uuid`) + audit trigger + GRANT to
`app_user` in the SAME hand-authored migration; ASCII enum members; writes via
`executeWithRls`; `createdBy` from the JWT, never DTOs; wall-clock times are
`"HH:mm"` STRINGS; nothing derived is stored.

```prisma
enum HsecIncidentType {
  ACCIDENTE_TRABAJO
  ACCIDENTE_TRAYECTO
  CASI_INCIDENTE
  DANO_MATERIAL
  AMBIENTAL
}

enum HsecIncidentSeverity {
  LEVE
  GRAVE
  FATAL
}

enum HsecIncidentStatus {
  REPORTADO
  EN_INVESTIGACION
  CERRADO
}

enum HsecTrainingType {
  CHARLA
  INDUCCION
  CAPACITACION
}

model HsecIncident {
  id                 String               @id @default(uuid()) @db.Uuid
  companyId          String               @db.Uuid
  incidentNumber     String // "INC-{YYYY}-{0000}" per-company sequential (ServiceOrder orderNumber precedent)
  type               HsecIncidentType
  severity           HsecIncidentSeverity
  status             HsecIncidentStatus   @default(REPORTADO)
  occurredDate       DateTime             @db.Date
  occurredTime       String? // wall-clock "HH:mm" — never a timestamp (CAL doctrine)
  location           String
  description        String
  immediateCause     String?
  correctiveActions  String? // free text in V1; actions-as-entities = seed
  sourceWorkPermitId String?              @db.Uuid // soft pointer, NO FK, no picker in V1 (decision 8)
  attachments        Json                 @default("[]") // max 5 — mirror the WorkPermit attachments convention (MinIO-or-blob)
  createdBy          String               @db.Uuid
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  persons HsecIncidentPerson[]

  @@unique([companyId, incidentNumber])
  @@index([companyId])
  @@index([companyId, occurredDate])
  @@index([companyId, status])
  @@map("hsec_incidents")
}

model HsecIncidentPerson {
  id               String   @id @default(uuid()) @db.Uuid
  companyId        String   @db.Uuid
  incidentId       String   @db.Uuid
  employeeId       String   @db.Uuid // bare — resolved via RrhhEmployeeRead leaf (decision 4/5)
  injuryType       String?
  bodyPart         String?
  medicalAttention Boolean  @default(false)
  lostDays         Int?
  detail           String?
  createdAt        DateTime @default(now())

  incident HsecIncident @relation(fields: [incidentId], references: [id], onDelete: Cascade)

  @@unique([incidentId, employeeId])
  @@index([companyId])
  @@map("hsec_incident_persons")
}

model HsecTraining {
  id              String           @id @default(uuid()) @db.Uuid
  companyId       String           @db.Uuid
  type            HsecTrainingType
  topic           String
  date            DateTime         @db.Date
  time            String? // "HH:mm"
  durationMinutes Int?
  instructorName  String // free text — covers external relator/mutual; employee link = seed
  notes           String?
  // single optional inline file (the signed planilla scan) — mirror the EXACT
  // inline-file column shapes used by Procedure (operations.prisma):
  // fileName / mimeType / fileSize / filePath / fileData
  createdBy       String           @db.Uuid
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  attendees HsecTrainingAttendee[]

  @@index([companyId])
  @@index([companyId, date])
  @@map("hsec_trainings")
}

model HsecTrainingAttendee {
  id         String   @id @default(uuid()) @db.Uuid
  companyId  String   @db.Uuid
  trainingId String   @db.Uuid
  employeeId String   @db.Uuid // bare — leaf-resolved
  createdAt  DateTime @default(now())

  training HsecTraining @relation(fields: [trainingId], references: [id], onDelete: Cascade)

  @@unique([trainingId, employeeId])
  @@index([companyId])
  @@map("hsec_training_attendees")
}

model HsecEppItem {
  id        String   @id @default(uuid()) @db.Uuid
  companyId String   @db.Uuid
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lines HsecEppDeliveryLine[]

  @@unique([companyId, name])
  @@index([companyId])
  @@map("hsec_epp_items")
}

model HsecEppDelivery {
  id         String   @id @default(uuid()) @db.Uuid
  companyId  String   @db.Uuid
  employeeId String   @db.Uuid // bare — leaf-resolved
  date       DateTime @db.Date
  notes      String?
  // single optional inline file (signed acuse scan) — same Procedure-shaped columns
  createdBy  String   @db.Uuid
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  lines HsecEppDeliveryLine[]

  @@index([companyId])
  @@index([companyId, employeeId])
  @@index([companyId, date])
  @@map("hsec_epp_deliveries")
}

model HsecEppDeliveryLine {
  id         String   @id @default(uuid()) @db.Uuid
  companyId  String   @db.Uuid
  deliveryId String   @db.Uuid
  eppItemId  String   @db.Uuid
  quantity   Int // > 0, validated 400 verbatim
  size       String? // talla
  createdAt  DateTime @default(now())

  delivery HsecEppDelivery @relation(fields: [deliveryId], references: [id], onDelete: Cascade)
  item     HsecEppItem     @relation(fields: [eppItemId], references: [id], onDelete: Restrict)

  @@index([companyId])
  @@index([deliveryId])
  @@map("hsec_epp_delivery_lines")
}
```

**Migrations across the arc (each hand-authored, template-compared):**
HSEC-002 → `hsec_incidents` · HSEC-003 → `hsec_incident_persons` · HSEC-006 →
`hsec_trainings` + `hsec_training_attendees` · HSEC-008 → the three EPP
tables. Every table: RLS + audit trigger + GRANT in its own migration.

## 3. State machine — incidents (PATCH /:id/status canonical, COM-005 conventions)

Legal edges: REPORTADO↔EN_INVESTIGACION · REPORTADO→CERRADO (shortcut) ·
EN_INVESTIGACION→CERRADO · CERRADO→EN_INVESTIGACION (explicit reopen).
Same-status and any other edge → 400 with a verbatim Spanish message. EDIT
allowed in any status; DELETE allowed for writers in any status (decision 6).

## 4. Cross-module surface

- **Leaf:** `apps/api/src/modules/rrhh/employee-read/` —
  `RrhhEmployeeReadModule` per decision 4 (module has NO imports array;
  BirthdayRead precedent). Signed header in the service.
- **Roster endpoint for pickers:** `GET /hsec/roster` (HSEC-side controller
  calling the leaf), `@CheckPolicies (read, HsecIncident)` — reachable exactly
  by the module's readers (MANAGER+).
- **Storage:** copy-adapt the `storeFile` blob-fallback shape
  (`document-records.service.ts` / `employee-documents.service.ts` precedent)
  for incident attachments and the two inline files.
- **Notifications:** direct `NotificationService.createGeneric` on
  GRAVE|FATAL (decision 7). HSEC imports only `NotificationModule` for this
  (the RRHH wiring precedent).

## 5. Frontend

Routes: `/hsec` (dashboard) · `/hsec/incidentes` · `/hsec/capacitaciones` ·
`/hsec/epp` · `/hsec/configuracion` (EPP catalog + seed button).
`HsecSidebar` in `components/sidebars/`, one more `startsWith('/hsec')`
branch in `(dashboard)/layout.tsx`. Terminal Noir; `formatCLP` never needed
(no money anywhere in this module — keep it that way).

## 6. V2 seeds (record only)

Inspecciones + hallazgos/acciones as entities · indicadores IF/IG/tasas
(derived) · comunidades · external affected persons · DIAT/DIEP export +
mutual integration · digital attendance acuse · "EPP vigente" per worker +
item lifetimes + stock · sourceWorkPermitId picker/join · incident↔asset
link · master-calendar collections for HSEC (requires a NEW signed exposure
matrix) · comité paritario · faena (global backlog) · CASL read widenings.
