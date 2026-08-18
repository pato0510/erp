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

═══════════════════════════════════════════════════════════════════

# 🏁 MÓDULO MARKETING — V1 EN PRODUCCIÓN (live desde 2026-07-15)

═══════════════════════════════════════════════════════════════════

Status: V1 completo (MKT-001…MKT-010 + MKT-007b), card viva en /modulos.
Schema: apps/api/prisma/schema/marketing.prisma
Backend: apps/api/src/modules/marketing/ · Frontend: /marketing/...

Tablas: campaigns, marketing_expenses, presence_snapshots
(+ FK real accounts.sourceCampaignId → campaigns, ON DELETE SET NULL +
índice, cerrando el hook UUID sin FK de COM-003).

Puntos clave:

- campaigns: máquina de estados — libre entre BORRADOR/ACTIVA/PAUSADA;
  FINALIZADA/CANCELADA semi-terminales con reopen explícito (→ ACTIVA);
  activar exige startDate. Endpoint canónico PATCH /:id/status. DELETE
  solo para BORRADOR prístino, con guard de TRES partes (estado + cero
  gastos + cero cuentas atribuidas; el mensaje 409 nombra el bloqueador).
  spent/overBudget/endingSoon derivados EN VIVO al leer — cero rollups,
  cero cron (badges de UI: "Sobre presupuesto", "Termina en 7 días").
- marketing_expenses: ledger informativo, montos NETOS sin IVA (para
  comparar ROI contra el netAmount de la cotización); JAMÁS escribe en
  Finanzas (sin Movement/Commitment/evento) → cero doble conteo con SII.
  Hijo de campaign, ON DELETE CASCADE.
- presence_snapshots: fila ancha (una por empresa/mes), unique(companyId,
  period) a nivel DB; period normalizado a día 01 UTC en el service
  (HR-004b, sin shift de zona horaria); upsert full-replace (el form de
  MKT-009 pre-carga el mes existente para no borrar métricas por accidente).
- Atribución/ROI: selector "Campaña de origen" en la ficha de cuenta
  (Comercial consume CampaignLookupService — nunca lee campaigns directo);
  el service rechaza campañas cross-company (el FK no valida tenant).
  Retorno EN VIVO = oportunidades EN GANADA al momento de la consulta ×
  netAmount de su cotización ACEPTADA (un negocio reabierto sale del ROI
  hasta re-ganarse; GANADA sin ACEPTADA cuenta y aporta 0).
- Cross-módulo (expose/consume, SIN domain events en Marketing V1):
  Marketing expone CampaignLookupService; Comercial expone
  AccountAttributionReadService (count / return / origin / wonDeals) desde
  AttributionReadModule, que NO importa NADA — la hoja que mantiene el
  grafo ACÍCLICO (Accounts → Campaigns → AttributionRead; Ops/Finanzas
  importan AttributionRead + Campaigns) sin forwardRef. Tarjeta "Origen
  del negocio" en el detalle de ServiceOrder (Operaciones) y Commitment
  (Finanzas), resuelta EN VIVO (nada denormalizado), con regla condicional
  (sin oportunidad de origen → sin tarjeta; cuenta sin campaña → sin fila
  Campaña) y ability-shaping (origin solo si lee Opportunity; campaña solo
  si lee Campaign).
- CASL (matriz MKT-001; SIN cambios de fábrica en el cierre):
  MANAGER/ADMIN/SUPER_ADMIN full; ACCOUNTANT read en Campaign y
  MarketingExpense (son dinero), pero CIEGO en PresenceSnapshot (la celda
  rara — presencia no lleva dinero); ANALYST/VIEWER sin acceso.
- Known issue (solo desarrollo): warning de Next.js/Turbopack "negative
  time stamp" en páginas de redirect (vercel/next.js #86060, fix en PR
  #88688) — cosmético, no afecta producción; se resuelve con el bump de
  dependencias post-módulo.

Última actualización: 2026-07-15

═══════════════════════════════════════════════════════════════════

# 🏁 MÓDULO CALENDARIO DE ACTIVIDADES — V1 EN PRODUCCIÓN (live desde 2026-07-21)

═══════════════════════════════════════════════════════════════════

Status: V1 completo (CAL-000…CAL-007), card viva en /modulos, ruta /actividades.
Schema: apps/api/prisma/schema/actividades.prisma
Backend: apps/api/src/modules/actividades/ + apps/api/src/modules/rrhh/
birthday-read/ (la hoja de cumpleaños) · Frontend: /actividades/...

Tablas: activity_areas, calendar_activities.

Puntos clave:

- activity_areas: catálogo configurable de carriles (nombre + color +
  active), unique(companyId, name); DELETE solo si está prístino (cero
  actividades), con FK Restrict de respaldo a nivel DB. Cuando ya tiene
  actividades se inactiva (active=false), no se borra.
- calendar_activities: título, área (FK Restrict), fecha de inicio, fecha de
  término opcional (rango), hora opcional, responsable opcional (assigneeId,
  sin picker de usuarios en V1), estado y notas. createdBy del JWT.
- DOCTRINA DE COEXISTENCIA: ActivityArea (carril de planificación,
  configurable por MANAGER+) y AreaRRHH (8 valores fijos, pertenencia
  organizacional del empleado) son conceptos DISTINTOS y deliberadamente
  separados. Ningún ticket futuro los unifica sin decisión expresa del
  fundador (misma clase de trampa que VIEWER↔caja).
- HORA DE PARED: startTime es un string "HH:mm", JAMÁS un timestamp; toca un
  Date SOLO en la construcción local numérica del adapter del frontend
  (new Date(y, mIdx, d, HH, mm)) — nunca por parseo de "YYYY-MM-DDTHH:mm" ni
  vía UTC. Válida únicamente en actividades de un día (el backend rechaza la
  hora en un rango con un 400 verbatim; el form no la pre-bloquea, la
  regla la impone el servidor).
- Máquina de estados (PATCH /:id/status): PENDIENTE↔HECHA,
  PENDIENTE↔CANCELADA, CANCELADA→PENDIENTE; HECHA↔CANCELADA y mismo-estado
  rechazados (convención COM-005). EDICIÓN permitida en CUALQUIER estado
  (contraste deliberado con campañas — es herramienta de planificación, no
  registro contable). DELETE siempre permitido para writers, en cualquier
  estado (decisión b).
- Feed: GET /actividades/calendar?month=YYYY-MM → { activities, birthdays }.
  activities excluye CANCELADA (llega por la lista con ?status=CANCELADA —
  sección "Canceladas" del calendario); clamp de mes en UTC; la semana que
  cruza dos meses se resuelve en el cliente con doble fetch + dedupe por id.
- CASL — LA MATRIZ INVERTIDA: primer módulo del ERP con read para los SEIS
  roles (no hay dinero en la superficie; decisión Q4 del fundador); write
  MANAGER/ADMIN/SUPER_ADMIN. VIEWER por grant aditivo (idioma COM-002);
  ANALYST con su primer re-grant post-floor. PoliciesGuard falla ABIERTO →
  todo endpoint lleva @CheckPolicies.
- CUMPLEAÑOS — EXPOSICIÓN FIRMADA (decisión d, 2026-07-15): nombre + día/mes
  de empleados ACTIVOS visible a TODOS los roles vía calendario; JAMÁS el
  año, la edad ni ningún otro campo. Línea estructural, no filtro
  (BirthdayEntry no puede cargar lo que no debe). Derivado en vivo desde
  Employee.birthDate por RrhhBirthdayReadModule — hoja que NO importa nada
  (patrón AttributionRead); grafo acíclico Actividades → RrhhBirthdayRead sin
  forwardRef. birthDate null se salta; employeeId es solo key de render,
  jamás se enlaza. Modal de cumpleaños de SOLO LECTURA, sin acciones para
  ningún rol.
- Vistas compartidas: MonthView/WeekView/DayView genéricas en
  components/calendar/ (extracciones MKT-004/CAL-004, con regresión de
  Operaciones verificada). getChipIcon opcional agregado en CAL-006 (ícono
  torta para cumpleaños) — no-op para Operaciones.

## Vista Gestión (CAL-008…CAL-010)

- Estado EN_EJECUCION (CAL-008): máquina de TRES vías libre PENDIENTE ↔
  EN_EJECUCION ↔ HECHA (los seis edges dirigidos, incluido el atajo
  PENDIENTE→HECHA); CANCELADA desde PENDIENTE/EN_EJECUCION, y CANCELADA →
  PENDIENTE. El chip de calendario pinta EN_EJECUCION como PENDIENTE; la
  distinción vive en la tabla Gestión.
- dueDate = endDate ?? startDate (un rango vence cuando termina). overdue
  DERIVADO — nunca almacenado, nunca cron: dueDate < "hoy" AND estado
  abierto (PENDIENTE/EN_EJECUCION), con "<" ESTRICTO (vence hoy NO es
  atrasado). "hoy" = FECHA CALENDARIO CHILENA (America/Santiago, doctrina
  CAL-008b — jamás la fecha UTC, que se dispara en la tarde chilena;
  precedente CHILE_IVA_RATE; tz por empresa = semilla V2). La UI pinta el
  flag del servidor, JAMÁS lo recomputa.
- Members — EXPOSICIÓN FIRMADA (2026-07-21): GET /actividades/members →
  { userId, displayName } ESTRUCTURAL (jamás email/rol/estado), gate read
  CalendarActivity (los seis roles — todo lector de la tabla resuelve
  nombres). Lee Membership/User (infra común, no frontera de módulo de
  negocio). displayName = "firstName lastName", fallback al local-part del
  email.
- Bitácora — EDICIÓN LIBRE (revertido por el fundador 2026-07-22:
  edición/borrado libre por writers; auditoría conserva el contenido previo).
  CAL-009 la lanzó INMUTABLE (sin updatedAt, sin rutas de edición/borrado);
  CAL-012 la revierte: cualquier writer edita o borra CUALQUIER entrada,
  siempre. tabla calendar_activity_notes con updatedAt nullable (null = jamás
  editada → marca "editada" veraz; NO @updatedAt, se setea explícito solo al
  editar), CASCADE con la actividad. authorId del JWT en el append (jamás del
  DTO); GET notes gate read, POST/PATCH/DELETE notes gate update. Orden y
  "latest" por createdAt (editar una entrada vieja NO la reordena ni promueve).
  El trigger de auditoría es la CAPA FORENSE (cada UPDATE/DELETE conserva el
  texto previo en audit_logs). Lista/detalle enriquecidos con latestNote +
  notesCount sin N+1.
- Vista Gestión (/actividades/gestion, CAL-010): tabla Tarea · Área ·
  Responsable · Fecha cierre · Estado (dropdown INLINE con SOLO los targets
  legales de la máquina, gateado canWrite; no-writers ven badge estático) ·
  Atrasado (badge derivado) · última observación (truncada + contador).
  Chips Atrasadas / Esta semana (semana chilena lun–dom que contiene hoy) +
  selects área/responsable/estado, TODOS client-side sobre el set traído (el
  from/to del server filtra startDate, no el cierre — no se dobla; volúmenes
  chicos). Default: abiertas, atrasadas primero, cierre asc. Responsable
  ÚNICO este incremento (multi-asignado M2M = semilla V2).
- Edición inline estilo planilla (CAL-011, frontend puro — los endpoints
  POST/PATCH/PATCH status/DELETE YA son la API de la grilla): grilla
  BLOQUEADA por defecto, botón "Editar" (solo writers) despierta editores por
  celda con AUTOSAVE por fila al salir el foco (solo los campos cambiados);
  fila nueva persistente al pie (mínimo título+área+fecha → POST, status
  PENDIENTE forzado server-side); tacho por fila; ORDEN CONGELADO en edición
  (snapshot al entrar, las filas no saltan ni desaparecen al guardar; "Listo"
  reanuda orden/filtros); Estado SIEMPRE vivo (acción, no dato). Regla de
  escritura del cierre: como cierre = endDate ?? startDate, editarlo escribe
  endDate si la actividad TIENE endDate (un rango mueve su fin), si no
  startDate; la grilla nunca crea/quita rango ni toca la hora (eso vive en el
  modal). Errores del backend verbatim por fila.
- CAL-011b (frontend): fila de escritura SIEMPRE lista (view mode incluido,
  sin candado y sin botón "Nueva actividad" en Gestión — crear ES escribir; el
  Calendario conserva su botón). Observaciones append-in-place: la celda es
  editable en vivo para writers (como Estado), click → input VACÍO → Enter/blur
  con texto → POST a la bitácora; cada texto es una ENTRADA NUEVA (la celda solo
  AGREGA — la edición/borrado de entradas vive en el modal, revertido por el
  fundador 2026-07-22: edición/borrado libre por writers; auditoría conserva el
  contenido previo); Escape cancela, vacío no hace nada, 4xx verbatim inline.

## Feed unificado del calendario (CAL-013R, CAL-014…CAL-018)

El calendario maestro (GET /actividades/calendar?month=YYYY-MM) creció de
`{ activities, birthdays }` a UN SOBRE de N colecciones, construido serialmente.
Doc fuente: docs/EXCELSIA-CALENDARIO-FEEDS-PLAN.md.

- EL SOBRE: `{ activities, birthdays, servicios, vencimientos, campanas,
ausencias, cierres* }` — \*`cierres` es la ÚNICA colección con llave GATED
  (presente solo para lectores de Opportunity). Cada colección tiene clamp de
  mes en UTC independiente.

- LA MATRIZ FIRMADA (§2, validada por el fundador — 2026-07-23) — VERBATIM:

  | Colección              | Visible para                                               | Payload (nunca más)                                                                            |
  | ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
  | activities + birthdays | los 6 roles (sin cambio)                                   | como hoy                                                                                       |
  | servicios              | los 6                                                      | service label + rango — NUNCA montos                                                           |
  | vencimientos (docs)    | los 6                                                      | document label + fecha                                                                         |
  | campañas               | los 6                                                      | name + status + rango (la proyección nació sin dinero)                                         |
  | cierres esperados      | solo lectores de Opportunity (MANAGER/ADMIN/SA/ACCOUNTANT) | opportunity name + fecha esperada                                                              |
  | ausencias              | los 6                                                      | employee name + rango + "No disponible" genérico — NUNCA category/motivo/folio (línea COM-012) |

- INVENTARIO DE HOJAS (leaf modules — cada una IMPORTA NADA, contrato
  angosto): RrhhBirthdayRead · RrhhAbsenceRead · OpsCalendarRead ·
  ComercialCierresRead + el REUSO de CampaignLookupService (Marketing, ya
  exportado). Grafo ACÍCLICO por construcción: ActividadesModule →
  { las 4 hojas } + CampaignsModule (cuyo único borde es → AttributionRead,
  otra hoja) — SIN forwardRef. El maestro NUNCA importa el type-union gordo de
  un vecino (recon Q3: contrato angosto sobre export delgado).

- DISCIPLINA DE IDENTIDAD-DE-DERIVACIÓN: cada set foráneo REPLICA la derivación
  de su dueño byte-por-byte, citada de la fuente —
  vencimientos ≡ OperationsCalendarService.fetchDocumentExpirations
  (operations-calendar.service.ts:211-282, el WHERE isActive+APPROVED+
  no-reemplazado+expiración-en-rango);
  campanas ≡ CampaignsService.calendar (campaigns.service.ts:146-175, excluye
  CANCELADA + sin startDate, rango intersecta);
  ausencias ≡ DisponibilidadService.loadCoveringMaps
  (disponibilidad.service.ts:79-124: Absence status APROBADO + blocksAvailability
  true; VacationRequest status IN (APROBADO,TOMADO); solo empleados ACTIVO).
  El único ajuste permitido es punto→intervalo en el predicado de fecha (el
  dueño evalúa una fecha; la hoja, un rango). Cuando la expectativa del ticket
  difiere del dueño, MANDA EL DUEÑO (CAL-018: la ausencia exige también
  status=APROBADO, no solo blocksAvailability — se siguió Disponibilidad).

- KEY-ABSENCE SHAPING: una colección gated se OMITE como LLAVE del sobre para
  quien no la puede ver — JAMÁS un array vacío (precedente `cierres`: MANAGER/
  ACCOUNTANT llevan la llave, ANALYST/VIEWER no la tienen). Un lector legítimo
  con cero filas sí recibe `[]` (la llave presente). Los `link` de cada entrada
  son ability-shaped (null = sin puerta; "el chip no es una puerta"). CERO
  strings de rol en toda la superficie — puro `ability.can('read', Subject)`.

- LEY DE COEXISTENCIA DE VOCABULARIO: ServiceOrderStatus (RECIBIDA·EN_EJECUCION·
  COMPLETADA·CANCELADA) y ActivityStatus (PENDIENTE·EN_EJECUCION·HECHA·CANCELADA)
  se solapan en palabras pero son MÁQUINAS DISTINTAS para cosas distintas. Nunca
  unificar, nunca mapear, nunca "arreglar".

- KIND (filas propias) vs COLECCIONES (foráneas) — mecanismos INDEPENDIENTES:
  el control segmentado Actividades/Servicios gobierna el `kind` de las filas
  PROPIAS del módulo (calendar_activities); los toggles de leyenda gobiernan las
  colecciones foráneas. Un SERVICIO manual (una calendar_activity) y un servicio
  de Operaciones son cosas DIFERENTES con estilos DIFERENTES.

- LA DEUDA DEL LEDGER, SALDADA: Dashboard de Gestión (CAL-013, viajó dentro de
  a567db4 durante un commit de docs): tarjetas Pendientes · En ejecución ·
  Atrasadas · Hechas de la semana + Por responsable, derivadas del set
  kind-scoped, clickeables como filtros. El registro deja de mentir por omisión.

Última actualización: 2026-07-27 (CAL-018 — arco del feed unificado cerrado)

═══════════════════════════════════════════════════════════════════

# 🏁 MÓDULO HSEC — V1 COMPLETO (HSEC-000..011, live 2026-08-03)

═══════════════════════════════════════════════════════════════════

Status: V1 completo, card viva en /modulos, ruta /hsec. Las TRES planillas
vivas de AGS migraron al módulo: registro de incidentes (con afectados,
adjuntos y notificación GRAVE/FATAL), capacitaciones/charlas/inducciones
(con asistentes y planilla firmada) y entregas de EPP (catálogo chileno +
líneas + acuse), más un dashboard mensual 100% derivado.
Ledger: HSEC-000 recon · 001 shell+CASL · 002 incidentes core · 003 leaf
roster+afectados · 004 adjuntos+notificación · 005 FE incidentes · 006
capacitaciones BE · 007 FE · 008 EPP BE · 009 FE · 010 dashboard · 011 cierre.
Schema: apps/api/prisma/schema/hsec.prisma
Backend: apps/api/src/modules/hsec/ · Frontend: /hsec/...

Tablas (7) y sus migraciones (73–76): hsec_incidents (73:
20260727150000_add_hsec_incidents) · hsec_incident_persons (74:
20260727180000_add_hsec_incident_persons) · hsec_trainings +
hsec_training_attendees (75: 20260728120000_add_hsec_trainings) ·
hsec_epp_items + hsec_epp_deliveries + hsec_epp_delivery_lines (76:
20260728150000_add_hsec_epp). Cada una con RLS + audit trigger + GRANT en su
migración hand-authored (template calendar_activity_notes).

- MATRIZ CASL FIRMADA POR EL FUNDADOR (2026-07-27, PART1 decisión 3) —
  VERBATIM: el módulo ENTERO es MANAGER/ADMIN/SUPER_ADMIN. Cinco subjects
  (HsecIncident · HsecIncidentPerson · HsecTraining · HsecEppDelivery ·
  HsecEppItem): MANAGER CRUD completo y uniforme; ADMIN/SUPER_ADMIN vía
  `manage all` (jamás reciben cannot()); ACCOUNTANT/ANALYST/VIEWER: NADA en
  V1 — piso default-deny (patrón COM-001) sin re-grants. No hay dinero en
  HSEC, pero sí PII adyacente a salud (lesión/parte del cuerpo/atención
  médica): la matriz abierta de Actividades NO es plantilla acá. Ampliar es
  decisión futura fechada del fundador; es aditivo por construcción.
  Asistentes y líneas NO tienen subject propio (cambiar la composición ES
  update del padre — la matriz tiene exactamente cinco).
- EXPOSICIÓN FIRMADA — RRHH roster-lite → HSEC (2026-07-27, PART1 decisión
  4): RrhhEmployeeReadModule (hoja que NO importa nada) expone EXACTAMENTE
  dos métodos con contrato ESTRUCTURAL de dos llaves { employeeId, fullName }
  — listActiveLite (pickers; solo ACTIVO) y resolveNamesByIds (display;
  CUALQUIER estado — un afectado DESVINCULADO conserva su nombre en la
  historia; ids ajenos caen en silencio). Jamás rut/area/status/email — no
  hay slot donde filtrarlos. Ampliar el contrato exige NUEVA firma fechada
  en el header del service y acá.
- Decisiones registradas (fechadas 2026-07-27, PART1): afectados = empleados
  PROPIOS en V1 (externos = semilla). EDICIÓN Y BORRADO LIBRES en cualquier
  estado (decisión 6, doctrina bitácora CAL-012) — el audit trigger es la
  capa forense; caveat aceptado: borrar el último incidente del año libera
  su número (INC-{YYYY}-{0000}, next = max+1; UUID + audit desambiguan; sin
  tabla contador). Notificación GRAVE/FATAL a usuarios ADMIN por el PATH
  FINO (createGeneric directo, precedente RRHH — sin cron, sin motor ops)
  con SEMÁNTICA DE CLASE: entra a {GRAVE,FATAL} desde fuera → notifica;
  GRAVE→GRAVE y GRAVE→FATAL (dentro de la clase) NO re-notifican.
  sourceWorkPermitId = puntero blando SIN FK y SIN join en V1 (decisión 8:
  WorkPermit.incidentsReported y este registro COEXISTEN sin join; picker =
  semilla). Numeración con AÑO CHILENO (todayInSantiago, doctrina CAL-008b),
  secuencia por empresa Y por año, computada dentro de la transacción del
  create (precedente orderNumber).
- DOCTRINA DE COEXISTENCIA (decisión 9, la clase ActivityArea↔AreaRRHH): un
  EVENTO de capacitación HSEC (fecha + tema + relator + asistentes) ≠ un
  acuse documental RRHH ('ODI', 'Inducción de seguridad', 'Certificado de
  capacitación' — EmployeeDocumentType) ≠ una credencial con vencimiento
  ('Inducción de seguridad', 'Uso de EPP' — CertificationType). Tres
  superficies, tres naturalezas — NINGÚN ticket futuro las unifica o mapea
  sin decisión expresa del fundador. Igual con la entrega física de EPP
  (hsec_epp_deliveries) vs la etiqueta 'Entrega de EPP' documental.
- DIAT interno-solamente (decisión 10): incidente + afectado cubren el core
  DIAT (afectado, fecha/hora — occurredTime "HH:mm" string, doctrina CAL —,
  lugar, descripción, lesión/parte del cuerpo); export DIAT/DIEP e
  integración con la mutual = semillas V2.
- Archivos: adjuntos de incidente = convención WorkPermit (Json max 5,
  MinIO-or-blob base64, direccionados por id); planilla de capacitación y
  acuse de entrega = slot ÚNICO con columnas Procedure-shaped nullable y
  REEMPLAZO al re-subir (storeFile copy-adapt de employee-documents, citado
  por archivo; lecturas prefieren el blob). Las respuestas de escritura van
  SHAPED (fileData jamás viaja; hasFile derivado — regla HSEC-011).
- Dashboard /hsec: conteos del MES CHILENO derivados EN VIVO al leer
  (groupBy + counts; cero rollups, cero cron — precedente CAL-013), tarjetas
  clickeables que aterrizan en las listas pre-filtradas vía searchParams
  (inicialización validada de estado existente, idioma operaciones/alertas).
- INVENTARIO DE HOJAS actualizado: RrhhEmployeeRead se suma — ahora SEIS
  hojas import-nothing (RrhhBirthdayRead · RrhhAbsenceRead · OpsCalendarRead ·
  ComercialCierresRead · AttributionRead · RrhhEmployeeRead). Grafo acíclico:
  Hsec → hoja → nada; sin forwardRef.
- Semillas V2 (HSEC): inspecciones + hallazgos/acciones como entidades ·
  indicadores IF/IG/tasas (derivados, jamás almacenados) · comunidades ·
  afectados externos · export DIAT/DIEP + integración mutual · acuse digital
  de asistencia · "EPP vigente" por trabajador + vidas útiles + stock ·
  picker/join sourceWorkPermitId · vínculo incidente↔activo · colecciones
  HSEC en el calendario maestro (requiere NUEVA matriz de exposición firmada)
  · comité paritario · faena (backlog global) · ampliaciones de lectura CASL
  · extracción módulo-local de storeFile y date-utils (opcionales).

Última actualización: 2026-08-03 (HSEC-011 — cierre del módulo)

═══════════════════════════════════════════════════════════════════

# 🔒 ARCO DE HARDENING — AISLAMIENTO DE TENANT (ABIERTO)

═══════════════════════════════════════════════════════════════════

Status: arco **ABIERTO**. Nace de una pregunta con fecha: producción tiene UNA
sola empresa, así que nada de esto es explotable hoy — la pregunta es qué debe
ser verdad ANTES de dar de alta al segundo cliente.
Ledger: HARDEN-000 (recon read-only, 17269d6) · DOC-PERMS-001 (matriz de
permisos de plataforma, a707e8f) · HARDEN-001 (gateó los 9 endpoints abiertos
del dashboard de Operaciones, 18d7473) · HARDEN-002 (gateó los 4 del calendario
de Operaciones y REGISTRÓ el PoliciesGuard que faltaba, 66e7758) ·
DOC-HARDEN-001 (correcciones de documentación, 24c2796) · **HARDEN-003**
(recon read-only del switch de rol de base de datos → docs/HARDEN-003-ROLE-SWITCH-RECON.md,
fd40530) · DOC-HARDEN-002 (verificación en producción + decisiones firmadas,
c9dfeeb) · **HARDEN-004A** (las escrituras del sync SII dentro de executeWithRls,
f6855df) · DOC-HARDEN-003 (traspaso de dirección → docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING-2.md,
0806fb3) · **HARDEN-004B1/B2** (el nudo de arranque: UNA migración con DOS
políticas —membership_self_read + company_self_read—, c7d0ef7, desplegada
2026-08-10) · DOC-HARDEN-004 (firmas, incidentes y correcciones de esta sesión,
SHA pendiente al commit).
PENDIENTE: **HARDEN-004** — que ya NO es "el switch": la evidencia lo convirtió en
una CAMPAÑA DE CÓDIGO cuyo ÚLTIMO paso es cambiar la variable. Firmado en CINCO
piezas, orden **B → E → C → D** (ver § Plan firmado de HARDEN-004).
Docs: docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING.md (contrato VIVO del arco) ·
docs/HARDENING-RECON.md · docs/MATRIZ-DE-PERMISOS.md.

- **LAS DOS CAPAS, NUNCA UNA.** El poder real de un rol es la INTERSECCIÓN de
  (a) su ability CASL y (b) si el endpoint efectivamente pregunta. Una matriz
  construida solo sobre (a) está equivocada justo donde importa: trece endpoints
  shipearon con una historia CASL impecable y CERO gate. PoliciesGuard falla
  ABIERTO — devuelve true cuando el handler no lleva @CheckPolicies
  (policies.guard.ts:19) y lo hace ANTES del chequeo de usuario, ANTES del
  chequeo de x-company-id y ANTES del lookup de membresía, así que un handler sin
  gate corre con CERO validación de tenant. Y está registrado POR CONTROLADOR vía
  @UseGuards, NO globalmente (el único APP_GUARD es el ThrottlerGuard,
  app.module.ts:96-99): sobre un controlador que solo lleva
  @UseGuards(JwtAuthGuard), agregar @CheckPolicies NO HACE NADA — ningún guard lo
  lee. **Los dos deben estar presentes.** Lección pagada en HARDEN-002.
- **IDENTIDAD DE TENANT DESDE UN HEADER DEL CLIENTE.** TenantMiddleware
  (rls.middleware.ts) y el decorador @CurrentCompany (current-company.decorator.ts)
  toman x-company-id CRUDO, sin validar. El ÚNICO lugar donde la membresía se
  verifica es dentro de PoliciesGuard (policies.guard.ts:33-38) — que se saltea en
  rutas sin gate. Ergo: ungated + @CurrentCompany = cualquier autenticado puede
  nombrar cualquier empresa.
- **REGLA STEP 0 (corregida 2026-08-04).** Antes de gatear cualquier endpoint, la
  pregunta NO es "¿se rompe VIEWER?" sino: **para los SEIS roles, ¿la ability dice
  que sí sobre este Subject?**. Hay DOS mecanismos independientes que dejan un rol
  afuera: (1) VIEWER por ENUMERACIÓN — no tiene read all, así que un Subject que
  nadie le otorgue explícitamente es "—" por construcción (por eso HARDEN-001 y
  HARDEN-002 necesitaron exactamente un grant cada uno,
  casl-ability.factory.ts:772 y :779); y (2) MANAGER/ACCOUNTANT/ANALYST por el
  PISO default-deny (SUBJECTS.forEach(s => cannot('read', s)) — patrón COM-001 /
  MKT-001 / HSEC-001) cuando el re-grant no viene DESPUÉS del piso, por
  last-rule-wins. Corolario de nomenclatura, ya casi una trampa:
  OperationsCalendarSubject (:177) NO pertenece a CALENDARIO_SUBJECTS (:370, que
  es CalendarActivity + ActivityArea), así que los pisos de Calendario
  (:615/:683/:718) no lo tocan — leer el ARRAY, jamás el nombre.
- **ESTADO RLS EN RUNTIME: POLÍTICAS INERTES.** 87 políticas sobre 90 tablas de
  negocio (ENABLE y CREATE POLICY son un 1:1 perfecto en 87 cada uno), 3 sin
  política (users, tenants, audit_logs — NINGUNA con columna companyId; audit_logs
  se scopea por tenantId y es un sumidero cross-tenant en reposo, gap propio), y
  **0 FORCE**. La app conecta como postgres (superusuario + BYPASSRLS), así que
  las 87 políticas están INERTES en runtime. app_user existe (creado en
  20260417171836_add_rls_policies:27-31), rolsuper=false, rolbypassrls=false, y
  NUNCA se enchufó — no hay SET ROLE ni SET SESSION AUTHORIZATION en todo
  apps/api/src. Como app_user NO es dueño de las tablas, **ENABLE alcanza — FORCE
  no hace falta** (FORCE solo importa para que el DUEÑO de una tabla no saltee sus
  propias políticas). La pieza que falta para aislamiento real YA EXISTE; solo
  nunca se enchufó.
- **"RLS ES EL RESPALDO" ES FALSO** (transversal). Varios controladores
  justificaban dejar lecturas abiertas con un comentario que decía, en efecto,
  "igual RLS scopea los datos a la empresa". Es falso en runtime por TRES razones
  independientes: el rol de conexión bypassa RLS; RLS es ENABLE y no FORCE; y
  varias de esas lecturas pegan contra VISTAS MATERIALIZADAS, que PostgreSQL no
  puede someter a RLS. Donde vuelva a aparecer ese comentario, es BANDERA ROJA, no
  justificación: el chequeo de membresía es la única frontera de tenant en esas
  superficies.
- **EL SWITCH DE ROL NO VUELVE REDUNDANTE A HARDEN-001/002.** Las 4 vistas
  materializadas del dashboard seguirán sin poder llevar política pase lo que
  pase con el rol de conexión, así que su frontera de tenant sigue siendo el
  @CheckPolicies (el chequeo de membresía) MÁS el WHERE company_id = $1::uuid
  explícito de la capa de aplicación. Ningún ticket futuro debe retirar esos
  gates "porque ahora RLS funciona".
- **TRAMPA DEL POOL (doctrina — leer antes de "arreglar" nada).** Setear
  rls.company_id UNA vez por request, SIN LOCAL, sobre una conexión pooleada deja
  la GUC PEGADA en esa conexión, y se la come el request siguiente — que puede ser
  de otra empresa. El atajo obvio fabrica exactamente la fuga cross-tenant que el
  arco viene a cerrar. **Solo SET LOCAL, siempre dentro de la transacción**, que es
  lo que hace RlsService.executeWithRls (rls.service.ts:22-33: abre
  prisma.$transaction y setea rls.company_id, audit.company_id y — con userId —
  audit.user_id y rls.user_id; SET LOCAL muere en el COMMIT). Nota de higiene ya
  registrada: esos SET LOCAL interpolan el valor como string en $executeRawUnsafe
  en vez de bindearlo — superficie de inyección si alguna vez llega un valor sin
  validar.
- **EL NUDO DE ARRANQUE — ANÁLISIS, NO EVIDENCIA DE RUNTIME (corregido por
  HARDEN-003, 2026-08-05).** memberships y companies SÍ tienen política RLS
  (20260417171836_add_rls_policies:13-22). La versión anterior de este bullet decía
  que bajo app_user TODO endpoint gateado devolvería 403 'No active membership for
  this company'. **Está corregido: la rotura es AGUAS ARRIBA del guard.**
  GET /auth/me lee memberships y companies con un cliente PELADO, en un select
  anidado (auth.service.ts:94-118), y TenantMiddleware está EXCLUIDO de api/auth/\*
  (app.module.ts:110-115), así que ahí no hay header x-company-id ni puede haberlo.
  Bajo app_user ese select devuelve cero filas ⇒ el selector de empresa llega
  VACÍO ⇒ **nunca se produce un x-company-id** ⇒ el guard jamás llega a rechazar
  nada. El lookup pelado del propio guard
  (prisma.membership.findUnique fuera de executeWithRls y de toda transacción,
  policies.guard.ts:33-35) es la SEGUNDA rotura, no la primera: el usuario se loguea
  bien y queda mirando un selector vacío. Los DOS MODOS SIGUEN CONVIVIENDO y hay que
  esperarlos juntos: gateado ⇒ cierre duro (403 con un mensaje que CULPA a la
  membresía cuando la causa real es la GUC ausente); NO gateado ⇒ el modo opuesto,
  lectura ciega, cero filas, sin error. Sigue siendo **análisis** — nadie ha corrido
  todavía la app contra app_user; eso es el paso 4 del rollout local.
- **CREDENCIAL DE app_user: INEXISTENTE — VERIFICADO EN PRODUCCIÓN 2026-08-05.**
  La migración hace CREATE ROLE app_user LOGIN **sin cláusula PASSWORD**
  (20260417171836_add_rls_policies:29) y no hay ningún otro punto de
  aprovisionamiento en las 77 migraciones. rolcanlogin=true dice que el CATÁLOGO lo
  permite, no que exista una contraseña funcionando — y la consulta del fundador
  confirmó rolpassword IS NULL en producción (ver § Verificación en producción).
  Fijarla es escritura de producción: acción del FUNDADOR, jamás de un recon, y
  por decisión firmada va AL FINAL del arco (ver § Decisiones firmadas).
- **HUECOS DE GRANT conocidos.** El GRANT SELECT/INSERT/UPDATE/DELETE ON ALL
  TABLES IN SCHEMA public (20260417171836_add_rls_policies:33) es una FOTO del
  2026-04-17: no alcanza a nada creado después. El ALTER DEFAULT PRIVILEGES (:34)
  cubre solo objetos creados POR EL ROL que lo ejecutó y solo la clase TABLES — no
  SEQUENCES, no FUNCTIONS, no USAGE de schema. Y existe UNA sola concesión de
  secuencia en todo el árbol de migraciones (work_permit_number_seq, en
  20260428240000_add_work_permits). **CIERRE (2026-08-05): el inventario tabla por
  tabla se hizo y volvió con CERO huecos en producción** — los tres agujeros
  estructurales de arriba son reales como mecanismo, pero en los hechos ninguno
  dejó una tabla sin GRANT (ver § Verificación en producción). El único hueco vivo
  no es de privilegio sino de PROPIEDAD: el REFRESH de las vistas materializadas.
- **DEUDA DE SUSTRATO DE PRUEBA.** seed.ts crea UNA sola empresa y CINCO de los
  seis roles (admin/manager/accountant/analyst/viewer@excelsia.dev, con el rol en
  la Membership; **falta SUPER_ADMIN**), y los cuatro no-admin están detrás de
  NODE_ENV !== 'production' (seed.ts:84). La empresa ajena "HARDEN-001 Foreign Co"
  que sostuvo las pruebas BEFORE/AFTER del arco existe SOLO como fila en una base
  local: el string aparece únicamente en el handoff, en NINGÚN spec, seed ni
  migración. SECURITY_AUDIT.md nombra otro fixture ("Empresa Test") igual de
  inexistente. **La prueba cross-tenant no es reproducible desde el repo** —
  precondición pendiente de decisión del fundador para HARDEN-004. **SIGUE ABIERTA
  al 2026-08-05**: no bloquea el DISEÑO de HARDEN-004 (las cuatro piezas de abajo
  se pueden escribir sin ella), bloquea su VERIFICACIÓN HONESTA — sin una segunda
  empresa sembrada y un SUPER_ADMIN, la evidencia 200 → 403 del arco no la puede
  re-derivar nadie más que quien tenga la fila en su notebook.
- **UNGATED VIVOS: 15 handlers** (6 públicos legítimos + 9 en revisión), tras
  cerrar 4 en HARDEN-002. Inventario en docs/MATRIZ-DE-PERMISOS.md §4, CON LA
  SALVEDAD de que su conteo de 19 y sus hallazgos D1 (calendario abierto) y D4
  (SECURITY_AUDIT.md sin corregir) son ANTERIORES a HARDEN-002 y quedaron viejos.
  Entre los 9 vivos: operations/health y health/crons (D3, info-leak de
  infraestructura a cualquier autenticado de cualquier empresa) siguen esperando
  decisión.
- **PRECEDENCIA.** Los docs de recon y auditoría en docs/ son FOTOS FECHADAS del
  día en que se escribieron y **no se retro-editan** (HARDENING-RECON.md y
  MATRIZ-DE-PERMISOS.md, congelados). Sus derivas se registran ACÁ. El handoff
  docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING.md es la excepción: es contrato VIVO y
  sí se corrige. Donde cualquiera de ellos discrepe con este archivo, **manda
  CLAUDE.md**.
- **JUICIO (la lección del arco).** Cada hallazgo serio salió de NO confiarle a un
  documento: el "app_user tiene BYPASSRLS" resultó falso; el "RLS scopea los
  datos" resultó falso; y una auditoría que decía "revisé todos los controladores
  de operaciones" nunca había visto el controlador del calendario. Leer el código.
  Después decidir.

## Verificación en producción (2026-08-05, consultas read-only del fundador)

HECHO ESTABLECIDO, con la procedencia a la vista: esto NO sale de inspeccionar
código ni de la base local — son consultas que el FUNDADOR corrió contra la base de
producción el 2026-08-05, respondiendo el pedido explícito del recon HARDEN-003.

- **app_user**: rolsuper=false, rolbypassrls=false, rolcanlogin=true y
  **rolpassword IS NULL**. NO existe una credencial usable en producción: hoy un
  DATABASE_URL apuntando a app_user no autenticaría — el servicio no arrancaría.
- **postgres**: rolsuper=true, rolbypassrls=true. **Es el rol que conecta**, y es
  la razón por la que las 87 políticas están inertes. La pregunta de HARDEN-000
  queda cerrada con evidencia, no con inferencia.
- **El rol `excelsia` NO EXISTE en producción** (la consulta no devolvió fila). Por
  lo tanto `.env.example`, que documenta al usuario `excelsia` y su BYPASSRLS
  (`.env.example:24` y `:33-35`), **está equivocado respecto de producción** —
  describe el docker-compose local, no el entorno real.
- **HUECOS DE GRANT: CERO.** Las 91 tablas (90 de negocio + \_prisma_migrations) y
  las 4 vistas materializadas YA tienen SELECT/INSERT/UPDATE/DELETE para app_user.
  El universo coincide EXACTAMENTE con el local: r=91, m=4, S=1. Esto **INVIERTE la
  expectativa del recon**: no hay trabajo de GRANT que hacer.
- **pg_default_acl**: UNA fila viva, keyeada a `postgres`, `{app_user=arwd/postgres}`.
  Es la razón por la que las tablas creadas después del 2026-04-17 quedaron
  cubiertas sin depender del GRANT por tabla. Aplica SOLO a objetos creados por
  postgres — dato PORTANTE para la decisión del rol migrador.
- **Las 4 vistas materializadas son propiedad de `postgres`.** REFRESH MATERIALIZED
  VIEW exige **PROPIEDAD, no privilegio**: bajo app_user el refresh se rompe y
  **ningún GRANT lo arregla**. Ítem abierto de HARDEN-004.
- **Schema public para app_user**: USAGE=true, CREATE=false. Confirma que el
  peligro de boot-loop es real en producción — una migración futura corriendo como
  app_user falla en su primer DDL.

## El hallazgo SII — rehace la forma del trabajo

audit_logs en producción al 2026-08-05: **7.342 filas**, de las cuales **6.892 sin
contexto de empresa (93,9%)**, en un rango que va del 2026-04-22 al 2026-08-05.

- **La cifra local era 37,5% y el director asumió que estaba inflada por la semilla.
  Estaba equivocado, y equivocado en la DIRECCIÓN: producción es mucho PEOR.** Se
  registra el error, no solo el número.
- **Pero el desglose por tabla cambia el significado por completo**: tax_documents
  4.131 · movements 2.072 · counterparties 351 · users 298 · y después 40 filas
  repartidas en 7 tablas (fiscal_periods 12, categories 12, domain_events 8,
  cost_centers 3, company_settings 2, memberships 2, companies 1).
- Las tres primeras son **UN SOLO camino de código**: el sync SII (factura →
  movimiento auto-creado → contraparte auto-creada desde el RUT).
- `users` **no tiene política RLS**, así que sus 298 escrituras sobreviven el
  switch (sin atribuir, como hoy). Excluyéndolas quedan **6.594 que sí se
  romperían**, de las cuales el sync SII es **6.554 — el 99,4%**. Las 40 restantes
  son el setup único de abril 2026.
- **Conclusión que reordena el trabajo: las escrituras NO son una campaña
  sistémica, son UNA integración con nombre y apellido más un puñado de caminos de
  bajísimo volumen.** Arreglar el sync SII para que escriba dentro de
  executeWithRls cubre el 99,4% del problema de escritura.
- **DOS SALVEDADES que hay que escribir al lado del número, siempre**: (1)
  audit_logs registra **SOLO ESCRITURAS** — los 810 sitios de LECTURA sin GUC son
  invisibles en estos datos y siguen siendo el trabajo pesado; (2) el trigger de
  auditoría cubre **83 de 90** tablas de negocio, así que las escrituras a las
  otras 7 no aparecen acá en absoluto.

## Hallazgos del recon HARDEN-003 que corrigen premisas del director

- **NO EXISTE UN TEST QUE FALLE SI RLS SE ROMPE.** `rls.security.spec.ts:19-23`
  afirma que el chequeo end-to-end "lives as a standalone script (kept out of Jest
  via testPathIgnorePatterns)"; `jest.config.ts:12` excluye ÚNICAMENTE
  `audit.spec.ts` y **ese script no existe en ningún lado**. El spec que sí existe
  mockea `$transaction`, o sea prueba que la app emite los SET LOCAL correctos y no
  puede probar que PostgreSQL los honre. Es la TERCERA aparición del patrón
  característico del arco: un comentario que declara una cobertura que nunca
  estuvo.
- **audit_logs."tenantId" GUARDA UN companyId.** El trigger escribe
  `current_setting('audit.company_id')` en la columna `"tenantId"`
  (20260417172748_add_audit_triggers:36) y el servicio filtra `tenantId: companyId`
  para coincidir (audit.service.ts:10, :19, :28). La tabla YA lleva alcance por
  empresa, bajo un nombre que miente — por eso el ítem 4 del backlog V2 es un
  RENAME más una política, **NO un backfill**.
- **EL TRIGGER DE AUDITORÍA SOBREVIVE EL CAMBIO.** `audit_trigger_function` es
  SECURITY DEFINER y su dueño es un superusuario, así que escribe con los
  privilegios del DUEÑO y no los de la sesión — seguiría escribiendo bajo app_user,
  e incluso seguiría escribiendo si audit_logs ganara una política más adelante
  (lo cual es exactamente lo que se quiere de un sumidero de auditoría). **La
  premisa del director en Q7 ("el trigger escribe como el rol de sesión") era
  FALSA.**
- **LA ESCALADA DE BYPASSRLS ESTÁ AUSENTE POR ACCIDENTE, NO POR DISEÑO.** Una
  migración futura que llevara `ALTER ROLE current_user BYPASSRLS` **NO** le daría
  bypass a app_user: solo un superusuario puede setear ese atributo, y el bloque
  atrapa el fallo con `EXCEPTION WHEN insufficient_privilege` y lo degrada a un
  NOTICE (20260417171836_add_rls_policies:36-47). **La premisa del director era
  FALSA.** El peligro real está un paso ANTES y es más ruidoso: sin CREATE en
  public, una migración futura falla en su primer DDL y el `&&` del start command
  se lleva puesto el arranque. Se RE-ARMA si algún día app_user llega a
  superusuario o si alguien "limpia" ese EXCEPTION handler.

## Decisiones firmadas del fundador (2026-08-05)

Cada una con su razonamiento, porque el razonamiento es lo que un lector futuro
necesita para no "corregirlas".

- **CONTRASEÑA DE app_user.** Generada por un gestor de contraseñas, guardada
  ÚNICAMENTE en el store de variables de Railway — NO duplicada en un gestor
  personal. Jamás tipeada a mano, jamás pegada en un chat. Se fija PRIMERO en
  LOCAL (para reproducir los cuatro modos de falla) y en PRODUCCIÓN AL FINAL, al
  cierre del arco. **RAZONAMIENTO:** mientras el rol no tenga credencial, el switch
  es IMPOSIBLE de hacer por accidente — un DATABASE_URL mal puesto no arranca en
  vez de romper el producto. Esa red de seguridad se pierde en el instante en que
  la contraseña existe, así que se crea lo más tarde posible. Perder la copia no
  cuesta nada: un ALTER ROLE la regenera en segundos, así que una copia de respaldo
  no compra nada y duplica la superficie de fuga.
- **ROL MIGRADOR: sigue siendo `postgres`.** El start command toma la URL
  privilegiada de una SEGUNDA variable para el paso de migración; la app arranca
  como app_user. **RAZONAMIENTO:** la fila de pg_default_acl ya está keyeada a
  postgres y verificada funcionando (cero huecos); un migrador dedicado costaría
  CUATRO escrituras de producción (crear rol, otorgar DDL, otorgar BYPASSRLS — que
  a su vez exige un superusuario — y ALTER DEFAULT PRIVILEGES FOR ROLE) y rompería
  esa segunda capa de cobertura de grants. **El aislamiento de tenant depende del
  rol de RUNTIME, no del migrador.** Un migrador dedicado queda diferido al backlog
  de endurecimiento V2.
- **REGLA DERIVADA:** la división del start command entra **ANTES o JUNTO CON** el
  cambio de DATABASE_URL, **nunca después**. La ventana de boot-loop se abre en el
  instante mismo del switch.

## Plan firmado de HARDEN-004 (FIRMADO por el fundador 2026-08-05)

Ya no es un ticket: son **CINCO piezas separadas**, en orden **B → E → C → D**, con
**E BLOQUEANTE antes de D**. (A) ya está en producción.

- **(A) El sync SII escribiendo dentro de executeWithRls.** ✅ LISTO (f6855df).
  Cubrió el 99,4% del problema de escritura (6.554 de 6.594 filas).
- **(B) El nudo de arranque.** Las 16 lecturas de identidad enumeradas en el recon
  (Q1.2), empezando por GET /auth/me. Sin esto no hay login utilizable. B1 escrita
  sin commitear (ver § Estado de la pieza B).
- **(E) Los FLUJOS que se apagan en silencio — BLOQUEANTE antes de D.** Cuatro
  barridos de cron (contratos, certificaciones, documentos RRHH, escalamiento de
  alertas) hacen el DESCUBRIMIENTO de empresas leyendo tablas con política sobre el
  cliente pelado: bajo RLS viva eso devuelve cero filas, el cuerpo del loop no corre
  nunca y **el job reporta éxito sin hacer nada**. Se suma NotificationService: sus
  ESCRITURAS están perfectamente envueltas, pero sus resolutores de destinatarios
  (resolveRoleUsers, resolveAlertRecipients y las lecturas de activo dentro de
  createForAssetBlocked) corren en el cliente pelado — así que el wrapper es
  INALCANZABLE: la escritura no ocurre porque la lectura que la alimenta no encontró
  a nadie. **El descubrimiento cross-tenant necesita un REDISEÑO (enumerar empresas
  primero, después iterar con contexto por empresa), no un wrapper** — no hay un
  companyId único al que scopear un barrido que es estructuralmente cross-company.
- **(C) La campaña de lectura.** 810 sitios sin GUC en 116 archivos. **Es la ÚNICA
  pieza que necesita un mecanismo nuevo**, y por lo tanto la única que necesita una
  decisión de diseño del fundador — **todavía NO tomada** (las opciones y sus costos
  están en el recon, Q1.3 y Q4.3). No se empieza C escribiendo código.
- **(D) La división del start command más el cambio de DATABASE_URL.** ÚLTIMA,
  siempre, y sujeta a la regla derivada de arriba.

## HARDEN-004A — cerrado (f6855df)

- **Decisión firmada (2026-08-05): el sync es RESILIENTE POR DOCUMENTO.** Un
  documento que falla cae en errors[] y el loop sigue; los anteriores quedan
  commiteados y la corrida reporta éxito parcial.
- **DOS transacciones POR DOCUMENTO, no una** — y esto corrige un spec equivocado
  del propio director. La primera implementación envolvía upsertDocument y
  createMovementFromDocument en UNA sola transacción, lo que cambiaba los contadores:
  un documento cuyo movimiento fallaba dejaba de persistir. **Está mal, porque un
  tax_document SIN movimiento es un estado DISEÑADO de primera clase**:
  isReconciled:false alimenta el contador pendingReconciliation que devuelve
  getSummary y que la UI renderiza. Hacer rollback del documento haría DESAPARECER
  una factura del producto. Con dos transacciones, los contadores coinciden con el
  comportamiento previo en los cuatro casos. **Que nadie las "simplifique" a una.**
- **Bug pre-existente CERRADO:** movement.create y el taxDocument.update que los
  enlaza eran dos sentencias sueltas; si fallaba la segunda quedaba un movimiento
  HUÉRFANO con el documento sin movementId, el guard de idempotencia no disparaba y
  la corrida siguiente creaba un **registro financiero DUPLICADO**. Ahora son
  atómicos dentro de la misma transacción.
- **Idempotencia verificada EN PRODUCCIÓN por el fundador**: re-sincronizar un
  período ya sincronizado dio **puros skips** — sin documentos ni movimientos
  duplicados.
- **NO EJERCITADO: el camino de reglas de categorización.** No existe ninguna fila
  CategoryRule en producción, así que applyRules devuelve null siempre y todo
  documento toma la rama de categoría por defecto. **Queda pendiente de verificar
  cuando se cree la primera regla.**

## El caso forense COPEC (2026-08-05)

Apareció un movimiento con una categoría que no era la default y sin ninguna regla
que lo explicara. Dos consultas a audit_logs lo resolvieron: la fila se creó **00:19
con la categoría por defecto del sistema y userId NULL** (el sync SII, que entonces
escribía fuera de executeWithRls y por eso no dejaba audit.user_id), y fue
**recategorizada 00:29 por un usuario identificado** — una persona, en la UI. Jamás
existió una fila CategoryRule. **Qué probó:** (1) el trigger de auditoría funciona de
verdad como CAPA FORENSE — respondió una pregunta que ningún log de aplicación podía;
(2) **applyCategoryRules NO tiene heurísticas ocultas** — hace exactamente lo que
dice, cae al default cuando ninguna regla matchea, y la anomalía fue acción humana,
no código.

## Decisiones firmadas — tenancy y pieza B (2026-08-05)

- **V1: un tenant = una company.** Un usuario pertenece exactamente a una empresa.
- **V2: un tenant puede tener VARIAS companies** (holdings chilenos); un usuario
  puede entonces tener varias membresías, siempre dentro de SU tenant, **nunca
  cruzando tenants**.
- **EL ESQUEMA YA SOPORTA V2 — que nadie lo "simplifique"**: getMe devuelve un
  ARRAY `companies`, el frontend ya tiene PICKER, y memberships lleva el único
  compuesto (userId, companyId). Que hoy exista una sola empresa NO es motivo para
  colapsar nada de eso.
- **Opción 1 FIRMADA para memberships**: una SEGUNDA política, user-scoped y de SOLO
  LECTURA, en vez de una función SECURITY DEFINER — esta última habría agregado una
  segunda puerta privilegiada que custodiar.

## Doctrina nueva — auditar FLUJOS, no escrituras

> **"Una escritura correctamente envuelta no vale nada si la lectura que la alimenta
> no tiene contexto."** (fundador, 2026-08-05)

Un censo por-escritura — la forma que usó HARDEN-004A — marcaría NotificationService
en verde. **No está en verde.** Cuando se audite el resto de la plataforma se auditan
FLUJOS completos (descubrimiento → resolución → escritura), no sentencias sueltas.
**ENGINE_USER_ID** ('00000000-0000-0000-0000-000000000000') es la identidad sintética
SANCIONADA para escrituras de cron (precedente OPS-022); ya se usa en
exceptions.service.ts:22, alert-escalation.service.ts:8 y alert-engine.service.ts:31.
No inventar una segunda convención.

## HARDEN-004B1/B2 — cerrado (c7d0ef7, desplegado 2026-08-10)

UNA migración, DOS políticas — el problema era UNO SOLO ("un usuario no puede
arrancar en el producto") y por eso viajó en un solo archivo:
`20260805120000_add_membership_user_read_policy`. B1 agregó **membership_self_read
ON memberships**; B2 agregó **company_self_read ON companies**. Las dos son
PERMISSIVE y FOR SELECT, así que ORean con las existentes y **no tocan la
escritura**: membership_isolation y company_isolation siguen siendo las ÚNICAS que
la habilitan (son FOR ALL sin WITH CHECK, o sea su USING hace de chequeo de
escritura). Ritual de despliegue completo: Railway deployment abeb3105, con la
línea literal "Applying migration 20260805120000_add_membership_user_read_policy"
cazada en los logs de deploy de api a las 14:14:32Z.
**Ambas políticas están INERTES hoy**: el runtime conecta como postgres
(superusuario + BYPASSRLS), así que no muerden hasta la pieza D.

```
ACTA — company_self_read, tres decisiones del fundador (2026-08-06):
1. NIVEL-FILA ACEPTADO: la política otorga la fila completa de companies
   (once columnas, settings incluido) únicamente a miembros con membresía
   activa de esa empresa — jamás a terceros. Lo que el usuario ve sigue
   siendo el mínimo que la aplicación devuelve (getMe: id, name, taxId).
   Exposición marginal contra el estado previo: de timing, no de datos.
2. ENSANCHE ACEPTADO COMO SIGNIFICADO DE DISEÑO: un usuario puede leer la
   fila de toda empresa a la que pertenece (membresía activa), en cualquier
   consulta, antes y después de seleccionar empresa. Acotado a su propio
   tenant por construcción; manda la pertenencia, no el holding (2 de 3 ⇒
   ve 2). Si una superficie V2 debe mostrar menos, es un WHERE de aplicación
   en esa superficie: la política es el piso, la aplicación angosta.
3. CONDICIÓN isActive MANTENIDA: desactivar una membresía revoca al
   instante, en el piso de la base, la visibilidad de la fila de esa
   empresa. Consecuencia aceptada y fechada: una vista histórica futura que
   resuelva el nombre vía membresía desactivada lo verá en blanco.
   Asimetría deliberada con membership_self_read (sin isActive) registrada.
```

## Incidente de drift local — COM-010 (2026-08-10)

`prisma migrate dev` detectó **drift de checksum** sobre
`20260707120000_add_quotes`. La historia git de ese archivo tiene **UN SOLO commit**
(3731d66, 2026-07-07 — verificado por la API de GitHub), así que el archivo
commiteado **nunca se enmendó** y **producción coincide con el repo**: el drift era
LOCAL. Causa: durante el loop de COM-010 la base local había aplicado un borrador
PREVIO a la corrección — el gate de sintaxis corrió ANTES de la revisión adversarial.
Resuelto con `prisma migrate reset`, que replayó las 78 migraciones desde cero y de
paso sirvió como **gate de sintaxis de cadena completa para HARDEN-004B**.
**Lección registrada: el gate de sintaxis local corre DESPUÉS de la revisión
adversarial y de sus correcciones** — el drift de julio es la cicatriz del orden
inverso.

## Estado de la pieza B (actualizado 2026-08-10)

- **DECISIONES FIRMADAS (2026-08-06) y MIGRACIÓN CERRADA**: las tres preguntas
  abiertas sobre company_self_read quedaron firmadas por el fundador (acta completa
  en § HARDEN-004B1/B2), la migración se commiteó en c7d0ef7 y se desplegó el
  2026-08-10. **Las dos políticas están vivas en producción y INERTES hasta la
  pieza D** (el runtime todavía conecta como postgres, que bypassa RLS).
- **LO QUE QUEDA DE LA PIEZA B ES EL LADO CÓDIGO**: setear `rls.user_id` desde el
  JWT en los caminos de lectura de identidad — getMe y la lista Q1.2 del recon. Sin
  eso las políticas nuevas no tienen de dónde leer la GUC. **Se diseña como ticket
  propio y bajo la DOCTRINA DEL POOL**: solo SET LOCAL, siempre dentro de la
  transacción, con la conexión pineada — el atajo de setear la GUC una vez por
  request sobre una conexión pooleada fabrica exactamente la fuga cross-tenant que
  el arco viene a cerrar.
- **B1-VERIFY, lo medido (se conserva porque sigue siendo la evidencia):** Prisma
  emite TRES sentencias separadas para getMe (no hay relationJoins), así que
  companies se evalúa por su cuenta: con rls.user_id seteado y rls.company_id sin
  setear, membership_self_read admite las filas del llamador pero company_isolation
  evalúa NULL y la tercera sentencia devuelve CERO filas. El mapeo de getMe
  desreferencia m.company.id sin guardas (auth.service.ts:130) y con company null
  tira TypeError. **NO MEDIDO**: si Prisma devuelve company:null o descarta la
  membresía — el rol local tiene BYPASSRLS, que es absoluto (ni FORCE ayudaría).
- **Claims del §4 — TODOS CERRADOS (2026-08-06)**: `tenancy.service.ts:23-25` e
  `iam.prisma:29-43` re-verificados EXACTOS por el director saliente (adenda
  post-commit). La SQL capturada, las mediciones de predicados y el claim de
  no-recursión re-verificados por el director entrante CONTRA EL REPO: el
  mecanismo de las tres sentencias (generator sin previewFeatures, ^6.19.3,
  getMe sin relationLoadStrategy) y los textos reales de las políticas
  (20260417171836:15-16 y :21-22) confirman las derivaciones por lógica
  trivaluada; búsqueda exhaustiva confirma UNA sola política commiteada por
  tabla (no-recursión: razonamiento sobre texto verificado). Los residuos que
  SOLO se miden en vivo (captura literal, evaluación bajo enforcement) salen
  gratis en el rollout local con app_user.

## Backlog de endurecimiento V2 (diferido a propósito)

Cada ítem con la línea de por qué es seguro diferirlo:

1. **Migrador dedicado no-superusuario** con su propio ALTER DEFAULT PRIVILEGES FOR
   ROLE — seguro de diferir: el aislamiento lo da el rol de runtime, no el
   migrador, y postgres ya está verificado con cero huecos.
2. **SET search_path = public, pg_temp en audit_trigger_function** — seguro de
   diferir: hoy está desactivado por accidente (app_user no puede CREATE en
   public), pero **desactivado no es cerrado**; se re-arma si alguien le da a
   app_user derechos de creación en cualquier schema de su search_path.
3. **set_config(...) en vez de interpolar strings en executeWithRls** — seguro de
   diferir: es latente, no vivo; hoy todos los llamadores validan el valor antes.
4. **audit_logs: renombrar tenantId → companyId y agregarle política** — seguro de
   diferir: la tabla no tiene controlador ni consumidor (AuditService no lo usa
   nadie), así que la exposición es EN REPOSO. Deja de ser diferible el día que
   alguien construya un visor de auditoría.
5. **Test end-to-end de RLS como gate de CI** — seguro de diferir solo mientras el
   switch no ocurra; después del switch pasa a ser la única red que detecta una
   regresión silenciosa.
6. **Test de concurrencia del pool** — seguro de diferir hasta que exista un
   mecanismo de contexto nuevo que testear (pieza C).
7. **Revocar la escritura de app_user sobre \_prisma_migrations** — seguro de
   diferir: endurecimiento fino; el runtime no toca esa tabla, solo el migrador.

## Mejoras diferidas (nuevas, 2026-08-05)

- **UX-001** — movimientos sin categorizar al final + sección colapsable. Va en el
  sprint de mejoras; el freeze de frontend se mantiene hasta entonces.
- **Sprint de mejoras** — categorías + las primeras reglas de categorización; UI de
  historial de auditoría que responda "quién cambió esta categoría" (la pregunta
  COPEC, vuelta autoservicio).
- **CompaniesService.getSettings es un UPSERT disfrazado de getter**, sobre cliente
  pelado — y calza con las 2 filas de company_settings sin contexto del audit de
  producción.
- **El barrido de flujos** — la generalización de la pieza E más allá de los cinco
  sitios ya encontrados (escritura envuelta detrás de lectura rota).
- **Limpieza de tax.service** — cuatro helpers deberían ser `private` (no tienen
  llamadores externos), y el parámetro opcional `tx?` de
  CategoryRulesService.applyRules es un footgun: si alguien lo olvida, la llamada se
  escapa de la transacción en silencio.
- **Asimetría fecha-vs-período del SII** — comportamiento DOCUMENTADO, no un bug.
- **Verificación del camino de reglas** — pendiente de que exista la primera
  CategoryRule (ver § HARDEN-004A).
- **Deprecación Prisma 7** — la configuración `package.json#prisma` debe migrar a
  `prisma.config.ts` antes de Prisma 7; hoy solo emite un warning, es inofensiva.

## Traspaso de dirección (2026-08-05)

Sesión de director CERRADA el 2026-08-05. **La entrada del nuevo director es
docs/EXCELSIA-DIRECTOR-HANDOFF-HARDENING-2.md** (orden de lectura, estado del arco,
las dos planillas de roles, el plan firmado, el ledger diferido y el checklist de la
primera hora). handoff-1 queda como HISTORIA: sigue siendo válido en sus
correcciones en sitio, pero ya no es el punto de entrada.

Última actualización: 2026-08-10 (DOC-HARDEN-004 — firmas, incidentes y
correcciones de sesión)

# Próximos pasos

- Módulos V1 completos: Finanzas, Operaciones, RRHH, Comercial, Marketing,
  Calendario de Actividades.
- Vista Gestión de actividades — LISTA (CAL-008…CAL-010, live 2026-07-22):
  la reunión semanal de AGS migró de la planilla al módulo (tabla con estado
  inline, atrasadas derivadas con fecha chilena, bitácora inmutable). Detalle
  en el bloque del módulo arriba.
- Feed unificado cross-módulo del calendario — LISTO (CAL-014…CAL-018, live
  2026-07-27): el sobre come de sus cuatro vecinos (Operaciones, Marketing,
  Comercial, RRHH) vía hojas que no importan nada. Detalle + matriz firmada en
  el bloque del módulo arriba (§ Feed unificado del calendario).
- Semillas V2 (feed unificado, plan §5): preferencias de leyenda por usuario ·
  deep links por colección · filtros de vencimientos por tipo de documento ·
  medio-días de ausencia.
- Semillas V2 (Gestión de actividades): asignados múltiples (M2M) · política
  de corrección/borrado de notas · recordatorios de actividades atrasadas ·
  export semanal de la vista.
- HSEC V1 COMPLETO (HSEC-000..011, live 2026-08-03) — detalle y matriz
  firmada en el bloque del módulo arriba. Micro-tickets CERRADOS (2026-08-03):
  OPS-038 — el evento procedure.acknowledgment-expired componía un string
  procedureId:userId contra una columna @db.Uuid, así que emit() se tragaba
  cada fila en silencio desde OPS-032; hoy el aggregateId es el UUID PK propio
  del acuse (acknowledgments.service.ts:488-489 —
  "// OPS-038 — the row's own UUID PK is the aggregate identity." +
  acknowledgmentId: c.id; el campo en domain-event-types.ts:115 y su resolución
  en :243), PINEADO contra regresión en domain-event-types.spec.ts:47-65 (el
  caso culpable, con assert de que el id nunca contiene ':'). PLAT-001 — el
  SentryExceptionFilter solo leía exception.message, así que los mensajes de
  class-validator colapsaban en "Bad Request Exception" a nivel PLATAFORMA
  (hallazgo HSEC-008); hoy lee getResponse() (sentry-exception.filter.ts:38) y
  une los arrays de constraints con ' · ' (:46), dejando el path de string
  byte-idéntico. Deuda registrada: el filtro sigue SIN spec (tres ramas:
  string, string[], no-HttpException) — crear una cuando se lo toque.
- OPS-039 — CREAR Y EDITAR tipos de permiso estaba ROTO EN PRODUCCIÓN (c89491f,
  live 2026-08-10; api y web SUCCESS 14:59Z). El formulario mandaba siempre
  isActive y create-permit-type.dto.ts NO lo declara — es el ÚNICO DTO de
  configuración de la familia que lo omite: la auditoría de hermanos encontró que
  AssetType, AssetSubtype, Location, DocumentType y WorkPermitType SÍ whitelistean
  todos los campos que mandan sus modales, isActive incluido. Con el ValidationPipe
  global (main.ts, whitelist + forbidNonWhitelisted) el campo colado se convierte en
  400 tanto en create como en edit. Lo destapó el primer tipo de permiso CUSTOM
  después del setup inicial por seed-defaults. Fix SOLO de web: el formulario dejó
  de mandar isActive y se borró el toggle muerto de modo edición; la desactivación
  sigue viviendo EXCLUSIVAMENTE en el DELETE guardado (PermitTypesService.remove,
  soft-delete con guard de permisos activos). OBSERVACIÓN de familia (observación,
  no ticket): los DTO hermanos SÍ aceptan isActive por update — bypass latente del
  guard SI algún delete hermano llegara a llevar guard de uso. Notas de proceso: el
  mensaje de commit se desvió del bloque aprobado (literal: "fix op: stop sending
  isActive from the permittype form OPS039" — conventional-commit malformado, ID de
  ticket sin guion); la historia publicada NO se reescribe, la desviación queda
  registrada acá. Y la sesión acumuló DOS fallas de fidelidad en los reportes de CC
  (el reporte de B2 llegó corrupto en transporte con el archivo sano debajo; el de
  OPS-039 declaró 357→347 líneas cuando el cambio real fue −14, zanjado con los
  stats de GitHub +5/−19) — reafirmando la doctrina: **manda la salida cruda del
  archivo, no lo que dice el reporte**.
- DECISIÓN DE PRODUCTO REGISTRADA, PENDIENTE (2026-08-10): **la reactivación de un
  tipo de permiso es imposible hoy**. remove() solo setea isActive=false, ninguna
  ruta lo vuelve a poner en true, y seed-defaults saltea los códigos existentes —
  un tipo desactivado queda trabado para siempre. El fundador decide si se
  construye un camino de reactivación y cuándo (necesitaría endpoint propio,
  gating y diseño).
- Manual de Comercial (V1 ya en producción).
- Manual de HSEC (V1 ya en producción — se suma a los manuales pendientes).
- Bump rutinario de dependencias (incorpora el fix de Next.js PR #88688,
  que elimina el warning dev-only "negative time stamp").
- FASE 0 — PROVEEDOR SII VERIFICADO Y CERRADO (2026-08-03): tax*sync_runs
  en producción tiene UN solo proveedor histórico, 'baseapi' — cero filas
  'mock-sii' desde el primer run (2026-04-22) hasta hoy; 318 corridas, 300
  exitosas, 2.059 documentos sincronizados, última corrida 2026-08-03
  13:38. Barrido de huellas sobre tax_documents (2.046 filas): CERO en las
  tres marcas del mock (metadata provider, prefijos SII-EMI-/SII-REC- en
  externalId, RUT demo 76.123.456-7). La integración corre contra BaseAPI
  real y la data fiscal está limpia. TAX-001 (2026-08-03) eliminó el
  DEFAULT 'mock-sii' de la columna: sin default y con NOT NULL, un INSERT
  crudo que omita provider ahora FALLA en vez de rotular data real como
  mock. Doctrina: BaseAPI = sync SII (BASEAPI_KEY / SII_RUT /
  SII_PASSWORD); LibreDTE = test de conexión por certificado
  (LIBREDTE*\*) — jobs distintos, no confundir las llaves.

- DECISIÓN DE POLÍTICA (2026-07-15, fundador): VIEWER es un rol de lectura
  financiera POR DISEÑO — mantiene read sobre Movement/caja/compromisos,
  montos incluidos (herencia deliberada de la era Finanzas, confirmada con
  la evidencia de MKT-010). La regla "ANALYST/VIEWER nunca ven montos"
  aplica a los módulos posteriores a Finanzas (RRHH, Comercial, Marketing
  y futuros): ahí sigue siendo ley. La caja es la excepción fundacional,
  no un bug — ningún ticket futuro debe "corregirla" sin decisión expresa.
- Semillas V2: sub-tareas / checklists de campaña; conciliación
  gasto↔Movement (link movementId); APIs de ads/analytics (Google,
  LinkedIn) + crawler SEO; notificaciones de marketing por path fino
  propio (precedente RRHH, no el motor de alertas de Operaciones).
- ROTACIÓN R2 CERRADA (2026-08-03): token nuevo creado con permiso Object Read & Write acotado al bucket; swap de MINIO_ACCESS_KEY + MINIO_SECRET_KEY en una sola edición del servicio api; verificado con subida nueva (filePath no nulo), descarga nueva y descarga de objeto PREVIO a la rotación; token viejo REVOCADO y re-verificado post-revocación. La credencial expuesta ya NO se considera viva. Ítem de seguridad cerrado.
- NOTA DE ENTORNO: las credenciales de Cloudflare R2 en producción viven bajo nombres MINIO*\* (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET / MINIO_PORT=443 / MINIO_USE_SSL=true). NO existen variables R2*\*: storage.service.ts es un cliente S3 único para MinIO local y R2 productivo (region 'auto', forcePathStyle, ver comentarios del constructor). Solo el servicio api las tiene — web y CI no.
