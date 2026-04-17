# Excelsia ERP — Contexto del proyecto

## Qué es este proyecto
Excelsia ERP es una plataforma financiera gerencial para empresas chilenas.
Permite visualizar, controlar y anticipar la situación financiera consolidando
movimientos bancarios, información tributaria (SII), compromisos y proyecciones.
Es un sistema multi-tenant (múltiples empresas) con aislamiento estricto de datos.

## Stack tecnológico
- Monorepo: Nx (con imposición de límites entre módulos)
- Frontend: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: NestJS + TypeScript (arquitectura por módulos de dominio)
- Base de datos: PostgreSQL con Row Level Security (RLS) para multi-tenancy
- ORM: Prisma con prismaSchemaFolder (esquema dividido por módulo)
- Colas y jobs: Redis + BullMQ
- Storage: MinIO (S3-compatible)
- Auth: JWT en cookies HttpOnly + Passport.js en NestJS
- Autorización: RBAC + CASL (preparado para ABAC)
- Auditoría: Triggers de PostgreSQL (infalibles, nivel base de datos)
- Observabilidad: Sentry + OpenTelemetry con distributed tracing
- Infra local: Docker Compose
- CI/CD: GitHub Actions

## Decisiones arquitectónicas clave
1. Monolito modular, NO microservicios
2. Multi-tenancy con shared database + PostgreSQL RLS (no filtros solo en app)
3. JWT nunca en localStorage, siempre en cookie HttpOnly Secure SameSite=Strict
4. Auditoría con triggers PL/pgSQL, no solo AuditService de aplicación
5. Next.js actúa como BFF (Backend for Frontend): presentación y orquestación
6. Toda lógica de negocio pesada vive en NestJS, nunca en el frontend
7. Prisma con schema dividido por módulo (prismaSchemaFolder)
8. Transacciones complejas siempre con prisma.$transaction() explícito

## Estructura del repositorio (Nx monorepo)
excelsia-erp/
  apps/
    web/          # Frontend Next.js (BFF layer)
    api/          # Backend NestJS
  libs/
    ui/           # Componentes de UI compartidos (shadcn/ui base)
    config/       # Configuración compartida (eslint, tsconfig)
    types/        # Tipos TypeScript compartidos entre apps
    utils/        # Utilidades compartidas
  infra/
    docker/       # Dockerfiles por servicio
    nginx/        # Configuración nginx
    scripts/      # Scripts de utilidad (seed, migrate, etc.)
  docs/           # Documentación técnica y ADRs
  .github/        # GitHub Actions workflows

## Estructura del backend (apps/api/src)
modules/
  iam/            # Autenticación, sesiones, usuarios
  tenancy/        # Multi-empresa, membresías
  companies/      # Configuración de empresa
  catalogs/       # Categorías, contrapartes, centros de costo
  banking/        # Integración bancaria, sync
  tax/            # Integración SII/fiscal
  movements/      # Movimientos financieros
  reconciliation/ # Conciliación banco-documento
  cashflow/       # Caja, tesorería, compromisos
  alerts/         # Alertas y notificaciones
  closing/        # Cierre mensual
  reports/        # Reportes y exportaciones
  audit/          # Servicio de auditoría (complementa triggers DB)
  jobs/           # Workers BullMQ
  common/         # Decoradores, guards, interceptores compartidos
prisma/
  schema/         # Un archivo .prisma por módulo (prismaSchemaFolder)
main.ts

## Convenciones de código
- Backend: módulos por dominio de negocio, DTOs tipados con class-validator,
  servicios sin lógica duplicada, transacciones explícitas, logs por caso crítico
- Frontend: feature folders, componentes puros, React Hook Form + Zod,
  manejo consistente de loading/error/empty states
- Commits en inglés: tipo(scope): descripción
  Tipos: feat, fix, chore, refactor, test, docs
  Ejemplo: feat(iam): add JWT auth with HttpOnly cookie
- Ramas: feature/TICKET-ID-descripcion
  Ejemplo: feature/ARC-002-nx-monorepo-setup
- Todo endpoint protegido debe: (1) validar JWT, (2) extraer tenant_id,
  (3) verificar rol/permiso CASL, (4) ejecutar lógica con RLS activo

## Módulos de dominio y sus límites
Un módulo NUNCA importa directamente las entidades o repositorios de otro módulo.
La comunicación entre módulos es solo a través de interfaces públicas (facades).
Nx enforce-module-boundaries garantiza esto automáticamente en CI.

## Seguridad multi-tenant (CRÍTICO)
El tenant_id se extrae del JWT en el TenantMiddleware.
Se propaga por AsyncLocalStorage durante todo el ciclo de vida de la request.
Al iniciar cada transacción DB se ejecuta: SET LOCAL rls.tenant_id = '<id>'
PostgreSQL RLS hace el resto automáticamente en cada SELECT/UPDATE/DELETE.
NUNCA confiar solo en filtros WHERE a nivel de aplicación.

## Sprint actual
Sprint 1 — Plataforma base con Nx

## Ticket actual
ARC-001 — Crear repositorio y estructura base del monorepo Nx
Criterios de aceptación:
- Nx monorepo inicializado con apps/web, apps/api, libs/
- README inicial con descripción del proyecto y stack
- .gitignore apropiado para Nx + Node.js + TypeScript
- COMMITS.md documentando la convención de commits
- Estructura de carpetas coincide con lo definido en este CLAUDE.md

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

## Completed tickets
ARC-001 — Nx monorepo base structure ✓
ARC-002 — Docker Compose with PostgreSQL, Redis and MinIO ✓
ARC-003 — Prisma configured with prismaSchemaFolder, first migration done ✓

## Current ticket
ARC-004 — Configure Redis connection and BullMQ base queue in NestJS