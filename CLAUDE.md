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

### MVP V1 (lo que va a producción primero)

Dashboard, CRUD equipos/vehículos, tipos documentales, carga,
matriz, vencimientos, alertas, bloqueos, reportes básicos.

### Roadmap V2 (después del MVP)

OCR, firma electrónica, app móvil PWA con sincronización offline,
work orders, mantenimiento preventivo, modelado bitemporal completo.

## Sprint — Equipos (en desarrollo)

### OPS-005: CRUD de Equipos

Pantalla `/operaciones/equipos` con gestión completa de activos
operacionales tipo equipo (no vehículos).

### Modelo central usado

OperationalAsset (creado en OPS-003) con:

- AssetType.category = EQUIPMENT (filtro principal)
- Atributos dinámicos en JSONB (campos específicos por tipo)
- Jerarquías padre-hijo via parentAssetId (componente → equipo → sitio)
- Foto en MinIO o fallback a DB blob
- Status con 8 estados operacionales

### Endpoints REST implementados

- GET /api/operations/assets — lista filtrable y paginada
- GET /api/operations/assets/:id — detalle con relaciones
- POST /api/operations/assets — crear
- PATCH /api/operations/assets/:id — actualizar
- DELETE /api/operations/assets/:id — soft delete con validación de hijos
- POST /api/operations/assets/:id/photo — subir foto (max 2MB)
- GET /api/operations/assets/:id/photo — descargar foto

### Validaciones de negocio

- code único por empresa
- No se puede eliminar un activo con activos hijos
- statusChangedAt se actualiza automáticamente al cambiar status
- Foto: solo jpg/png/webp, máximo 2MB

### Storage de fotos

- Path en MinIO: operations/assets/{assetId}/photo.{ext}
- Fallback a DB blob igual que SII certificate
- Thumbnail en lista de equipos viene de GET /:id/photo

### Estados de Activo (traducciones UI)

- OPERATIONAL → "Operativo" (verde)
- WITH_OBSERVATIONS → "Con observaciones" (amarillo)
- NON_OPERATIONAL → "No operativo" (rojo)
- IN_MAINTENANCE → "En mantención" (azul)
- BLOCKED_DOCUMENTAL → "Bloq. documental" (rojo)
- BLOCKED_PERMIT → "Bloq. permiso" (rojo)
- OUT_OF_SERVICE → "Fuera de servicio" (gris)
- DECOMMISSIONED → "Dado de baja" (gris)

### Componentes frontend nuevos

- apps/web/src/components/operations/AssetFormModal.tsx
- apps/web/src/components/operations/AssetStatusBadge.tsx

### Permisos CASL

- Subject: 'OperationalAsset' (ya existente desde OPS-003)
- Read: todos los roles
- Create/Update: ADMIN, MANAGER
- Delete: ADMIN solamente

### Próximos tickets del Sprint 2

- OPS-006: Ficha 360 del equipo (vista detalle completa)
- OPS-007: CRUD de tipos y subtipos en frontend
- OPS-008: Importación masiva CSV/Excel de equipos
