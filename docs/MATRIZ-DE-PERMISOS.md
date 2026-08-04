# Excelsia ERP — Matriz de Permisos (la matriz de la plataforma)

**Tipo:** documento de referencia READ-ONLY. Fecha: 2026-08-04.
**Fuentes verificadas directamente contra el código:**
`apps/api/src/modules/common/casl/casl-ability.factory.ts` (las abilities),
cada `*.controller.ts` (el gating real), y `docs/HARDENING-RECON.md`
(HARDEN-000/001, la divergencia de las dos capas).
**Propósito:** una respuesta permanente y usable por el negocio a "¿qué puede
ver, cambiar y alcanzar cada rol?" — para el onboarding de AGS, para asignar
roles a personas reales, y como línea base contra la cual chequear cada módulo
futuro.

> **Nota de idioma (excepción del director):** el cuerpo técnico va en inglés/
> mixto como el resto de `docs/`, pero la **§7 Resumen por perfil** va en
> español llano y de cara al negocio, a propósito.

---

## 1. Cómo leer este documento

**Los seis roles** (enum `UserRole`): `SUPER_ADMIN`, `ADMIN`, `MANAGER`,
`ACCOUNTANT`, `ANALYST`, `VIEWER`.

**Qué es CASL, en un párrafo.** CASL es la capa de autorización: por cada rol,
`casl-ability.factory.ts` construye una "ability" — una lista de reglas
`can(acción, Subject)` / `cannot(acción, Subject)`, donde un _Subject_ es un
tipo de dato (Movement, Employee, HsecIncident…). Un endpoint declara
`@CheckPolicies((ability) => ability.can('read', XSubject))` y el `PoliciesGuard`
consulta la ability del rol para decidir 200 vs 403. **Última regla gana**
(last-rule-wins): un "piso" `cannot('read', …)` seguido de un `can('read', …)`
posterior deja la lectura habilitada.

**Gated vs ungated.** Un endpoint **gated** lleva `@CheckPolicies`: el
`PoliciesGuard` (a) valida el header `x-company-id` contra las membresías del
llamador y (b) consulta la ability. Un endpoint **ungated** (sin
`@CheckPolicies`) hace que el guard **corte a `true` de inmediato**
(`policies.guard.ts:17-20`) **antes** de validar membresía o consultar CASL.

> **⚠️ ADVERTENCIA — LAS DOS CAPAS, NUNCA UNA.** El poder real de un rol es la
> **intersección** de (a) su ability CASL y (b) si el endpoint _pregunta_. Un
> endpoint ungated **saltea toda esta matriz**: no revisa membresía ni CASL, y
> `@CurrentCompany()` le entrega el header `x-company-id` crudo. HARDEN-000/001
> probó que las capas pueden divergir (nueve endpoints del dashboard corrían sin
> `@CheckPolicies`). Por eso la **§4 (inventario ungated)** es tan importante
> como las tablas. **RLS NO es el respaldo:** en runtime el rol de conexión
> bypassa RLS y las vistas materializadas no pueden llevar políticas RLS
> (HARDEN-000) — la única frontera de tenant en un endpoint es su
> `@CheckPolicies`.

**Leyenda de las tablas:** `R` leer · `C` crear · `U` actualizar · `D` borrar ·
`M` manage (todo) · `—` nada. Verbos de flujo (approve/reject/authorize/start/
close/publish/acknowledge/…) se pliegan a la clase `U` y se anotan al pie.

---

## 2. Baselines por rol (la postura de arranque)

Cada celda posterior es trazable a estos arranques (`casl-ability.factory.ts`):

| Rol             | Baseline                                                                                                                                                                                                            | file:line  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **SUPER_ADMIN** | `can('manage', 'all')` — todo, M en cada Subject; **nunca** recibe `cannot()`                                                                                                                                       | `:492`     |
| **ADMIN**       | `can('manage', 'all')` — idéntico a SUPER_ADMIN                                                                                                                                                                     | `:496`     |
| **MANAGER**     | `can('read', 'all')` + escrituras específicas; luego **pisos** default-deny en Comercial/Marketing/Calendario/HSEC, **re-otorgados** a full CRUD                                                                    | `:499-614` |
| **ACCOUNTANT**  | `can('read', 'all')` + escritura de dinero (Movement/Category/Counterparty/CostCenter); pisos que revocan RRHH (re-grant read-only de compensación) / Comercial (read-only) / Marketing (solo dinero) / HSEC (nada) | `:616-679` |
| **ANALYST**     | `can('read', 'all')` + mínimos; pisos que revocan RRHH (nada), ServiceOrder (nada), Comercial (solo ServiceCatalog), Marketing (nada), HSEC (nada)                                                                  | `:681-713` |
| **VIEWER**      | **SIN** `read all` — **grant-by-enumeration**: solo lee lo enumerado explícitamente (Finanzas + Operaciones read + Calendario + ServiceCatalog + Dashboard). Todo lo no enumerado = `—`                             | `:715-783` |

Dos consecuencias estructurales que se repiten abajo:

- **SUPER_ADMIN y ADMIN = `M` en TODO** (manage all, nunca floored). No se repite celda por celda; asúmase M salvo que un endpoint no exista.
- **VIEWER solo tiene lo que se le enumera.** Un Subject nuevo que nadie le otorgue explícitamente es `—` para VIEWER por construcción.

---

## 3. Tablas por módulo (CASL ability, NET result)

> Columnas: SA · ADMIN · MANAGER · ACCOUNTANT (ACC) · ANALYST (AN) · VIEWER.
> SA y ADMIN son `M` en toda fila donde el Subject existe.

### 3.1 IAM / Común

| Subject | SA  | ADMIN | MANAGER | ACC | AN  | VIEWER | Endpoint gate (file)                                                                                                  |
| ------- | --- | ----- | ------- | --- | --- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| User    | M   | M     | R¹      | R¹  | R¹  | —      | `iam/users.controller.ts` — **solo `manage`** ⇒ CRUD de usuarios = **solo ADMIN/SA**                                  |
| Company | M   | M     | R       | R   | R   | —      | `companies.controller.ts` (read); `tax/sii-connection.controller.ts` `manage` (config SII/certificado) = **ADMIN/SA** |
| Tenant  | M   | M     | R       | R   | R   | —      | **sin endpoint** (Subject muerto — §6)                                                                                |

¹ Vía `read all`; pero el único endpoint de User gatea en `manage` (crear/editar usuarios), así que MANAGER/ACC/AN de hecho no gestionan usuarios.

### 3.2 Finanzas (movimientos, caja/compromisos, banco, conciliación, tributario, reportes)

Todos los controladores de dinero (`cashflow`/caja+compromisos, `banking`,
`movements`, `reconciliation`) gatean en **`MovementSubject`**. `tax` gatea en
`MovementSubject` (read/update) + `CompanySubject` `manage` (config SII).
`reports` gatea en `ReportSubject`.

| Subject                                                                | SA  | ADMIN | MANAGER | ACC   | AN  | VIEWER                           |
| ---------------------------------------------------------------------- | --- | ----- | ------- | ----- | --- | -------------------------------- |
| **Movement** (caja · compromisos · movimientos · banco · conciliación) | M   | M     | R C U   | R C U | R   | **R** ← _excepción firmada (§5)_ |
| Report                                                                 | M   | M     | R C U   | R     | R   | R                                |
| Category                                                               | M   | M     | R C U   | R C U | R   | R                                |
| Counterparty                                                           | M   | M     | R C U   | R C U | R   | R                                |
| CostCenter                                                             | M   | M     | R C U   | R C U | R   | R                                |
| FiscalPeriod (+ closing)                                               | M   | M     | R C U   | R     | R   | R                                |

Notas: nadie salvo ADMIN/SA **borra** Movement (`D` solo por manage all — la
caja tiene endpoint `delete` que exige `delete MovementSubject`). El cierre de
período (`closing.controller.ts`) gatea `read`/`delete FiscalPeriodSubject`
(delete = ADMIN/SA).

### 3.3 Operaciones (activos, documentos, permisos, procedimientos, alertas, dashboard)

| Subject                 | SA  | ADMIN | MANAGER | ACC   | AN    | VIEWER               |
| ----------------------- | --- | ----- | ------- | ----- | ----- | -------------------- |
| OperationalAsset        | M   | M     | R C U   | R     | R     | R                    |
| AssetType / Subtype     | M   | M     | R       | R     | R     | R                    |
| Location                | M   | M     | R C U   | R     | R     | R                    |
| Vehicle                 | M   | M     | R C U   | R     | R     | R                    |
| DocumentType            | M   | M     | R C U D | R     | R     | R                    |
| DocumentRequirement     | M   | M     | R C U D | R     | R     | R                    |
| DocumentRecord          | M   | M     | R C U²  | R³    | R³    | R³                   |
| AlertRule               | M   | M     | R C U D | R     | R     | R                    |
| AlertSettings           | M   | M     | R U     | R     | R     | R                    |
| AssetException          | M   | M     | R C⁴    | R C⁴  | R C⁴  | R C⁴                 |
| PermitType              | M   | M     | R C U D | R     | R     | R                    |
| Permit                  | M   | M     | R C U²  | R     | R     | R                    |
| WorkPermitType          | M   | M     | R C U D | R     | R     | R                    |
| WorkPermit              | M   | M     | R C U⁵  | R C U | R C U | R                    |
| PermitApprovalStep      | M   | M     | R C U D | R     | R     | R                    |
| PermitApproval          | M   | M     | R⁶      | R     | R     | R                    |
| Procedure               | M   | M     | R C U⁷  | R     | R     | R                    |
| ProcedureAcknowledgment | M   | M     | R⁸      | R⁸    | R⁸    | R⁸                   |
| DomainEvent             | M   | M     | R       | R     | R     | —                    |
| CommitmentTemplate      | M   | M     | **M**   | R     | R     | —                    |
| **OperationsDashboard** | M   | M     | R       | R     | R     | **R** ← _HARDEN-001_ |
| AuditPackage            | M   | M     | R C     | R     | R     | —                    |

² + verbos de flujo approve/reject/resubmit/supersede; **no delete** (delete = ADMIN/SA, OPS-014/024).
³ ACC/AN/VIEWER además `resubmit` (el servicio exige "solo el uploader original").
⁴ `create` = pedir excepción; approve/reject/**revoke** = **solo ADMIN/SA** (OPS-023).
⁵ MANAGER corre el ciclo completo authorize/start/suspend/resume/close/cancel; `skip` = ADMIN.
⁶ MANAGER además approve/reject de pasos.
⁷ MANAGER además review/publish; **deprecate** = ADMIN/SA.
⁸ + `acknowledge` (acusar la propia lectura); `exempt` = ADMIN/SA.

Dashboard: `refresh-views` (regenerar vistas materializadas) exige `manage
OperationsDashboardSubject` = **solo ADMIN/SA**; las nueve lecturas exigen
`read` = los seis roles (gated desde HARDEN-001).

### 3.4 RRHH

`RRHH_SUBJECTS` = Employee, EmployeeContract, EmployeeDocument, Certification,
Availability, VacationRequest, LeaveRequest, MedicalLeave, SalaryRecord,
TerminationSimulation, PayrollParameter, EmployeeCompensation, JobPosition
(`:319-333`).

| Subject                            | SA  | ADMIN | MANAGER | ACC   | AN  | VIEWER |
| ---------------------------------- | --- | ----- | ------- | ----- | --- | ------ |
| Employee                           | M   | M     | M       | **R** | —   | —      |
| EmployeeCompensation (sueldos)     | M   | M     | M       | **R** | —   | —      |
| SalaryRecord                       | M   | M     | M⁹      | R⁹    | —   | —      |
| TerminationSimulation (finiquitos) | M   | M     | M       | **R** | —   | —      |
| EmployeeContract                   | M   | M     | M       | —     | —   | —      |
| EmployeeDocument                   | M   | M     | M       | —     | —   | —      |
| Certification                      | M   | M     | M       | —     | —   | —      |
| Availability (disponibilidad)      | M   | M     | M       | —     | —   | —      |
| VacationRequest                    | M   | M     | M       | —     | —   | —      |
| LeaveRequest / Absence             | M   | M     | M       | —     | —   | —      |
| MedicalLeave                       | M   | M     | M⁹      | —     | —   | —      |
| PayrollParameter                   | M   | M     | M       | —     | —   | —      |
| JobPosition (cargos)               | M   | M     | M       | —     | —   | —      |

⁹ `SalaryRecord` y `MedicalLeave` reciben la ability pero **ningún endpoint las
consume** (Subjects muertos, §6). Los sueldos/liquidaciones reales viven bajo
`EmployeeCompensation` (settlements) y `TerminationSimulation` (terminations) —
que el ACCOUNTANT **sí** lee. Ver §5 (excepción del contador).

ACCOUNTANT = read-only de lo financiero (Employee + EmployeeCompensation +
TerminationSimulation) y **nada más**; **cero** escritura en cualquier subject
RRHH (`:645-647`). ANALYST y VIEWER = `—` en TODO RRHH.

### 3.5 Comercial (CRM)

`COMERCIAL_SUBJECTS` = Account, Contact, Opportunity, Activity, ServiceCatalog,
Quote (`:344-351`). ServiceOrder es de origen Comercial pero su endpoint vive en
Operaciones (`service-orders.controller.ts`).

| Subject                 | SA  | ADMIN | MANAGER | ACC | AN  | VIEWER |
| ----------------------- | --- | ----- | ------- | --- | --- | ------ |
| ServiceCatalog          | M   | M     | R C U D | R   | R   | R      |
| Account                 | M   | M     | R C U D | R   | —   | —      |
| Contact                 | M   | M     | R C U D | R   | —   | —      |
| Opportunity             | M   | M     | R C U D | R   | —   | —      |
| Activity (timeline CRM) | M   | M     | R C U D | R   | —   | —      |
| Quote (cotizaciones)    | M   | M     | R C U D | R   | —   | —      |
| ServiceOrder (montos $) | M   | M     | R U¹⁰   | R   | —   | —      |

¹⁰ MANAGER avanza la máquina de estado + edita título/notas; **no create**
(las órdenes nacen del handoff COM-013b). ANALYST y VIEWER: **sin** ServiceOrder
(lleva montos de contrato; regla "ANALYST/VIEWER no ven dinero").
ServiceCatalog es el único Comercial que ANALYST/VIEWER leen (catálogo
compartido, no sensible).

### 3.6 Marketing

`MARKETING_SUBJECTS` = Campaign, MarketingExpense, PresenceSnapshot (`:355`).

| Subject                              | SA  | ADMIN | MANAGER | ACC   | AN  | VIEWER |
| ------------------------------------ | --- | ----- | ------- | ----- | --- | ------ |
| Campaign (presupuesto $)             | M   | M     | R C U D | **R** | —   | —      |
| MarketingExpense (gasto $)           | M   | M     | R C U D | **R** | —   | —      |
| PresenceSnapshot (presencia digital) | M   | M     | R C U D | —     | —   | —      |

ACCOUNTANT lee solo lo que lleva dinero (Campaign + MarketingExpense — patrón
contador chileno); **ciego** en PresenceSnapshot. ANALYST/VIEWER: `—` en todo
Marketing.

### 3.7 Calendario de Actividades (la matriz INVERTIDA)

`CALENDARIO_SUBJECTS` = CalendarActivity, ActivityArea (`:361`).

| Subject          | SA  | ADMIN | MANAGER | ACC   | AN    | VIEWER |
| ---------------- | --- | ----- | ------- | ----- | ----- | ------ |
| CalendarActivity | M   | M     | R C U D | **R** | **R** | **R**  |
| ActivityArea     | M   | M     | R C U D | **R** | **R** | **R**  |

**Los seis roles LEEN** (no hay dinero en la superficie — decisión del
fundador Q4); escritura = MANAGER/ADMIN/SA. Es el primer módulo con read para
los seis roles (§5).

### 3.8 HSEC (Salud, Seguridad, Medio Ambiente y Comunidades)

`HSEC_SUBJECTS` = HsecIncident, HsecIncidentPerson, HsecTraining,
HsecEppDelivery, HsecEppItem (`:365-371`).

| Subject                        | SA  | ADMIN | MANAGER | ACC | AN  | VIEWER |
| ------------------------------ | --- | ----- | ------- | --- | --- | ------ |
| HsecIncident                   | M   | M     | R C U D | —   | —   | —      |
| HsecIncidentPerson (afectados) | M   | M     | R C U D | —   | —   | —      |
| HsecTraining (capacitaciones)  | M   | M     | R C U D | —   | —   | —      |
| HsecEppDelivery (entregas EPP) | M   | M     | R C U D | —   | —   | —      |
| HsecEppItem (catálogo EPP)     | M   | M     | R C U D | —   | —   | —      |

**Módulo entero = MANAGER/ADMIN/SUPER_ADMIN.** ACCOUNTANT/ANALYST/VIEWER: `—`
en todo (PII adyacente a salud — matriz firmada 2026-07-27, §5).

---

## 4. Inventario UNGATED — la sección más importante

Barrido de **los 94 controladores** en `apps/api/src/modules`. **19 handlers**
sin `@CheckPolicies`, en 7 controladores. (Verificado dos veces: detector
por-handler propio + subagente, coincidentes; `sii-connection.controller.ts:29`
resultó falso positivo — su `@CheckPolicies manage CompanySubject` está en
`:33`.) `operations-dashboard.controller.ts` quedó **confirmado 100% gated**
tras HARDEN-001.

### 4(a) Legítimamente abiertos por diseño — 6

| file:line                                     | Ruta                                    | Verbo | companyId | JWT                       | Por qué es legítimo                                                       |
| --------------------------------------------- | --------------------------------------- | ----- | --------- | ------------------------- | ------------------------------------------------------------------------- |
| `health/health.controller.ts:12`              | `/api/health`                           | GET   | no        | **NO**                    | Liveness probe; jamás debe requerir auth.                                 |
| `iam/auth.controller.ts:25`                   | `/api/auth/login`                       | POST  | no        | LocalAuthGuard            | Login por credenciales — corre antes de existir identidad.                |
| `iam/auth.controller.ts:31`                   | `/api/auth/logout`                      | POST  | no        | JwtAuthGuard              | Cierra la propia sesión del llamador.                                     |
| `iam/auth.controller.ts:39`                   | `/api/auth/me`                          | GET   | no        | JwtAuthGuard              | Devuelve la propia identidad del llamador.                                |
| `iam/auth.controller.ts:46`                   | `/api/auth/refresh`                     | POST  | no        | RefreshGuard              | Rotación del refresh-token; pre-CASL por diseño.                          |
| `operations/assets/asset-qr.controller.ts:37` | `/api/operations/public/asset/:qrToken` | GET   | no        | **NO** (@Throttle 30/min) | Escaneo QR anónimo — feature público OPS-035, info limitada + rate-limit. |

### 4(b) Necesitan revisión — autenticados pero ungated — 13

Todos detrás de `JwtAuthGuard` (no anónimos), sin `@CheckPolicies`.

| file:line                                                  | Ruta                                                  | Verbo | companyId | Severidad / nota                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------- | ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operations/calendar/operations-calendar.controller.ts:33` | `/operations/calendar/events`                         | GET   | **sí**    | **ALTA** — datos de tenant, y el controlador tiene **solo `@UseGuards(JwtAuthGuard)` — SIN PoliciesGuard** (`:29`): cero chequeo de membresía. Cross-tenant vía header `x-company-id`. La misma clase que el dashboard pre-HARDEN-001, **todavía abierta**. |
| `…operations-calendar.controller.ts:58`                    | `/operations/calendar/events/by-date`                 | GET   | **sí**    | **ALTA** — idem.                                                                                                                                                                                                                                            |
| `…operations-calendar.controller.ts:68`                    | `/operations/calendar/month-summary`                  | GET   | **sí**    | **ALTA** — idem.                                                                                                                                                                                                                                            |
| `…operations-calendar.controller.ts:82`                    | `/operations/calendar/export`                         | GET   | **sí**    | **ALTA** — export iCal de datos de la empresa; RLS-only.                                                                                                                                                                                                    |
| `operations/assets/asset-qr.controller.ts:51`              | `/api/operations/public/asset/:qrToken/authenticated` | GET   | **sí**    | MEDIA — vista extendida del QR para usuario logueado; scoped por token, `@CurrentCompany` sin verificar membresía. Feature OPS-035.                                                                                                                         |
| `operations/health/operations-health.controller.ts:64`     | `/operations/health`                                  | GET   | no        | MEDIA (info-leak) — estado de subsistemas (DB/Redis/MinIO/MV) a cualquier autenticado de cualquier empresa.                                                                                                                                                 |
| `…operations-health.controller.ts:96`                      | `/operations/health/crons`                            | GET   | no        | MEDIA (info-leak) — registro de crons/colas a cualquier autenticado.                                                                                                                                                                                        |
| `operations/notifications/notification.controller.ts:17`   | `/operations/notifications`                           | GET   | **sí**    | BAJA — scoped por userId (JWT) en el servicio; "datos propios".                                                                                                                                                                                             |
| `…notification.controller.ts:26`                           | `…/unread-count`                                      | GET   | **sí**    | BAJA — idem.                                                                                                                                                                                                                                                |
| `…notification.controller.ts:31`                           | `…/mark-all-read`                                     | POST  | **sí**    | BAJA — muta estado; scoped al llamador.                                                                                                                                                                                                                     |
| `…notification.controller.ts:36`                           | `…/:id/read`                                          | POST  | **sí**    | BAJA — idem.                                                                                                                                                                                                                                                |
| `…notification.controller.ts:45`                           | `…/:id/dismiss`                                       | POST  | **sí**    | BAJA — idem.                                                                                                                                                                                                                                                |
| `operations/audit/audit-package.controller.ts:104`         | `/operations/audit/legal-framework`                   | GET   | no        | BAJA — devuelve solo constantes legales estáticas (Ley 16.744, DS 594…), sin datos de tenant.                                                                                                                                                               |

**(b) NO está vacío: 13 handlers.** El foco de revisión son los **4 de
`operations/calendar`** (datos de tenant, sin PoliciesGuard) — candidatos
directos a un HARDEN-002. Los otros 9 son decisiones de diseño documentadas de
menor severidad (self-scoped / infra / estático), pero su justificación en
código ("RLS scopes the data") es **falsa en runtime** (ver §6).

**Conteo ungated: 19** (6 públicos-legítimos + 13 a revisar).

---

## 5. Excepciones firmadas (decisiones de negocio que sobreescriben la intuición)

1. **VIEWER conserva el dinero en caja/movimientos/compromisos** — 2026-07-15,
   fundador (CLAUDE.md, Próximos pasos). VIEWER lee `MovementSubject` (`:717`)
   ⇒ ve caja, compromisos, movimientos, banco, conciliación, montos incluidos.
   Herencia deliberada de la era Finanzas. **Ningún ticket la "corrige"** sin
   decisión expresa. La regla "ANALYST/VIEWER nunca ven dinero" aplica a los
   módulos post-Finanzas (RRHH/Comercial/Marketing), no a la caja.

2. **ACCOUNTANT lee toda la nómina (incl. liquidaciones y finiquitos) pero no
   escribe nada** — HR-001 + política 2026-06-30 (`:635-647`). Lee Employee,
   EmployeeCompensation (liquidaciones vía `settlements`), TerminationSimulation
   (finiquitos vía `terminations`); **cero** create/update/delete en RRHH — las
   liquidaciones y finiquitos se cargan desde un portal externo, nunca se editan
   in-app.

3. **HSEC = MANAGER/ADMIN/SUPER_ADMIN solamente** — matriz firmada 2026-07-27
   (`:294-301`, `:612-613/678/712/782`). PII adyacente a salud (lesión/parte del
   cuerpo/atención médica). La matriz abierta de Actividades **NO** es plantilla
   aquí. Ampliar = decisión futura fechada del fundador.

4. **Actividades corre la matriz de lectura INVERTIDA** — CAL-001, decisión Q4
   del fundador (`:602-608/671-674/705-709/775-776`). Los seis roles leen el
   calendario (no hay dinero en la superficie); escritura MANAGER+. Es el primer
   módulo con read para los seis.

**Las hojas de lectura (leaf read-modules) y lo que estructuralmente NO pueden
exponer** — cada una exporta una interfaz angosta propia en vez de la entidad
Prisma, así el agregador de calendario y Comercial consumen datos cruzados sin
importar el servicio sensible:

| Hoja                         | Exporta                                                | No puede exponer                                  |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `rrhh/birthday-read`         | `BirthdayEntry` (nombre + día/mes)                     | año/edad, sueldo, cualquier otro campo            |
| `rrhh/absence-read`          | `AusenciaCalendarEntry` (nombre + rango)               | categoría, folio médico, motivo, entidad de salud |
| `rrhh/employee-read`         | `EmployeeLiteEntry` (id + nombre); `resolveNamesByIds` | rut, área, estado, email                          |
| `operations/calendar-read`   | `ServicioCalendarEntry` / `VencimientoCalendarEntry`   | montos                                            |
| `comercial/cierres-read`     | `CierreCalendarEntry` (nombre + fecha esperada)        | etapa, montos                                     |
| `comercial/attribution-read` | `CampaignReturn`/`OpportunityOrigin`/`WonDeal`         | detalle de la oportunidad más allá del agregado   |

---

## 6. Discrepancias

**5 hallazgos de discrepancia** + **0 contradicciones con decisiones firmadas**
(las cuatro excepciones de §5 se sostienen en el código, verificadas celda a
celda).

**D1 — DIVERGENCIA DE LAS DOS CAPAS: `operations/calendar` (4 endpoints).**
`operations-calendar.controller.ts` lleva **solo `@UseGuards(JwtAuthGuard)`
(`:29`) — sin PoliciesGuard** y sus 4 GET no tienen `@CheckPolicies`. Son
company-scoped (`@CurrentCompany`) ⇒ un usuario autenticado puede poner
`x-company-id: <otra empresa>` y leer su calendario de operaciones. Es la misma
clase exacta que los 9 endpoints del dashboard que HARDEN-001 cerró, **todavía
abierta**. El arreglo requiere **agregar PoliciesGuard + `@CheckPolicies`** (no
existe un `OperationsCalendar` subject; gatearía en `read OperationalAsset` o un
subject nuevo). Candidato directo a HARDEN-002.

**D2 — SUBJECTS MUERTOS (3).** `TenantSubject` (`:77`), `MedicalLeaveSubject`
(`:218`), `SalaryRecordSubject` (`:221`): declarados y — para MedicalLeave/
SalaryRecord — con abilities otorgadas (MANAGER manage / ACCOUNTANT read), pero
**ningún endpoint los consume**. La ability es inalcanzable. En particular, la
lectura de sueldos del ACCOUNTANT fluye por `EmployeeCompensation` +
`TerminationSimulation` (que sí tienen endpoint), no por `SalaryRecord` — el
grant de SalaryRecord es decorativo.

**D3 — INFO-LEAK DE INFRAESTRUCTURA: `operations/health` (2 endpoints).**
`/operations/health` y `/health/crons` exponen estado de subsistemas y topología
de crons/colas a **cualquier** usuario autenticado de **cualquier** empresa, sin
gate. No son datos de tenant, pero es divulgación de infraestructura.

**D4 — DOC DESACTUALIZADO: `apps/api/src/modules/operations/SECURITY_AUDIT.md`.**
Afirma que las lecturas del dashboard "stay open" y que "RLS scopes the data" —
ambas **falsas** hoy. **No editar** (fuera de scope); enunciado corregido abajo:

| file:line                   | Afirma (obsoleto)                                            | Corrección (hoy)                                                                      |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `SECURITY_AUDIT.md:101`     | "Read endpoints stay open."                                  | HARDEN-001 gateó las 9 lecturas del dashboard en `read OperationsDashboardSubject`.   |
| `SECURITY_AUDIT.md:114`     | "intentionally open… RLS scopes the data to their company"   | Están gated (HARDEN-001); y RLS **no** scopea en runtime (rol BYPASSRLS, HARDEN-000). |
| `SECURITY_AUDIT.md:116-118` | lista las 9 lecturas del dashboard como abiertas             | Todas gated desde HARDEN-001.                                                         |
| `SECURITY_AUDIT.md:188`     | test cross-tenant "expected to return only Company B's data" | Ahora devuelve **403** (HARDEN-001).                                                  |

**D5 — "RLS ES EL RESPALDO" ES FALSO EN RUNTIME (transversal).** Cada endpoint
ungated de §4(b) lleva un comentario que justifica la ausencia de gate con "RLS
scopes the data". HARDEN-000 probó que en runtime el rol de conexión bypassa RLS
(BYPASSRLS/superuser, ENABLE-not-FORCE, `app_user` sin usar) y que las vistas
materializadas no pueden llevar RLS. Por lo tanto la justificación "RLS" que
aparece en el código de esos endpoints **no protege nada** — el único límite de
tenant es el `@CheckPolicies` que les falta. (Fix sistémico = HARDEN-002/003.)

**Gates cross-módulo (por diseño, NO bugs — se registran para trazabilidad):**
`comercial.controller.ts:108` gatea `read AvailabilitySubject` (RRHH — consumo
de disponibilidad COM-012); `tax/sii-connection.controller.ts` gatea `manage
CompanySubject` (config SII = gestión de empresa); `closing.controller.ts` gatea
`FiscalPeriodSubject` (el cierre opera sobre períodos); `auth.controller.ts:53`
gatea `read MovementSubject` (endpoint sonda de permisos). El agregador
`actividades.controller.ts` (feed unificado) **sondea inline** abilities foráneas
(Opportunity/ServiceOrder/DocumentRecord/Campaign/Employee) para decidir qué
colecciones incluir — los endpoints gatean en `CalendarActivity`; es el
"key-absence shaping" de CAL-018, comportamiento correcto.

---

## 7. Resumen por perfil (español, de cara al negocio)

_Para asignar el rol a personas reales en una empresa de servicios a la minería
como AGS. Sin jerga, sin rutas de archivo._

**SUPER_ADMIN.** Puede todo, en todos los módulos, sin excepción: ve y cambia
finanzas, operaciones, personas, comercial, marketing, calendario y HSEC, y
además administra usuarios y la configuración de la empresa (incluida la conexión
al SII). Nunca se le niega nada. _Quién lo tiene:_ el dueño del sistema / el socio
fundador o la persona de máxima confianza técnica. Idealmente una sola persona.

**ADMIN.** En la práctica, lo mismo que SUPER_ADMIN: control total de datos y
configuración, incluida la gestión de usuarios, el borrado de registros que los
demás no pueden borrar, y las aprobaciones finales (excepciones de activos,
finiquitos, etc.). _Quién lo tiene:_ el gerente general o el gerente de
administración y finanzas — quien responde por la operación completa.

**MANAGER.** El caballo de batalla operativo. Ve todo lo que hay, y **gestiona
casi todo el día a día**: crea y edita movimientos y compromisos de caja, activos,
vehículos, documentos, permisos de trabajo y su ciclo completo, procedimientos,
capacitaciones, incidentes HSEC, entregas de EPP, campañas de marketing, el CRM
comercial (cuentas, oportunidades, cotizaciones) y el calendario. Lo que **no**
puede: borrar ciertos registros aprobados, dar las aprobaciones finales reservadas
al ADMIN, ni administrar usuarios. _Quién lo tiene:_ el jefe de operaciones / jefe
de faena / prevencionista de riesgos senior — la persona que hace funcionar la
empresa todos los días.

**ACCOUNTANT (Contador).** Es el rol del dinero y la nómina, en modo **solo
lectura donde importa**. Registra y edita movimientos de caja, categorías y
contrapartes; y **ve toda la información financiera de personas** — sueldos,
liquidaciones y finiquitos — porque en Chile el contador arma la nómina y gestiona
la plata. Pero **no escribe nada de RRHH**: las liquidaciones y finiquitos se
cargan desde un portal externo. En comercial y marketing ve los montos (cuentas,
cotizaciones, presupuestos y gastos) pero no cambia nada; en HSEC **no entra**
(es información de salud). _Quién lo tiene:_ el contador o el analista contable
externo/interno.

**ANALYST.** Un rol de lectura amplia **sin dinero sensible ni personas**. Ve
finanzas, operaciones y el calendario, y puede pedir excepciones y registrar
permisos de trabajo. Pero **nunca** ve sueldos ni datos de RRHH, **nunca** ve los
montos de las órdenes de servicio ni el CRM comercial (más allá del catálogo de
servicios), **nunca** marketing y **nunca** HSEC. _Quién lo tiene:_ un analista de
operaciones o de control de gestión que necesita mirar y reportar, pero no tocar
lo sensible.

**VIEWER.** El rol de "mirar". Lee finanzas — y aquí está la excepción histórica:
**sí ve la caja, los movimientos y los compromisos con sus montos** (herencia
deliberada de la era Finanzas). Lee operaciones (activos, documentos, permisos,
procedimientos, alertas y el tablero del módulo) y el calendario de actividades.
Pero **no cambia casi nada** (a lo sumo reenvía un documento o pide una excepción),
y **no ve** personas/RRHH, ni el CRM comercial con montos, ni marketing, ni HSEC.
_Quién lo tiene:_ un supervisor de terreno, un cliente interno o un auditor que
necesita consultar el estado de la operación y las cuentas sin poder modificarlas.

---

_Documento de referencia. Cambios de código futuros deben re-verificarse contra
las dos capas (ability CASL **y** `@CheckPolicies` del endpoint). Los números de
línea corresponden al 2026-08-04 y pueden derivar._
