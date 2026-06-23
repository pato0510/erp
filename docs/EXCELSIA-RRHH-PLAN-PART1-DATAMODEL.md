# Excelsia — RRHH Module Plan · Part 1: Data Model & CASL

**Module:** RRHH (Recursos Humanos) — first of the three new V1 modules
**Builds on:** `EXCELSIA-NEW-MODULES-FOUNDATION.md` + `RRHH-RECON.md`
**Status:** Part 1 of N — data model + CASL subjects, for validation **before** the ticket breakdown (Part 2)
**Date:** 2026-06-23

> Scope is **V1 = MVP** (per the external plan's own "lo que NO recomiendo construir al inicio"). Each table is tagged **[V1]** or **[V2]**. V2 tables are listed for completeness but are NOT built in this cycle.

---

## 0. Recon verdicts this model is built on

| #      | Decision                                                                        | Consequence for the model                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | Reuse doc-control **components + copy-adapt logic**, NOT the asset-bound engine | RRHH ships its **own thin** `employee_documents` + `employee_document_requirements` (assetId→employeeId), reusing `StorageService`, `DocumentStatusBadge`, `ComplianceGauge`, and the `DocumentRecordStatus` enum verbatim |
| **R2** | RRHH runs its **own thin reminder cron** → generic `user_notifications` inbox   | No new alert tables; a BullMQ cron computes expiries and calls `NotificationService.createGeneric()`; reuse only the `AlertSeverity` enum                                                                                  |
| **R3** | Reuse the **platform engine wholesale** (RLS, audit trigger, CASL, GRANT)       | Every table below carries the standard RLS policy + audit trigger + `app_user` GRANT (templated from `document_records`). `employees.userId` = nullable FK, `onDelete: SetNull`. PK type `String @db.Uuid`                 |

**Hard constraints carried from the recon (non-negotiable in every ticket):**

- Every RRHH endpoint **must** declare `@CheckPolicies` (PoliciesGuard fails open).
- Every RRHH table gets an audit trigger (5 existing tables lack one — we do not add to that debt).
- Reads/writes go through `executeWithRls` (RLS doesn't isolate in prod today — defense leans on CASL + RLS context).
- `formatRUT` does not exist yet — **HR-001 creates it** before any RUT-bearing screen.
- Import nothing from `operations/*` that hard-codes `/api/operations/*` — clone the component, don't import.

---

## 1. The standard every table satisfies

Each table in §2 is shown with its columns. In addition, **every** table carries this boilerplate (templated from `document_records`, per recon R3c) — shown once here, not repeated per table:

```
-- RLS
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <table>_company_isolation ON <table>
  USING ("companyId" = current_setting('rls.company_id')::uuid);
-- Audit
CREATE TRIGGER <table>_audit
  AFTER INSERT OR UPDATE OR DELETE ON <table>
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
-- Grant
GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_user;
```

Every table also carries the standard columns: `id String @id @default(uuid()) @db.Uuid`, `companyId String @db.Uuid`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (audit columns), and the `@@index([companyId])`.

---

## 2. Data model (V1 core)

### 2.1 Organization & identity

**`job_positions`** [V1] — cargos / perfiles de cargo
`name`, `area (enum AreaRRHH)`, `description`, `requiredCertTypes (String[] — cert types this role needs)`, `requiredDocTypes (String[])`, `enabledServices (String[] — service-catalog names this cargo can execute)`, `active (bool)`.

**`employees`** [V1] — the central ficha
`userId String? @db.Uuid` **(nullable FK → users, `onDelete: SetNull`)** · `fullName` · `rut (validated Módulo-11)` · `birthDate?` · `nationality?` · `personalEmail` · `companyEmail?` · `phone` · `address` · `emergencyContact` · `emergencyPhone` · `jobPositionId (FK → job_positions)` · `area (enum AreaRRHH)` · `supervisorId String? @db.Uuid (self-FK → employees)` · `base (enum Base)` · `hireDate` · `status (enum EmployeeStatus: ACTIVO/INACTIVO/DESVINCULADO)` · `contractType (enum ContractType)` · `baseSalaryGross (Decimal 18,2)` · `afp?` · `health (enum HealthSystem: FONASA/ISAPRE)?` · `bank?` · `bankAccount?` · `notes?`.
_Relations:_ contracts, documents, certifications, availability, vacations, leaves, medicalLeaves, salaryRecords, evaluations[V2].

> **Sensitivity:** `rut`, `baseSalaryGross`, `bankAccount`, `health` are sensitive. CASL restricts read of salary/bank fields to RRHH/ADMIN/Finanzas-aggregate (see §3).

### 2.2 Contracts

**`employee_contracts`** [V1]
`employeeId (FK)` · `contractType (enum ContractType: INDEFINIDO/PLAZO_FIJO/POR_OBRA/HONORARIOS/EXTERNO)` · `startDate` · `endDate? (required if PLAZO_FIJO/POR_OBRA)` · `contractualRole` · `workSchedule (enum: COMPLETA/PARCIAL/TURNO/ESPECIAL)` · `baseSalary (Decimal 18,2)` · `gratification (enum: NO/LEGAL/PACTADA)` + `gratificationAmount?` · `mealAllowance (Decimal)?` · `transportAllowance (Decimal)?` · `workLocation (enum Base)` · `mainDuties (text)` · `supervisorId?` · `documentId? (FK → employee_documents — the signed PDF)` · `status (enum ContractStatus: VIGENTE/VENCIDO/REEMPLAZADO/TERMINADO)` · `parentContractId String? @db.Uuid (self-FK — anexos attach to original)`.
_Rule (ticket-level):_ only one `VIGENTE` principal contract per employee; PLAZO_FIJO near expiry → reminder cron (R2).

### 2.3 Documents (thin, copy-adapted from doc-control)

**`employee_document_types`** [V1] — RRHH's own type catalog (recon: separate from `OperationalDocumentType`)
`name` · `category (enum EmployeeDocCategory: CONTRATO/IDENTIDAD/PREVISIONAL/SALUD/SEGURIDAD/CERTIFICACION/AMONESTACION/FINIQUITO/OTRO)` · `defaultValidityDays Int?` · `requiresExpiry (bool)` · `isMandatoryDefault (bool)`.
_Seed:_ contrato, anexo, cédula, certificado AFP, certificado salud, liquidación, carta amonestación, finiquito, cert. capacitación, cert. piloto drone, habilitación cliente, habilitación faena, examen ocupacional, EPP, reglamento interno, obligación de informar, inducción seguridad.

**`employee_document_requirements`** [V1] — which docs are required, by employee or cargo
`employeeId String? @db.Uuid` · `jobPositionId String? @db.Uuid` · `documentTypeId (FK)` · `isMandatory (bool)` · `appliesToClient? (text — habilitación por cliente)` · `appliesToSite? (text — habilitación por faena)`.
_(Specificity resolution employee > jobPosition, copy-adapted from the asset>subtype>type engine.)_

**`employee_documents`** [V1] — the records (copy-adapted from `document_records`, assetId→employeeId)
`employeeId (FK)` · `documentTypeId (FK)` · `fileName` · `storageKey (MinIO, via reused StorageService)` · `blobFallback (bytes?)` · `mimeType` · `sizeBytes` · `issueDate?` · `expiryDate? (auto from defaultValidityDays)` · `status (reuse DocumentRecordStatus enum: VIGENTE/POR_VENCER/VENCIDO/REPLACED/...)` · `version Int` · `supersededById String? @db.Uuid (self-FK)` · `approvalStatus (enum: PENDIENTE/APROBADO/RECHAZADO)` · `approvedBy?` · `rejectionReason?` · `uploadedBy`.
_Rules (ticket-level):_ immutable supersession; uploader ≠ approver; compliance excludes REPLACED — all copy-adapted from the proven Operations algorithms.

### 2.4 Certifications & habilitations (the critical submodule)

**`employee_certifications`** [V1]
`employeeId (FK)` · `name` · `certType (enum CertType: PILOTO_DRONE/OPERADOR_CAMARA/TERMOGRAFIA/FOTOGRAMETRIA/SEGURIDAD_MINERA/ALTURA/ESPACIOS_CONFINADOS/MANEJO_DEFENSIVO/INDUCCION_CLIENTE/INDUCCION_FAENA/HIDROLAVADORA/EPP/PRIMEROS_AUXILIOS/LICENCIA_CONDUCIR/EXAMEN_OCUPACIONAL/OTRO)` · `issuer (text — DGAC, cliente, mutual, OTEC, interna)` · `issueDate` · `expiryDate?` · `documentId? (FK → employee_documents)` · `status (enum CertStatus: VIGENTE/POR_VENCER/VENCIDA/RECHAZADA)` · `enabledServiceNames (String[] — which catalog services this cert enables)` · `clientOrSite? (text)` · `notes?`.
_Rules (ticket-level + cross-module §4):_ expired required cert → staff not assignable to that service; expiry < 30 days → preventive reminder; admin override with reason + responsible + audit trail.

### 2.5 Availability (V1 index, not full shift engine)

**`employee_availability`** [V1]
`employeeId (FK)` · `date (or startDate/endDate for ranges)` · `status (enum AvailabilityStatus: DISPONIBLE/ASIGNADO/TURNO/LIBRE/VACACIONES/PERMISO/LICENCIA/CAPACITACION/NO_HABILITADO/BLOQUEO_MANUAL)` · `notes? · blockReason?`.
_Note:_ VACACIONES/LICENCIA/PERMISO rows are **derived/written** from the approved vacation/leave/medical records (automatic block); NO_HABILITADO is derived from cert/doc expiry. The board reads this table; the cross-module `for-service` query joins it with certifications (§4).
**`employee_shifts`** [V2] — full shift planning (create/repeat/assign) is V2.
**`employee_attendance`** [V2] — attendance capture is V2.

### 2.6 Vacations, permits, medical leaves

**`vacation_requests`** [V1]
`employeeId (FK)` · `startDate` · `endDate` · `businessDays (Int — computed)` · `status (enum: SOLICITADA/APROBADA/RECHAZADA/CANCELADA)` · `approvedBy? · rejectionReason? · requestedAt`.
_Balance is computed, not stored:_ `devengados = monthsWorked × 1.25`; `saldo = devengados + ajustes − usados − aprobados_futuros` (Dirección del Trabajo: 1.25 business days/month for a 15-business-day feriado). Approved rows write a VACACIONES block into `employee_availability`.

**`leave_requests`** [V1] — permisos administrativos / ausencias
`employeeId (FK)` · `type (enum: ADMINISTRATIVO/SIN_GOCE/OTRO)` · `startDate · endDate · businessDays · status · approvedBy? · reason?`.

**`medical_leaves`** [V1] — licencias médicas
`employeeId (FK)` · `type (enum: ENFERMEDAD_COMUN/ACCIDENTE/PRE_POST_NATAL/LABORAL/OTRO)` · `startDate · endDate · days (computed)` · `folio?` · `entity (enum: FONASA/ISAPRE/MUTUAL/COMPIN/CCAF)` · `status (enum: RECIBIDA/TRAMITADA/APROBADA/RECHAZADA/PENDIENTE)` · `documentId? · notes?`.
_Rule:_ blocks availability; untramitada → reminder.

### 2.7 Remuneraciones (MVP registry — NOT a payroll engine)

**`payroll_parameters`** [V1] — parametrizable per period (recon + external plan: never hardcoded)
`period (YYYY-MM)` · `topeImponibleUF (Decimal)` · `ufValue · utmValue` · `afpRates (Json — per AFP)` · `healthRatePct (default 7)` · `cesantiaRates (Json — by contract type; AFC 3% imponible)` · `incomeTaxBrackets (Json — impuesto único 2ª categoría)`. _(Seeded at 2026 values; editable.)_

**`salary_records`** [V1] — monthly registry + PDF, NOT auto-calculated in V1
`employeeId (FK)` · `period (YYYY-MM)` · `grossAmount (Decimal)` · `netAmount (Decimal — registered)` · `taxableEarnings (Decimal) · nonTaxableEarnings (Decimal) · deductions (Decimal)` · `estimatedCompanyCost (Decimal — gross + parametrized social charges)` · `liquidationDocumentId? (FK → employee_documents — the PDF)`.
_V1 = register + upload + dashboard mass._ Automatic calculation, libro de remuneraciones, Previred export → **V2**.

**`termination_simulations`** [V1] — "estimación de finiquito" (explicitly NOT definitive)
`employeeId (FK)` · `simulatedEndDate` · `contractType (from contract)` · `causal (enum: NECESIDADES_EMPRESA/RENUNCIA/PLAZO_FIJO/MUTUO_ACUERDO/OTRO)` · `lastRemuneration (Decimal)` · `yearsWorked (computed) · additionalMonths (computed)` · `pendingVacationDays (from vacations)` · `noticeIndemnization (bool)` · `serviceYearsIndemnization (Decimal — 1 month/year, cap 11 years, when causal applies)` · `proportionalVacation (Decimal)` · `pendingEarnings (manual) · deductions (manual)` · `totalEstimate (Decimal)`.
_UI shows a "no es cálculo legal definitivo" disclaimer (external plan requirement)._

### 2.8 Deferred to V2 (listed, not built)

`trainings` + `training_participants` (capacitaciones), `performance_reviews` (evaluación de desempeño), `onboarding_tasks`, `offboarding_tasks`, competency matrix, full `employee_shifts`/`employee_attendance`. The external plan's sprints for these land in V2.

---

## 3. CASL subjects & role rules

Per recon R3b, subjects + rules are declared in the CASL ability factory (4-site addition). New RRHH subjects:

`Employee`, `EmployeeContract`, `EmployeeDocument`, `Certification`, `Availability`, `VacationRequest`, `LeaveRequest`, `MedicalLeave`, `SalaryRecord`, `TerminationSimulation`, `PayrollParameter`.

Role matrix (existing 6 roles; "RRHH" maps to a role to be confirmed — likely `MANAGER` scoped, or a new membership flag):

| Subject                         | SUPER_ADMIN / ADMIN | RRHH role | Jefatura (supervisor)     | Trabajador (self, if user-linked) | ACCOUNTANT (Finanzas)   |
| ------------------------------- | ------------------- | --------- | ------------------------- | --------------------------------- | ----------------------- |
| Employee (non-salary fields)    | manage              | manage    | read (their team)         | read (self)                       | —                       |
| Employee **salary/bank fields** | manage              | manage    | —                         | read (self)                       | read **aggregate only** |
| EmployeeContract                | manage              | manage    | read (team)               | read (self)                       | —                       |
| EmployeeDocument                | manage              | manage    | read (team)               | read+create (self)                | —                       |
| Certification                   | manage              | manage    | read (team)               | read (self)                       | —                       |
| Availability                    | manage              | manage    | manage (team)             | read (self)                       | —                       |
| VacationRequest                 | manage              | manage    | **approve/reject** (team) | create+read (self)                | —                       |
| LeaveRequest                    | manage              | manage    | approve/reject (team)     | create+read (self)                | —                       |
| MedicalLeave                    | manage              | manage    | read (team)               | create+read (self)                | —                       |
| SalaryRecord                    | manage              | manage    | —                         | read (self)                       | read aggregate          |
| TerminationSimulation           | manage              | manage    | —                         | —                                 | read aggregate          |
| PayrollParameter                | manage              | manage    | —                         | —                                 | read                    |

**Key CASL rules (ticket-level):**

- Salary/bank field-level restriction enforced at query + serialization (not just UI hiding).
- "Self" access only when `employee.userId === currentUser.id` (and the employee is user-linked).
- Approve actions (vacation/leave) restricted to the employee's `supervisorId` chain or RRHH/ADMIN.
- Every endpoint declares `@CheckPolicies` — no exceptions (PoliciesGuard fail-open).

---

## 4. Cross-module hooks this model enables (detailed in their own module plans)

- **Comercial → RRHH (the headline):** `GET /api/rrhh/availability/for-service?service=<name>` joins `employee_certifications` (current, enabling that service) with `employee_availability` (DISPONIBLE) → `{ qualified, available, staff[], canStaff }`. This is the real version of the demo's simulated panel. Read-only, `@CheckPolicies`.
- **RRHH → Operaciones:** procedure acknowledgments (existing OPS feature) reference employees; certified-staff assignment to assets.
- **RRHH → Finanzas:** salary mass (`salary_records` aggregate) as expense/cost input — aggregate only, salary fields never exposed row-level to Finanzas.

---

## 5. Open items to confirm before Part 2 (tickets)

1. **RRHH role:** is "RRHH" an existing role mapped to `MANAGER`, or do we add a 7th role / a membership capability flag? (Affects every CASL rule above.)
2. **Salary field-level security:** confirm the approach — separate the sensitive fields into a guarded sub-resource, or field-level CASL on `employees`? (I lean toward a guarded `employee_compensation` view/endpoint to keep salary off the main ficha payload.)
3. **`employee_document_types`:** confirm separate from Operations (recon recommends separate — I've modeled it separate).
4. Confirm V1/V2 split above matches what you want to show/use first.

---

_Next (Part 2, after you validate this): the sprint → ticket breakdown (`HR-001`…) mapped to the external plan's RRHH sprints 1–4, each with acceptance criteria, plus the Chilean-domain calculation specs (liquidación / finiquito / vacaciones) certified — not directional._
