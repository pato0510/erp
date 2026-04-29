# Excelsia ERP — Project Context

## What is this project

Excelsia ERP is a multi-module business management platform for
Chilean companies. It started as a financial management system
and now expands into operations, HR, commercial, calendar, and HSEC.

It is a multi-tenant SaaS with strict data isolation per company,
multi-module architecture with dynamic sidebar per module, and
role-based access control (RBAC) prepared for ABAC.

## Production URLs

- Frontend: https://app.excelsia.cl
- Backend: https://api.excelsia.cl
- Modules selector: https://app.excelsia.cl/modulos
- Current main client: AGS Solutions SPA (RUT 77.004.647-5)

## Tech stack

- Monorepo: Nx (with module boundary enforcement)
- Frontend: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: NestJS + TypeScript (domain module architecture)
- Database: PostgreSQL with Row Level Security (RLS) for multi-tenancy
- ORM: Prisma with prismaSchemaFolder (schema split by module)
- Queues and jobs: Redis + BullMQ
- Storage: MinIO (S3-compatible) with DB blob fallback
- Auth: JWT in HttpOnly cookies + Passport.js in NestJS
- Authorization: RBAC + CASL (prepared for ABAC)
- Audit: PostgreSQL triggers (infallible, database level)
- Observability: Sentry + OpenTelemetry with distributed tracing
- Local infra: Docker Compose
- CI/CD: GitHub Actions → Railway auto-deploy on push to develop
- Domain: Cloudflare DNS → excelsia.cl

## Key architectural decisions

1. Modular monolith, NO microservices
2. Multi-tenancy with shared database + PostgreSQL RLS
3. JWT never in localStorage, always in HttpOnly Secure SameSite cookie
4. Audit with PL/pgSQL triggers, not only application AuditService
5. Next.js acts as BFF (Backend for Frontend)
6. All heavy business logic lives in NestJS, never in frontend
7. Prisma with schema split by module (prismaSchemaFolder)
8. Complex transactions always with explicit prisma.$transaction()
9. Multi-module architecture with dynamic sidebar per module
10. Storage with MinIO + DB blob fallback (same pattern across all modules)

## Code conventions

- Commits in English: type(scope): description
- Always work on develop branch directly
- Every protected endpoint must: validate JWT, extract tenant_id,
  verify CASL role/permission, execute logic with RLS active
- Stable useEffect pattern in frontend (primitive deps, no object state)
- All amounts use formatCLP() from lib/formatters.ts
- Decimal values from Prisma come as strings — use Number() before arithmetic

## RULES FOR CLAUDE CODE

- NEVER create git branches
- NEVER run git commands (no commit, push, checkout)
- NEVER create pull requests
- Only write and modify code files
- The user handles all git operations

═══════════════════════════════════════════════════════════════════

# MÓDULO FINANZAS (V1 COMPLETO EN PRODUCCIÓN)

═══════════════════════════════════════════════════════════════════

## Sprints completados

### Sprint 1 — Base platform ✓

ARC-001 a ARC-007: Nx monorepo, Docker, Prisma, Redis/BullMQ,
ESLint, Sentry, GitHub Actions

### Sprint 2 — Identity & multi-tenancy ✓

TEN-001, IAM-001, IAM-002, IAM-005, TEN-003, AUD-001

### Sprint 3 — Configuration and catalogs ✓

CFG-001, CAT-001, CAT-002, CAT-003

### Sprint 4 — Financial core ✓

MOV-001, CASH-001, MOV-002, DASH-001, DASH-002, DASH-003, CASH-002

### Sprint 5 — Dashboard, alerts and reports ✓

DASH-004, ALR-001, REP-001

### Sprint 6 — Banking integration ✓

BNK-001, BNK-002, BNK-003

### Sprint 7 — Tax and reconciliation ✓

TAX-001, REC-001

### Sprint 8 — Hardening ✓

CLS-001, FIX-001, SEC-001, QA-001, REL-001

## SII Integration — BaseAPI (FUNCIONAL)

Provider: BaseAPI (baseapi.cl) — GRATUITO
Conecta usando RUT + clave SII portal (sin certificado).
Variables Railway: BASEAPI_KEY, SII_RUT, SII_PASSWORD
Endpoints:

- POST /sii/rcv/{YYYY-MM}/venta — facturas emitidas
- POST /sii/rcv/{YYYY-MM}/compra — facturas recibidas
- POST /sii/contribuyente/informacion — test connection

## Auto-creación de movimientos desde SII

EMITIDO → INCOME categoría "Ingresos por Ventas"
RECIBIDO → EXPENSE categoría "Productos no categorizados"
Aplica reglas de categorización (RUT primero, keyword después)
Estado CONFIRMED, idempotente vía taxDoc.movementId

## Categorización por reglas

Tabla CategoryRule con tipos RUT | KEYWORD | DEFAULT
Pantalla /categorias/reglas con CRUD + panel de prueba
Aplicado en sync SII y disponible para uso manual

═══════════════════════════════════════════════════════════════════

# DISEÑO VISUAL

═══════════════════════════════════════════════════════════════════

## Páginas con starfield animado (canvas)

- /login — fondo negro + nebulosas + estrellas animadas
- /modulos — mismo fondo que login

## Páginas con dark gradient estático (dentro de dashboard)

Background: linear-gradient(135deg, #0F0F14 0%, #1A1A22 50%, #15151E 100%)
Sin animación, sin estrellas. Componente DarkGradientBackground.

## Sidebar gradients

- Light theme: linear-gradient(180deg, #3B5C8A 0%, #284B75 100%)
- Dark theme: linear-gradient(180deg, #0A0A12 0%, #0F1422 100%)
- Sidebar text: blanco en ambos temas
- Active item: rgba(255,255,255,0.1) bg + #60A5FA border-left

## Cards

- Dark: glassmorphism rgba(28,28,30,0.5) + backdrop-filter blur(12px)
- Light: solid white + border #e8eaed

## Fonts (next/font/google con display:swap, preload:true)

Outfit, JetBrains Mono, Space Grotesk, IBM Plex Sans, IBM Plex Mono

## FOUC prevention

- Critical CSS inline en layout.tsx
- .login-page y .modulos-page-wrapper con fade-in 0.4s
- suppressHydrationWarning en <html>

## Multi-sidebar pattern

El sidebar cambia dinámicamente según la ruta:

- /dashboard, /movimientos, /caja, etc → FinanceSidebar
- /operaciones y subrutas → OperationsSidebar
- Futuro: HsecSidebar, CommercialSidebar, etc

═══════════════════════════════════════════════════════════════════

# MÓDULO OPERACIONES (EN DESARROLLO)

═══════════════════════════════════════════════════════════════════

## Concepto central

El objeto principal es el Activo Operacional. Equipos y vehículos
son variantes de un mismo concepto que comparten lógica común.
Vehículos extienden con campos específicos (patente, VIN, kilometraje).

## Submódulos del Módulo Operaciones

1. Dashboard Operacional
2. Equipos
3. Vehículos
4. Control Documental
5. Permisos Operacionales (externos + internos de trabajo)
6. Procedimientos
7. Alertas y Vencimientos
8. Calendario Operacional
9. Reportes

## Decisiones arquitectónicas alineadas al stack

- Mantener Prisma (NO MikroORM) — RLS y migraciones consolidadas
- Reutilizar BullMQ existente para job de vencimientos diario
- Reutilizar CASL para autorización con nuevos subjects
- JSONB para campos dinámicos por subtipo de activo
- Jerarquías padre-hijo via self-referencing FK
- Versionado inmutable (supersesión) para documentos críticos
- Storage MinIO/R2 con fallback a DB blob

## Tablas principales

operational_assets, vehicles, asset_types, asset_subtypes, locations,
operational_document_types, document_requirements, document_records,
permits, permit_types, procedure_documents, procedure_acknowledgments,
alert_rules, alert_instances, exceptions

## Estados de Activo (AssetStatus)

OPERATIONAL, WITH_OBSERVATIONS, NON_OPERATIONAL, IN_MAINTENANCE,
BLOCKED_DOCUMENTAL, BLOCKED_PERMIT, OUT_OF_SERVICE, DECOMMISSIONED

## Estados de Documento (DocumentRecordStatus)

DRAFT, PENDING_REVIEW, APPROVED, REJECTED, REPLACED, ARCHIVED

- Estados derivados: VIGENTE, POR_VENCER, VENCIDO, FALTANTE

## Estructura backend

apps/api/src/modules/operations/

- assets/, fleet/, document-control/, permits/, procedures/,
  alerts/, reports/, asset-types/, locations/, document-types/,
  document-requirements/

## Estructura frontend

apps/web/src/app/(dashboard)/operaciones/

- page.tsx, equipos/, vehiculos/, documentos/, permisos/,
  procedimientos/, alertas/, calendario/, reportes/, configuracion/

## Plan de sprints del módulo

Sprint 1: Fundación — panel módulos + estructura base ✓
Sprint 2: Equipos ✓
Sprint 3: Vehículos ✓
Sprint 4: Control Documental ✓
Sprint 5: Alertas y Bloqueos automáticos
Sprint 6: Permisos y Procedimientos
Sprint 7: Calendario, Reportes e Integración Finanzas
Sprint 8: Hardening

═══════════════════════════════════════════════════════════════════

# SPRINTS COMPLETADOS DEL MÓDULO OPERACIONES

═══════════════════════════════════════════════════════════════════

## Sprint 1 — Fundación ✓

- OPS-001: Panel de selección de módulos al login
- OPS-002: Estructura del módulo /operaciones (sidebar + rutas)
- OPS-003: Schema base — operational_assets, asset_types, locations
- OPS-004: Tipos documentales y matriz de requisitos
  Resolution engine: asset > subtype > type (más específico gana)
  12 document types chilenos por defecto via seed-defaults

## Sprint 2 — Equipos ✓

- OPS-005: CRUD de Equipos con foto, jerarquía padre-hijo,
  atributos dinámicos JSONB, tags, asignación a usuarios
- OPS-006: Ficha 360 del equipo
- OPS-007: Configuración unificada (/operaciones/configuracion)
  3 tabs: Tipos+Subtipos, Ubicaciones, Tipos de Documento
- OPS-008: Importación masiva CSV/Excel de equipos
  ImportLog con entityType, max 1000 rows, 5MB

## Sprint 3 — Vehículos ✓

- OPS-009: CRUD de Vehículos (extiende OperationalAsset)
  Validación: AssetType debe ser categoría VEHICLE
  Endpoints en /api/operations/fleet/vehicles
  KilometersUpdateModal con validación no-decrecer
- OPS-010: Pack documental Chile automático
  Auto-asocia SOAP, PERMCIRC, REVTEC, PADRON al crear AssetType VEHICLE
  Endpoint: POST /asset-types/:id/apply-vehicle-defaults
- OPS-011: Ficha 360 del Vehículo
- OPS-012: Importación masiva CSV/Excel de vehículos
  Mapeo de combustibles ES→enum (Bencina, Diésel, Eléctrico, etc)

## Sprint 4 — Control Documental ✓

- OPS-013: Pantalla central /operaciones/documentos
  KPIs de compliance global, filtros, quick chips
  DocumentStatusBadge component reusable
- OPS-014: Upload de documentos con metadatos
  Storage MinIO + DB blob fallback
  Auto-cálculo de expiration basado en defaultValidityDays
  Status inicial DRAFT o PENDING_REVIEW
  Max 10MB, formatos: pdf, jpg, png, webp, doc, docx, xls, xlsx
- OPS-015: Workflow de aprobación/rechazo
  approve/reject solo ADMIN/MANAGER, uploader ≠ approver
  Reject requiere reason min 10 chars
  Resubmit solo por uploader original
  /operaciones/documentos/pendientes con cola de revisión
  Sidebar badge con count
- OPS-016: Versionado inmutable (supersesión)
  POST /documents/:id/supersede crea nueva + marca vieja REPLACED
  Conflict 409 en upload duplicado, ofrece supersesión
  DocumentHistoryModal con timeline de versiones
  REPLACED son inmutables (no edit, no delete)
  Compliance engine excluye REPLACED
- OPS-017: Carpeta documental con compliance detallado
  /operaciones/equipos/[id]/carpeta y /vehiculos/[id]/carpeta
  ComplianceGauge con porcentaje visual
  Documentos agrupados por criticidad
  Export PDF (reporte) y ZIP (informe.pdf + documentos/)
  Generación con pdfkit + archiver

═══════════════════════════════════════════════════════════════════

# TICKET ACTUAL

═══════════════════════════════════════════════════════════════════

### OPS-028: Acuses de lectura de procedimientos (✓ completado)

Sistema de acuse electrónico con firma digital y reportes de cobertura.

### Tabla creada

- procedure_acknowledgments con FK a Procedure (CASCADE) + User
- Enum AcknowledgmentStatus: PENDING/READ/ACKNOWLEDGED/EXPIRED/EXEMPTED
- @@unique([companyId, procedureId, userId])

### Endpoints OPS-028

- GET /api/operations/acknowledgments/my-pending
- GET /api/operations/acknowledgments/my-pending-count
- POST /api/operations/acknowledgments/:procedureId/acknowledge
- POST /api/operations/acknowledgments/:procedureId/exempt/:userId
- POST /api/operations/acknowledgments/:procedureId/reapply/:userId
- GET /api/operations/acknowledgments/coverage/:procedureId
- GET /api/operations/acknowledgments/user/:userId/coverage
- GET /api/operations/acknowledgments/company-coverage

### Lógica de creación automática

Cuando se publica procedimiento con requiresAcknowledgment=true:

1. Resuelve usuarios target (roles + assets/types/locations)
2. Skip si ya tiene ACKNOWLEDGED
3. Calcula dueDate = publishedAt + acknowledgmentDeadlineDays
4. Crea PENDING + notifica

Cuando se publica nueva versión:

- Re-targetea a usuarios que acusaron versión anterior
- Notificación específica

### trackView idempotente

- Primer view: PENDING → READ + firstViewedAt
- Subsequent views: solo incrementa viewCount

### Acknowledge con firma digital

SHA-256(procedureId + userId + ISO timestamp + notes)

- user IP + user agent
- Modal con declaración formal y checkbox obligatorio

### Crons

- procedure-acknowledgment-reminders: 0 9 \* \* \* (recordatorios)
- procedure-acknowledgment-expiration: 0 1 \* \* \* (expiraciones)
- Reminders escalados WARNING → CRITICAL al acercarse deadline
- Max 3 recordatorios por usuario

### UI agregada

- /operaciones/mis-lecturas con cards y due dates colored
- AcknowledgmentModal con declaración formal y firma
- /operaciones/cobertura-acuses (admin/manager) con KPIs y drill-downs
- Tabs Por procedimiento / Por usuario
- Botones Eximir / Re-aplicar (admin only)
- ProcedureAcknowledgmentSection en detail page
- Sidebar: Mis lecturas (BookMarked) con badge + Cobertura acuses (Users) condicional

### CASL nuevo subject

- ProcedureAcknowledgment con acciones acknowledge + exempt
- ACCOUNTANT/ANALYST/VIEWER pueden acknowledge propios
- MANAGER ve cobertura
- exempt es ADMIN only

═══════════════════════════════════════════════════════════════════

# PLAN ACTUALIZADO DEL MÓDULO OPERACIONES

═══════════════════════════════════════════════════════════════════

✅ Sprint 1 — Fundación (OPS-001 a OPS-004)
✅ Sprint 2 — Equipos (OPS-005 a OPS-008)
✅ Sprint 3 — Vehículos (OPS-009 a OPS-012)
✅ Sprint 4 — Control Documental (OPS-013 a OPS-017)
✅ Sprint 5 — Alertas y Bloqueos (OPS-018 a OPS-023)
✅ Sprint 6 — Permisos y Procedimientos (OPS-024 a OPS-028)

🔜 Sprint 7 — Dashboard, Calendario, Reportes e Integración Finanzas

- OPS-029: Dashboard Operacional unificado (NUEVO)
- OPS-030: Calendario operacional (era OPS-029)
- OPS-031: Reportes Excel/PDF (era OPS-030)
- OPS-032: Eventos de dominio Operaciones → Finanzas (era OPS-031)
- OPS-033: Compromisos automáticos al vencer documentos (era OPS-032)

Sprint 8 — Hardening (renumerado)

- OPS-034: Vistas materializadas para dashboard pesado
- OPS-035: QR por activo (versión simple)
- OPS-036: Auditoría completa
- OPS-037: QA, E2E, documentación

# Ticket actual

- OPS-029: Dashboard Operacional unificado
  Pantalla de aterrizaje del módulo /operaciones (hoy placeholder)
  KPIs grandes con vista de 30 segundos del estado operacional
  Tarjeta de acción inmediata si hay urgencias
  Mini-velocímetros de cumplimiento por categoría
  Timeline de próximos 30 días
  Top 5 activos en riesgo
  Donut chart de distribución por estado de activos
  Stream de actividad reciente
  Personalizado por rol del usuario
