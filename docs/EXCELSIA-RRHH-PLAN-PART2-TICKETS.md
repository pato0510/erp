# Excelsia — RRHH Module Plan · Part 2: Sprints, Tickets & Chilean Calc Specs

**Module:** RRHH — V1
**Builds on:** `EXCELSIA-NEW-MODULES-FOUNDATION.md`, `RRHH-RECON.md`, `EXCELSIA-RRHH-PLAN-PART1-DATAMODEL.md`
**Status:** Part 2 — ticket breakdown + certified Chilean calculation specs, for validation
**Date:** 2026-06-23

> **Confirmed Part-1 decisions baked in:** RRHH role → `MANAGER`; salary/bank in a **guarded `employee_compensation` sub-resource** (never on the main `employees` payload); RRHH has its **own document types** (separate from Operations); V1/V2 split as in Part 1.

---

## 1. Ticket conventions (inherited, apply to every HR ticket)

- **One commit per ticket**, conventional commits, English; update `CLAUDE.md` `# Ticket actual`; validate locally (against the clean dev DB on port 5434); push to `develop`.
- **Every endpoint declares `@CheckPolicies`** (PoliciesGuard fails open — no exceptions).
- **Every table** ships RLS policy + audit trigger + GRANT to `app_user` (the templated checklist from `RRHH-RECON.md` R3c).
- **Reads/writes through `executeWithRls`.**
- **Reuse, don't import:** clone the Operations UI components that hard-code `/api/operations/*`; reuse `StorageService`, `DocumentStatusBadge`, `ComplianceGauge`, the `DocumentRecordStatus`/`AlertSeverity` enums, `KpiCard`, the table/modal/tabbed-ficha/month-grid patterns. Tokens: `#2563eb` / `Outfit`.
- **`formatRUT` is created in HR-001** before any RUT-bearing screen.

---

## 2. Sprint → ticket breakdown

Mapped to the external plan's RRHH sprints 1–4. Each ticket: scope · key tables/endpoints/screens · acceptance criteria (AC).

### Sprint 1 — Foundation & Core (ficha, cargos, documents, dashboard)

**HR-001 — Module scaffold + `formatRUT`**
Scope: NestJS `RrhhModule` registered; CASL subjects declared (Employee, EmployeeContract, EmployeeDocument, Certification, Availability, VacationRequest, LeaveRequest, MedicalLeave, SalaryRecord, TerminationSimulation, PayrollParameter, EmployeeCompensation) with the MANAGER role rules from Part-1 §3; `RrhhSidebar` (cloned) + `(dashboard)/rrhh` route group; `formatRUT`/`validateRut` (Módulo-11) added to `lib/formatters`.
AC: `nx build api && web` green; `/rrhh` route renders an empty shell with the sidebar; a VIEWER hitting any RRHH endpoint gets 403; `formatRUT` unit-tested (valid/invalid/edge check digits incl. `K`).

**HR-002 — `job_positions` (cargos / perfiles)**
Scope: table + CRUD endpoints (all `@CheckPolicies`) + screen (table + modal); fields incl. `requiredCertTypes`, `requiredDocTypes`, `enabledServices`.
AC: create/edit/deactivate cargo; RLS+audit+GRANT present (verified in migration); enabledServices is a multi-select; only MANAGER/ADMIN can mutate.

**HR-003 — `employees` core + `employee_compensation` (guarded)**
Scope: `employees` table (nullable `userId` FK, `onDelete: SetNull`); **separate `employee_compensation`** table (baseSalaryGross, bank, bankAccount, afp, health) behind its own endpoint guarded so the main `employees` payload never includes compensation; employee CRUD; ficha shell with tabs (Resumen, Datos personales, Contrato, Remuneraciones, Documentos, Vacaciones, Licencias, Certificaciones, Habilitaciones, Historial, Alertas — later tickets fill tabs).
AC: create employee with min fields + valid RUT; link/unlink a `user` (optional); GET `/employees/:id` returns **no** salary/bank fields; GET `/employees/:id/compensation` returns them only for MANAGER/ADMIN (ACCOUNTANT gets aggregate only, not row detail); self (`employee.userId === currentUser.id`) reads own ficha; RLS+audit+GRANT on both tables.

**HR-004 — Employee documents (copy-adapted doc-control)**
Scope: `employee_document_types` (seeded per Part-1 list) + `employee_document_requirements` (employee > jobPosition specificity) + `employee_documents` (upload via reused `StorageService` + MinIO/DB-blob fallback, mime/size validation, immutable supersession, expiry from `defaultValidityDays`, approval uploader≠approver, compliance excludes REPLACED); Documentos tab (per-employee, reusing `DocumentStatusBadge` + `ComplianceGauge`).
AC: upload a doc with auto-expiry; supersede creates new + marks old REPLACED (REPLACED immutable); duplicate upload offers supersession (409); uploader cannot approve own doc; compliance gauge excludes REPLACED; copy-adapted algorithms match Operations behavior (no asset coupling).

**HR-005 — RRHH reminder cron (R2)**
Scope: BullMQ repeatable cron (cloned pattern) computing expiries (documents POR_VENCER/VENCIDO, by 7/15/30/60-day windows) → pushes to generic `user_notifications` via `NotificationService.createGeneric()` using `AlertSeverity`; idempotent (no duplicate same-day notifications).
AC: cron registered and listed in health/crons; a doc expiring in <30d produces one WARNING notification; an expired critical doc produces one CRITICAL; re-running the cron same day produces no duplicates.

**HR-006 — RRHH dashboard (basic)**
Scope: dashboard reusing `KpiCard` — dotación activa, dotación por área, masa salarial (gross + net **from the compensation aggregate**, MANAGER+ only), documentos vencidos / por vencer, próximas renovaciones de contrato (placeholder until HR-007), expiry-alert center, worker list.
AC: KPIs compute from real data; masa salarial visible only to MANAGER/ADMIN; alert center reflects HR-005 notifications; worker list links to fichas.

### Sprint 2 — Contracts, remuneraciones base, finiquito estimate

**HR-007 — `employee_contracts` + anexos**
Scope: table (incl. `parentContractId` self-FK for anexos, `gratification` enum, `status`); Contrato tab; contract CRUD; extend the HR-005 cron with contract-expiry reminders; the "próximas renovaciones" KPI now real.
AC: only one VIGENTE principal contract per employee (enforced); anexo attaches to original; PLAZO_FIJO requires endDate; expiry < window → reminder; a VENCIDO contract flags the employee "revisar situación contractual".

**HR-008 — `payroll_parameters`**
Scope: table + admin screen (MANAGER/ADMIN); seeded with **verified 2026 values** (§3.4); editable per period.
AC: parameters seeded for 2026; editable; a period selector; values consumed by HR-009/HR-010 (no hardcoded rates anywhere — grep proves it).

**HR-009 — `salary_records` (registry + PDF + cost estimate)** — _V1 = register, NOT auto-calc_
Scope: monthly registry (gross, net registered, taxable/non-taxable earnings, deductions) + liquidación PDF upload (reuse StorageService) + `estimatedCompanyCost` (gross + parametrized social charges, §3.3) + masa salarial history in dashboard; Remuneraciones tab.
AC: register a month's gross/net + upload PDF; estimatedCompanyCost computes from `payroll_parameters`; history per employee; dashboard mass updates; **no automatic liquidación calculation in V1** (see §3.5 decision flag).

**HR-010 — `termination_simulations` (estimación de finiquito)**
Scope: finiquito estimator per §3.2 + screen with the **"no es cálculo legal definitivo"** disclaimer; pulls hireDate, contract, last remuneration, pending vacation days.
AC: computes indemnización años de servicio (1 mes/año, tope 11 años, base tope 90 UF), aviso previo, feriado proporcional, by causal; uses `payroll_parameters` (UF); disclaimer shown; result is a saved simulation, not a definitive finiquito.

### Sprint 3 — Vacations, permits, medical leaves

**HR-011 — `vacation_requests` + balance + approval**
Scope: request/approve/reject flow (CASL: supervisor chain or MANAGER/ADMIN approves); balance **computed** per §3.1 (1.25 business days/month) + índice de uso; approved rows **write a VACACIONES block** into `employee_availability` (HR-015).
AC: employee (if user-linked) requests vacations; supervisor approves/rejects (reason on reject); balance = devengados − usados − aprobados_futuros; approved vacation blocks availability; índice de uso shown.

**HR-012 — `leave_requests` (permisos) + `medical_leaves` (licencias)**
Scope: both tables + flows; medical leave fields (entity, folio, type, status); both write availability blocks; extend cron with "licencia no tramitada" reminder.
AC: register permiso/licencia; both block availability for their dates; untramitada licencia → reminder; history per employee.

**HR-013 — Vacaciones/licencias screens + dashboard surfacing**
Scope: screens for the three (vacations/permits/medical) + Vacaciones & Licencias tabs on the ficha; dashboard surfaces active leaves, upcoming approved vacations, accumulated balance.
AC: screens list + filter; ficha tabs populated; dashboard KPIs (vacaciones acumuladas, licencias activas) compute.

### Sprint 4 — Availability, certifications, cross-module (V1 = index, NOT full shift engine)

**HR-014 — `employee_certifications` + cert matrix (the critical view)**
Scope: table + **certification matrix screen** (employees × cert types, status via `DocumentStatusBadge`, `ComplianceGauge`) + create/edit + admin override (reason + responsible + audit) + extend cron with cert-expiry reminders; certs link `enabledServiceNames`.
AC: register cert with expiry; matrix shows VIGENTE/POR_VENCER/VENCIDA; expired/expiring → reminders; admin override logged with reason+responsible; a VENCIDA required cert marks the employee NO_HABILITADO for that service (feeds HR-016).

**HR-015 — `employee_availability` board (index)**
Scope: month-grid availability board (cloned visual language, NOT the Operations calendar) with the 10 statuses + legend + role/area filters; **derived blocks** written from approved vacations/leaves/medical (HR-011/012) and from cert/doc expiry (NO_HABILITADO); Disponibilidad screen.
AC: board populated for the current month; VACACIONES/LICENCIA/PERMISO blocks appear automatically from approved records; NO_HABILITADO appears from expired required certs; manual BLOQUEO_MANUAL with reason; filters work.

**HR-016 — Cross-module: `GET /availability/for-service` (real)**
Scope: the read-only endpoint joining `employee_certifications` (current, enabling the service) with `employee_availability` (DISPONIBLE) → `{ qualified, available, staff[], canStaff }`. This is the **data-driven** version of the demo's simulated Comercial panel (Comercial wires to it when that module is built).
AC: for a given service + date, returns qualified vs available counts and the staff list with cert+availability status; `canStaff` true only if ≥1 certified & available; `@CheckPolicies`; read-only; expiring a cert or blocking availability changes the result.

---

## 3. Certified Chilean calculation specs

The **certified** V1 calculations are vacaciones, finiquito estimation, and the cost-empresa estimate. All rates/topes/brackets come from `payroll_parameters` — **never hardcoded**. Values seeded/updated from official sources: **Superintendencia de Pensiones** (topes, AFP), **SII** (UTM, impuesto único brackets), **AFC** (cesantía), **mindicador/SII** (UF, UTM monthly).

### 3.1 Vacaciones (HR-011)

- Accrual: **1.25 business days per month worked** (15 business days / 12), per Dirección del Trabajo.
- `devengados = monthsWorked × 1.25`
- `saldo = devengados + ajustes − usados − aprobadosFuturos`
- Índice de uso (last 12 months): `usados / devengados × 100` → bands: 0–40% acumulación, 41–80% bajo uso, 81–120% saludable, >120% alto consumo.
- Feriado proporcional (used in finiquito): `días de feriado × (mesesTrabajados / 12)`.

### 3.2 Finiquito estimation (HR-010) — "estimación", not definitive

Components (each on/off by causal):

- **Indemnización por años de servicio:** 1 month of last remuneration per year of service **and fraction > 6 months**, **cap 11 years**, with the monthly base **capped at 90 UF** (Art. 172 Código del Trabajo). Applies for causal like _necesidades de la empresa_.
- **Indemnización sustitutiva del aviso previo:** 1 month (when applicable; capped at 90 UF base).
- **Feriado proporcional / pending vacation:** from §3.1.
- **Pending earnings − deductions:** manual.
- `totalEstimate = años_servicio + aviso_previo + feriado/vacaciones + haberes_pendientes − descuentos`.
- UI disclaimer mandatory: not a definitive legal finiquito (depends on causal, caps, agreements, legal/accounting review).

### 3.3 Cost-empresa estimate (HR-009)

`estimatedCompanyCost = grossSalary + employer social charges`, where employer charges are parametrized: **AFC employer** (2.4% indefinido / 3% plazo fijo, capped at the AFC tope), **SIS** (employer, ~parametrized), the **2025-reform employer contribution** (parametrized, phasing in), and **mutual / ley de accidentes** (parametrized). All from `payroll_parameters` — an estimate, flagged as such.

### 3.4 `payroll_parameters` — verified 2026 seed

| Parameter                                 | 2026 value                                        | Source                              |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| Tope imponible AFP / salud / acc. trabajo | **90,0 UF**                                       | Superintendencia de Pensiones       |
| Tope imponible seguro cesantía (AFC)      | **135,2 UF**                                      | Superintendencia de Pensiones / AFC |
| Salud (Fonasa)                            | **7%** (Isapre: plan, may exceed)                 | —                                   |
| AFP cotización                            | **10%** + comisión per AFP (≈0,49%–1,45%)         | Superintendencia de Pensiones       |
| AFC indefinido                            | worker **0,6%** + employer **2,4%**               | DT / AFC                            |
| AFC plazo fijo / obra                     | worker **0%** + employer **3%**                   | DT / AFC                            |
| Impuesto único 2ª categoría               | progressive marginal brackets in **UTM**, monthly | SII                                 |
| UF / UTM                                  | monthly (e.g. UTM ~ $69.889 Mar-2026)             | SII / mindicador                    |

> These are **seeds**; UF, UTM, AFP commissions and the impuesto brackets change monthly/annually and are updated in `payroll_parameters` from the official sources. The app reads the table, never constants.

### 3.5 ⚠️ Scope decision flag — full liquidación auto-calc

The demo had a _directional_ liquidación calculator. For V1 we keep **liquidación as a registry** (HR-009) and place the **certified monthly liquidación auto-calculator in V2** — per the external plan ("no construir todavía un motor completo de remuneraciones... cálculo automático = Versión 2"), because a certified monthly net-pay engine is legally sensitive and needs accountant validation. The verified formula structure (sum imponibles → deductions with topes → AFP/salud/AFC → impuesto único on base tributable → add no imponibles) is captured here for when V2 builds it.
**Decision needed:** keep auto-calc in V2 (recommended), or pull it into V1? Default = V2 unless you say otherwise.

---

## 4. Definition of Done (per ticket, inherited)

Code + validations + CASL applied (`@CheckPolicies`) + audit where relevant + states modeled + manual tests passed + multi-tenancy not broken (`executeWithRls`) + `nx build api`/`nx build web` green + migration runs cleanly (RLS+audit+GRANT verified) + `CLAUDE.md` updated.

---

## 5. Next steps

1. **You validate** this breakdown + the §3.5 liquidación decision.
2. On approval, I write the first CC prompt (**HR-001**, the scaffold + `formatRUT` + CASL subjects) in the serial human-gated flow.
3. **FASE 0 housekeeping** can be interleaved before/around the first migration to `develop` (drop the `railway.json` redundant boot clause; bring the foundation + ownership + verification docs into `develop/docs`).

_RRHH ticket count (V1): HR-001 … HR-016. Manual de RRHH (17-chapter standard) at module V1 close._
