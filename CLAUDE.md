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

# MEJORAS V2 PENDIENTES

═══════════════════════════════════════════════════════════════════

Cuando se haga la pasada V2 al ERP módulo por módulo:

### Módulo Operaciones — V2

**Reportes:**

- Selectores como dropdowns con autocomplete (no UUID text)
- Links desde /documentos, /alertas, /permisos hacia /reportes
- Histórico de reportes generados con re-download

**Documentos y Procedimientos:**

- Plantillas pre-cargadas chilenas (PT en altura, en caliente)
- Editor inline que genera el PDF directamente
- Integración con Word/Google Docs
- Asistente IA para redactar borradores

**Infraestructura:**

- Vistas materializadas para dashboard pesado
- QR por activo para verificación en terreno
- App móvil PWA con sincronización offline
- OCR para captura de documentos físicos
- Firma electrónica nativa
- Modelado bitemporal completo

### OPS-035: QR por activo para verificación en terreno (✓ completado)

Cada activo recibe un código QR único que codifica una URL pública.
Al escanear se abre la "ficha pública del activo" con info de cumplimiento.

### Schema

- 4 campos nuevos en OperationalAsset: qrToken (String? @unique),
  qrGeneratedAt, qrLastScannedAt, qrScanCount (Int @default(0))
- Migration: 20260429150000_add_asset_qr_fields
- Partial unique index WHERE qrToken IS NOT NULL

### Token generation

- Crypto.randomBytes(24).toString('base64url') = 32 chars URL-safe
- Idempotente (ensureQrToken devuelve existente si ya existe)
- Regenerate (ADMIN) genera token nuevo + reset scan counter
- URL pública: https://app.excelsia.cl/p/asset/{token}

### Endpoints OPS-035

- GET /api/operations/public/asset/:qrToken (PÚBLICO, sin auth)
  Throttle: 30 req/min por IP
  Retorna PublicAssetView con info limitada
  Incrementa scanCount + actualiza lastScannedAt atómicamente
- GET /api/operations/public/asset/:qrToken/authenticated
  Mismo token pero autenticado, retorna AuthenticatedAssetView extendida
  Con downloadUrls, alertas completas, navegación a ficha 360
- POST /api/operations/assets/:id/qr (MANAGER+, ensure idempotente)
- POST /api/operations/assets/:id/qr/regenerate (ADMIN, invalida anterior)
- POST /api/operations/assets/qr/bulk-generate (ADMIN, todos sin QR)
- GET /api/operations/assets/qr/stats (counts por empresa)
- GET /api/operations/assets/:id/qr.png (auth, descarga 400x400)
- GET /api/operations/assets/:id/qr.svg (auth, descarga escalable)
- GET /api/operations/assets/:id/qr.pdf?size=5cm|10cm (auth, etiqueta)

### Generación de imágenes

- PNG: 400x400 px, B&W, error correction M, margin 2 (lib qrcode)
- SVG: viewBox 200x200, escalable, B&W
- PDF: 10cm o 5cm, layout con wordmark "EXCELSIA." dibujado con
  primitivas pdfkit, código activo, nombre, QR centrado, URL footer

### Frontend público

- Ruta /p/asset/[qrToken]/page.tsx (FUERA de (dashboard))
- Server component sin sidebar/topbar
- Mobile-first (max-w-[480px])
- Sections: Logo header, identificación, status badge grande,
  banners condicionales (bloqueado/excepción), ComplianceGauge,
  stats vigentes/por vencer/vencidos/faltantes, lista docs con
  DocumentStatusBadge + días restantes, alertas activas pill,
  CTA "Iniciar sesión", footer Excelsia + scan stats
- NotFoundScreen branded para tokens inválidos/revocados

### Frontend autenticado

- AssetQrSection en columna derecha de ficha 360 (equipos + vehículos)
- Generate / Preview SVG / Download PNG/SVG/PDF / Regenerate (admin)
- Confirmation modal en regenerate con warning de invalidación
- BulkQrSection en /configuracion → tab Avanzado (admin)
- 3 KPI tiles: Total / Con QR / Sin QR
- Botón "Generar QR para activos sin código" con confirm()

### CASL

- Asset.update: ensureQrToken (MANAGER+)
- Asset.manage: regenerate, bulk-generate (ADMIN)
- Asset.read: download endpoints (todos los roles autenticados)

### V2 — Mejoras pendientes operations (acumulado)

- Eventos granulares para refresh selectivo de MVs (de OPS-034)
- Ampliar mv_compliance_by_category con desgloses (de OPS-034)
- Página pública /p/asset upgrade a vista autenticada cuando hay sesión
  (hoy siempre muestra vista limitada incluso para usuarios logueados)
- Foto del activo en vista pública (requiere endpoint de fotos público
  con signed URLs y rate limiting propio)
- Logo Excelsia profesional en PDF (hoy se dibuja un wordmark simple
  con primitivas pdfkit)

### OPS-037: Cierre del Módulo Operaciones (✓ completado)

- ESLint cleanup: 16 warnings de Sprint 8 eliminados (40 restantes
  pre-existentes anotados en KNOWN_ISSUES)
- Refactor Map<string, ReportDef> en audit-package.service eliminando
  7 non-null assertions
- Health endpoint /api/operations/health con 5 checks paralelos
- Endpoint /api/operations/health/crons lista 9+ repeatables
- 6 documentos creados en apps/api/src/modules/operations/:
  README.md, MODULE_OVERVIEW.md (16 submódulos), API_REFERENCE.md
  (~130 endpoints), SECURITY_AUDIT.md (auditoría completa con test
  multi-tenant), KNOWN_ISSUES.md (V2 backlog consolidado),
  MIGRATION_HISTORY.md (20 migraciones)

═════════════════════════════════════════════════════════════════════

# 🏁 MÓDULO OPERACIONES — V1 COMPLETO (37/37 tickets, 8 sprints)

═════════════════════════════════════════════════════════════════════

Status: V1 ready for production
Última actualización: 2026-04-29 (OPS-037)

═════════════════════════════════════════════════════════════════════

# 🏁 MÓDULO RRHH — V1 EN PRODUCCIÓN (live desde 2026-07-01)

═════════════════════════════════════════════════════════════════════

Status: V1 completo (HR-001…HR-016), QA de permisos aprobado, desplegado.
RRHH ya NO es "Próximamente": aparece como módulo live y navegable en el
selector (/modulos → /rrhh). Antes solo era accesible por link directo.
El switch vive en apps/web/src/app/modulos/page.tsx (ModuleDef.active=true).

Autorización (RBAC/CASL) — puntos clave:

- ACCOUNTANT (contador): visibilidad financiera de SOLO-LECTURA completa
  (sueldos por persona, liquidaciones, finiquitos y agregados). Sin
  create/update/delete sobre ningún subject RRHH — liquidaciones y finiquitos
  se cargan desde un portal externo, nunca se editan in-app.
- VIEWER y ANALYST: bloqueados de todo dato financiero-sensible.
  MANAGER/ADMIN/SUPER_ADMIN: acceso total.
- Disponibilidad (HR-015/HR-016): solo MANAGER/ADMIN/SUPER_ADMIN
  (AvailabilitySubject); expone nombres + motivo de no-disponibilidad
  (PII de salud). No afectada por el grant read Employee del ACCOUNTANT.
- Dashboard /overview: payload modelado por la ability CASL del caller
  (filas por-persona de documentos y bloque de renovaciones de contrato
  gateados; ACCOUNTANT recibe worker-domain + conteos agregados).

QA doc: docs/EXCELSIA-RRHH-QA-PRE-DESBLOQUEO.md
Última actualización: 2026-07-01

═══════════════════════════════════════════════════════════════════

# 🏁 MÓDULO COMERCIAL — V1 EN PRODUCCIÓN (live desde 2026-07-09)

═══════════════════════════════════════════════════════════════════

Status: V1 completo (COM-001…COM-015), desplegado y visible en /modulos.
Schema: apps/api/prisma/schema/comercial.prisma
Backend: apps/api/src/modules/comercial/ · Frontend: /comercial/...

Tablas: service_catalog, accounts, contacts, opportunities,
opportunity_services, activities, quotes, quote_lines
(+ service_orders en Operaciones, target del handoff COM-013a).

Puntos clave:

- service_catalog: catálogo compartido — Comercial escribe (MANAGER+),
  todos los roles leen.
- accounts: lifecycle PROSPECTO/ACTIVA/INACTIVA; NO hay tabla de leads
  (deliberado). Link opcional y desacoplado a counterparties (SET NULL).
  sourceCampaignId: hook UUID sin FK, reservado para Marketing.
  paymentTermDays (30/60/90) alimenta el Commitment proyectado de COM-014.
- opportunities: stage machine — 5 etapas activas con movimiento libre,
  EN_PAUSA con previousStage, GANADA/PERDIDA semi-terminales (reopen
  explícito). PERDIDA exige razón categorizada (detalle obligatorio en
  OTRO). Endpoint canónico PATCH /:id/stage. COM-009: cada transición
  escribe una Activity system-generated en la MISMA transacción
  executeWithRls.
- quotes: frozen copy del bundle; inmutable desde ENVIADA; UNA ACEPTADA
  por oportunidad (partial unique index a nivel DB); snapshot de IVA
  persistido (taxRate; constante CHILE_IVA_RATE en el service — no hay
  parametrización central chilena todavía).
- Cross-módulo REAL: evento comercial.opportunity-won (aggregateId =
  UUID de la oportunidad — NUNCA string compuesto) con DOS listeners
  independientes: Operaciones crea ServiceOrder (createFromHandoff
  idempotente por sourceOpportunityId) y Finanzas crea Commitment INCOME
  (dedupe sourceType/sourceId, toggle enableAutoCommitments, skip
  elegante sin período fiscal). COM-012: disponibilidad RRHH vía
  DisponibilidadService exportado (solo método reason-free; la PII de
  salud nunca cruza de módulo).
- CASL: piso default-deny por subject (patrón COM-001). MANAGER/ADMIN/
  SUPER_ADMIN full; ACCOUNTANT read-only total; ANALYST/VIEWER sin
  acceso (nunca ven montos).

Última actualización: 2026-07-09

# Próximos pasos

- Actualización del manual de Operaciones (incorporar OPS-035 QR,
  OPS-036 Auditoría, OPS-034 nota de performance)
- Creación del manual de Finanzas (V1 ya en producción)
- Creación del manual de RRHH (V1 ya en producción)
- Creación del manual de Comercial (V1 ya en producción)
- Módulo Marketing en desarrollo (recon MKT-000 en docs/MARKETING-RECON.md)
