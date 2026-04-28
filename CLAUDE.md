# Excelsia ERP — Project Context

## What is this project

Excelsia ERP is a financial management platform for Chilean companies.
It allows visualizing, controlling and anticipating the financial situation
by consolidating bank movements, tax information (SII), commitments and projections.
It is a multi-tenant system with strict data isolation per company.

## Tech stack

- Monorepo: Nx (with module boundary enforcement)
- Frontend: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: NestJS + TypeScript (domain module architecture)
- Database: PostgreSQL with Row Level Security (RLS) for multi-tenancy
- ORM: Prisma with prismaSchemaFolder (schema split by module)
- Queues and jobs: Redis + BullMQ
- Storage: MinIO (S3-compatible)
- Auth: JWT in HttpOnly cookies + Passport.js in NestJS
- Authorization: RBAC + CASL (prepared for ABAC)
- Audit: PostgreSQL triggers (infallible, database level)
- Observability: Sentry + OpenTelemetry with distributed tracing
- Local infra: Docker Compose
- CI/CD: GitHub Actions

## Key architectural decisions

1. Modular monolith, NO microservices
2. Multi-tenancy with shared database + PostgreSQL RLS
3. JWT never in localStorage, always in HttpOnly Secure SameSite=Strict cookie
4. Audit with PL/pgSQL triggers, not only application AuditService
5. Next.js acts as BFF (Backend for Frontend): presentation and orchestration
6. All heavy business logic lives in NestJS, never in frontend
7. Prisma with schema split by module (prismaSchemaFolder)
8. Complex transactions always with explicit prisma.$transaction()

## Repository structure (Nx monorepo)

excelsia-erp/
apps/
web/ # Frontend Next.js (BFF layer)
api/ # Backend NestJS
libs/
ui/ # Shared UI components (shadcn/ui base)
config/ # Shared configuration (eslint, tsconfig)
types/ # Shared TypeScript types between apps
utils/ # Shared utilities
infra/
docker/
nginx/
scripts/
docs/
.github/

## Backend structure (apps/api/src)

modules/
iam/ # Auth, sessions, users
tenancy/ # Multi-company, memberships
companies/ # Company configuration
catalogs/ # Categories, counterparties, cost centers
banking/ # Bank integration, sync, cartola import
tax/ # SII/fiscal integration
movements/ # Financial movements
reconciliation/ # Bank-document reconciliation
cashflow/ # Cash, treasury, commitments
alerts/ # Alerts and notifications
closing/ # Monthly closing
reports/ # Reports and exports
audit/ # Audit service
jobs/ # BullMQ workers
common/ # Decorators, guards, interceptors

## Code conventions

- Commits in English: type(scope): description
  Types: feat, fix, chore, refactor, test, docs
- Always work on develop branch directly
- Never create git branches or run git commands
- Every protected endpoint must: (1) validate JWT, (2) extract tenant_id,
  (3) verify CASL role/permission, (4) execute logic with RLS active

## Architecture reminders

- JWT in HttpOnly cookies ALWAYS
- RLS active on all financial tables
- Every new table needs: RLS policy + audit trigger + GRANT to app_user
- Use RlsService.executeWithRls(companyId, userId, fn) for mutations
- Stable useEffect pattern in frontend (primitive deps, no object state)
- All amounts use formatCLP() from lib/formatters.ts
- Decimal values from Prisma come as strings — use Number() before arithmetic

## IMPORTANT RULES FOR CLAUDE CODE

- NEVER create git branches
- NEVER run git commands (no git commit, no git push, no git checkout)
- NEVER create pull requests
- Only write and modify code files
- The user handles all git operations

## Completed tickets

### Sprint 1 — Base platform ✓

ARC-001 — Nx monorepo base structure ✓
ARC-002 — Docker Compose with PostgreSQL, Redis and MinIO ✓
ARC-003 — Prisma configured with prismaSchemaFolder ✓
ARC-004 — Redis and BullMQ base queue ✓
ARC-005 — ESLint, Prettier, Husky and Nx module boundaries ✓
ARC-006 — Sentry and distributed tracing ✓
ARC-007 — GitHub Actions CI pipeline ✓

### Sprint 2 — Identity, security and multi-tenancy ✓

TEN-001 — Tenant, Company, User and Membership models ✓
IAM-001 — JWT authentication with HttpOnly cookies ✓
IAM-002 — Logout, session expiration and refresh token ✓
IAM-005 — Roles and permissions with CASL ✓
TEN-003 — PostgreSQL Row Level Security (RLS) ✓
AUD-001 — PostgreSQL audit triggers ✓

### Sprint 3 — Configuration and catalogs ✓

CFG-001 — Company configuration and financial settings ✓
CAT-001 — Income and expense categories CRUD ✓
CAT-002 — Counterparties CRUD ✓
CAT-003 — Cost centers and fiscal periods ✓

### Sprint 4 — Financial core ✓

MOV-001 — Financial movements CRUD ✓
CASH-001 — Bank accounts, opening balances and commitments ✓
MOV-002 — Bulk import movements from CSV/Excel ✓
DASH-001 — Main financial dashboard with KPIs ✓
DASH-002 — Movements frontend screens ✓
DASH-003 — Fix movements infinite re-render ✓
CASH-002 — Cashflow frontend screen ✓

### Sprint 5 — Dashboard, alerts and reports ✓

DASH-004 — Enhanced dashboard with charts and period selector ✓
ALR-001 — Alerts system with rules and frontend screen ✓
REP-001 — Excel export and reports ✓

### Sprint 6 — Banking integration ✓

BNK-001 — Banking adapter with mock provider ✓
BNK-002 — Automatic sync with BullMQ and sync history ✓
BNK-003 — Manual cartola import as fallback ✓

### Sprint 7 — Tax and reconciliation (in progress)

TAX-001 — SII integration with mock provider ✓
REC-001 — Reconciliation engine with exact matching ✓

### Sprint 8 — Hardening ✓

CLS-001 — Monthly closing process ✓
FIX-001 — Dashboard error isolation ✓
SEC-001 — Security hardening and rate limiting ✓
QA-001 — Critical test suite 31/31 passing ✓
REL-001 — Production go-live checklist ✓

## Status

V1 COMPLETE — Ready for production

## SII Integration — ## SII Integration — BaseAPI (UPDATED)

Provider: BaseAPI (baseapi.cl) — GRATUITO
Previous provider: LibreDTE — DESCARTADO (costo $40.000+IVA/mes)

### How it works

BaseAPI connects to SII using RUT + SII portal password.
No certificate needed for reading documents.
Returns JSON directly (no SOAP, no XML).

### Environment variables (Railway)

BASEAPI_KEY=api_key_from_baseapi_dashboard
SII_RUT=77004647-5
SII_PASSWORD=client_sii_portal_password

### BaseAPI Endpoints used

POST https://api.baseapi.cl/api/v1/sii/rcv/ventas — facturas emitidas
POST https://api.baseapi.cl/api/v1/sii/rcv/compras — facturas recibidas
POST https://api.baseapi.cl/api/v1/sii/contribuyente/informacion — test connection
Auth: Header X-API-Key: {BASEAPI_KEY}
Period format: "YYYY-MM"

### Document types synced

- Tipo 33: Factura Electrónica (EMITIDO y RECIBIDO)
- Tipo 34: Factura No Afecta
- Tipo 39: Boleta Electrónica
- Tipo 61: Nota de Crédito
- Tipo 56: Nota de Débito
  Direction: EMITIDO (ventas) and RECIBIDO (compras)

### Architecture

- BaseApiSiiProvider implements ISiiProvider interface
- Default provider: 'baseapi' (replaces mock-sii in production)
- Mock provider kept for local development/testing
- Sync runs manually from /tributario screen
- Future: auto-sync every 24h via BullMQ

### SiiConnection model

- Still exists in DB for audit trail
- certificateData field kept but not used for BaseAPI
- Provider field: 'baseapi'
- isActive: true when BASEAPI_KEY + SII_PASSWORD are set

### Production URLs

Frontend: https://app.excelsia.cl
Backend: https://api.excelsia.clLibreDTE

## Módulo Operaciones (en desarrollo)

### Concepto central

El objeto principal es el **Activo Operacional**. Equipos y vehículos
son variantes de un mismo concepto que comparten lógica común.
Vehículos extienden con campos específicos (patente, VIN, kilometraje).

### Submódulos del Módulo Operaciones

1. Dashboard Operacional
2. Equipos
3. Vehículos
4. Control Documental
5. Permisos Operacionales (externos + internos de trabajo)
6. Procedimientos
7. Alertas y Vencimientos
8. Calendario Operacional
9. Reportes

### Decisiones arquitectónicas (alineadas al stack actual)

- Mantener Prisma (NO migrar a MikroORM) — RLS y migraciones ya consolidadas
- Reutilizar BullMQ existente para job de vencimientos diario
- Reutilizar CASL para autorización con nuevos subjects
- JSONB en PostgreSQL para campos dinámicos por subtipo de activo
- Jerarquías padre-hijo via self-referencing foreign key
- Versionado inmutable (supersesión) para documentos críticos
- Storage en MinIO/R2 con fallback a DB (mismo patrón SII)

### Tablas principales del módulo

- operational_assets (tabla central — equipos + vehículos)
- vehicles (extensión con campos de flota)
- asset_types, asset_subtypes
- locations (sitios/áreas)
- document_types (catálogo configurable)
- document_requirements (matriz: qué documentos exige cada tipo de activo)
- document_records (documentos cargados con vigencia)
- document_versions (versionado inmutable)
- permits, permit_types
- procedure_documents
- procedure_acknowledgments (acuses de lectura)
- alert_rules, alert_instances
- exceptions (excepciones temporales aprobadas)

### Estados de activo

OPERATIVO, CON_OBSERVACIONES, NO_OPERATIVO, EN_MANTENCION,
BLOQUEADO_DOCUMENTAL, BLOQUEADO_PERMISO, FUERA_SERVICIO, DADO_BAJA

### Estados de documento

BORRADOR, PENDIENTE_REVISION, APROBADO, RECHAZADO,
VIGENTE, POR_VENCER, VENCIDO, REEMPLAZADO, ARCHIVADO

### Roles del módulo

- operations_admin — config global del módulo
- operations_supervisor — gestiona equipos/vehículos/excepciones
- document_manager — sube/aprueba/rechaza documentos
- operator — solo ve documentos de sus activos asignados
- auditor — solo lectura

### Integración con Finanzas

Operaciones publica eventos de dominio que Finanzas escucha:

- DocumentRenewalImminentEvent → crea compromiso futuro automático
- AssetBlockedEvent → alerta financiera por activo no operativo
- OperationalCostEvent → registra gasto asociado a activo

### Estructura backend

apps/api/src/modules/operations/
assets/
fleet/
document-control/
permits/
procedures/
alerts/
reports/

### Estructura frontend

apps/web/src/app/(dashboard)/operaciones/
page.tsx (dashboard operacional)
equipos/
vehiculos/
documentos/
permisos/
procedimientos/
alertas/
calendario/
reportes/

### Plan de sprints

Sprint 1: Panel módulos + estructura base operaciones
Sprint 2: Equipos
Sprint 3: Vehículos
Sprint 4: Control Documental
Sprint 5: Alertas y Bloqueos
Sprint 6: Permisos y Procedimientos
Sprint 7: Calendario, Reportes e Integración Finanzas
Sprint 8: Hardening (vistas materializadas, QR, QA)

## Sprint 3 — Vehículos (en desarrollo)

### OPS-011: Ficha 360 del Vehículo (✓ completado)

Pantalla de detalle completa para vehículos en `/operaciones/vehiculos/[id]`.

### Layout

2-column responsive grid (colapsa a 1 col en mobile <1024px).
Header con patente como título principal, breadcrumb y acciones.

### Secciones implementadas

- **Foto + Info del vehículo** — patente, VIN, año, color, combustible, asignado
- **Kilometraje** — número grande con botón actualizar + placeholder histórico
- **Identificación adicional** — serie, fabricante, modelo, fechas, costo
- **Estado y operación** — badge + botón cambiar estado
- **Ubicación** — dirección + coordenadas
- **Jerarquía** — solo padre (vehículos no suelen tener hijos)
- **Tags** — chip list
- **Documentos legales requeridos** — 4 del pack chileno via resolve endpoint
- **Historial** — creación y última modificación

### Backend cambios

- fleet.service.ts: nuevo `assetDetailSelect` separado del `assetSelect`
  - findOne usa el detail selector con relaciones completas
  - findAll mantiene el selector liviano para listas
- assignedToUserId y createdBy se resuelven con prisma.user.findMany batch
  (mismo patrón que assets.service.ts)

### Componentes reutilizados

- VehicleFormModal (editar)
- StatusChangeModal (cambio de estado)
- KilometersUpdateModal (actualizar km)
- AssetStatusBadge

### Endpoints consumidos

- GET /api/operations/fleet/vehicles/:id (detalle completo)
- GET /api/operations/document-requirements/resolve/:assetId (pack chileno)
- POST /api/operations/assets/:id/photo (foto, reutilizado)
- PATCH /api/operations/fleet/vehicles/:id/kilometers (actualizar km)

### UX en lista de vehículos

- Filas clickeables → navegan al detalle
- Botones de acción (km, editar, eliminar) usan e.stopPropagation()

### OPS-012: Importación masiva CSV/Excel de vehículos (✓ completado)

Wizard de 3 pasos en `/operaciones/vehiculos`.

- Plantilla CSV con 20 columnas (asset + vehicle fields)
- Mapeo automático de combustibles en español:
  Bencina/Gasolina → GASOLINE
  Diésel/Diesel → DIESEL
  Eléctrico/Electrico → ELECTRIC
  Híbrido/Hibrido → HYBRID
  Gas/GLP → LPG
  Otro → OTHER
- Validaciones: AssetType debe ser VEHICLE, patente única, VIN ≤17,
  año en rango, km ≥ 0
- Crea OperationalAsset + Vehicle en transacción única
- Upsert para duplicados de código (skipDuplicates togglable)
- Hard error en duplicados de patente (no auto-update)
- ImportLog con entityType='VEHICLE'
- Max 1000 filas, 5MB

### Endpoints agregados OPS-012

- GET /api/operations/fleet/vehicles/import/template
- POST /api/operations/fleet/vehicles/import/preview
- POST /api/operations/fleet/vehicles/import

### Componente nuevo

- apps/web/src/components/operations/VehicleImportWizard.tsx

# Sprint 4 — Control Documental (en desarrollo)

Este sprint es el corazón operacional del módulo. Permite cargar
documentos reales (PDFs, fotos, certificados) a cada activo,
con vigencia, vencimientos, versionado inmutable y workflow de
aprobación.

### Tickets del Sprint 4

- OPS-013: Pantalla central de control documental
- OPS-014: Carga de documentos a activos con metadatos
- OPS-015: Workflow de aprobación/rechazo
- OPS-016: Versionado inmutable (supersesión)
- OPS-017: Cálculo de cumplimiento por activo y carpeta

### Modelo central — DocumentRecord

Esta tabla existe conceptualmente desde OPS-003 pero se
implementa en este sprint:

- documentTypeId (qué tipo es)
- assetId (a qué activo pertenece)
- fileName, filePath/fileData (en MinIO o DB blob fallback)
- mimeType, fileSize
- issueDate (fecha emisión)
- expirationDate (calculada o manual)
- status: BORRADOR | PENDIENTE_REVISION | APROBADO | RECHAZADO
  | VIGENTE | POR_VENCER | VENCIDO | REEMPLAZADO | ARCHIVADO
- uploadedBy, approvedBy, rejectedBy
- replacedByDocumentId (si supersesión)
- version (incremental)
- notes (notas o motivo de rechazo)

### Estados calculados (no persistidos directamente)

El sistema calcula automáticamente:

- VIGENTE = APROBADO y NO vencido
- POR_VENCER = VIGENTE y dentro de alertDaysBefore
- VENCIDO = pasó expirationDate
- Estos estados se actualizan via job BullMQ diario (en Sprint 5)

### OPS-015: Workflow de aprobación/rechazo (✓ completado)

Documentos PENDING_REVIEW pueden ser aprobados o rechazados por
ADMIN/MANAGER. Auto-aprobación bloqueada (uploader ≠ approver).

### Endpoints implementados OPS-015

- POST /api/operations/documents/:id/approve
- POST /api/operations/documents/:id/reject (body: { reason }, min 10 chars)
- POST /api/operations/documents/:id/resubmit (solo uploader original)
- GET /api/operations/documents/pending-review
- GET /api/operations/documents/pending-review/count

### Reglas de negocio

- approve/reject: solo ADMIN, MANAGER
- approver no puede ser uploader (bloqueo de auto-aprobación)
- resubmit: solo uploader original puede reenviar un REJECTED
- Reject requiere motivo (min 10 chars)
- Status transitions:
  PENDING_REVIEW → APPROVED (registra approvedBy, approvedAt)
  PENDING_REVIEW → REJECTED (registra rejectedBy, rejectedAt, statusReason)
  REJECTED → PENDING_REVIEW (resubmit por uploader)

### Pantalla nueva

- /operaciones/documentos/pendientes — cola de revisión
  Cards con preview, info de uploader, fecha, vigencia
  Botones Aprobar (verde) / Rechazar (rojo)
  Tooltip de bloqueo si current user es uploader
  Empty state cuando no hay pendientes

### Sidebar badge

OperationsSidebar muestra badge rojo en "Documentos" con count
de pendientes. Refresh cada 60s. Mismo patrón que alertas en
FinanceSidebar.

### Banner en /operaciones/documentos

Banner azul dismissible cuando hay pendientes, con link a
/operaciones/documentos/pendientes.

### Display de rechazos

Documentos REJECTED muestran motivo en preview modal y tablas.
Si current user es el uploader original, ve botón "Reenviar a revisión".

### CASL nuevas acciones

- 'approve' action en DocumentRecordSubject: ADMIN, MANAGER
- 'reject' action en DocumentRecordSubject: ADMIN, MANAGER
- 'resubmit' action en DocumentRecordSubject: any authenticated

# Ticket actual

- OPS-016: Versionado inmutable (supersesión)
  Cuando un documento APPROVED es reemplazado por una nueva versión,
  la anterior queda automáticamente como REPLACED (no editable, no eliminable).
  La cadena replacedByDocumentId mantiene el historial completo.
  La nueva versión hereda metadata configurable.
  Solo la versión más reciente (no REPLACED) cuenta para compliance.
  Pantalla de historial de versiones por (activo, tipo de documento).
