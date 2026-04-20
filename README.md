# Excelsia ERP

Plataforma financiera gerencial para empresas chilenas. Permite visualizar,
controlar y anticipar la situación financiera consolidando movimientos
bancarios, información tributaria (SII), compromisos y proyecciones.

Sistema multi-tenant con aislamiento estricto de datos por empresa a nivel
de base de datos (PostgreSQL Row Level Security).

**Para usuarios finales**: ver [docs/USER_GUIDE.md](./docs/USER_GUIDE.md).
**Para deploy a producción**: ver [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
**Para operaciones / troubleshooting**: ver [docs/RUNBOOK.md](./docs/RUNBOOK.md).

---

## Stack tecnológico

| Capa           | Tecnología                                      |
| -------------- | ----------------------------------------------- |
| Monorepo       | Nx                                              |
| Frontend       | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend        | NestJS, TypeScript                              |
| Base de datos  | PostgreSQL 16 con Row Level Security (RLS)      |
| ORM            | Prisma (schema dividido por módulo)             |
| Colas/Jobs     | Redis + BullMQ                                  |
| Storage        | MinIO (S3-compatible)                           |
| Auth           | JWT en cookies HttpOnly + Passport.js           |
| Autorización   | RBAC + CASL                                     |
| Auditoría      | Triggers PostgreSQL                             |
| Rate limiting  | `@nestjs/throttler` (global 100/min)            |
| Hardening      | Helmet (CSP, HSTS, X-Frame-Options)             |
| Observabilidad | Sentry + OpenTelemetry                          |
| Tests          | Jest + @nestjs/testing                          |
| Infra local    | Docker Compose                                  |
| CI/CD          | GitHub Actions                                  |

## Módulos funcionales

Dashboard · Movimientos · Caja · Banco · Tributario (SII) · Conciliación ·
Cierre mensual · Alertas · Reportes · Catálogos · Configuración

## Estructura del monorepo

```
apps/
  web/          # Frontend Next.js (BFF layer)
  api/          # Backend NestJS
libs/
  ui/           # Componentes de UI compartidos
  config/       # Configuración compartida
  types/        # Tipos TypeScript compartidos
  utils/        # Utilidades compartidas
infra/          # Docker, nginx, scripts
docs/           # Documentación operativa
  ├── DEPLOYMENT.md   # Guía de deploy a producción
  ├── RUNBOOK.md      # Troubleshooting y operaciones
  └── USER_GUIDE.md   # Guía para usuarios finales (ES)
```

---

## Quick start para desarrolladores

### Requisitos

- Node.js ≥ 20 (recomendado 20 LTS)
- npm ≥ 10
- Docker + Docker Compose
- 4 GB de RAM libres para los servicios de infraestructura

### 1. Instalar dependencias

```bash
git clone <url-del-repo>
cd erp
npm install
```

### 2. Levantar la infraestructura local (Postgres + Redis + MinIO)

```bash
cp .env.example .env
docker compose up -d
# Espera a que los healthchecks estén OK:
docker compose ps
```

### 3. Aplicar migraciones y cargar datos de prueba

```bash
npx prisma generate --schema=apps/api/prisma/schema
npx prisma migrate dev --schema=apps/api/prisma/schema
npx ts-node apps/api/prisma/seed.ts
```

El seed crea la empresa demo + un usuario admin:

- Email: `admin@excelsia.dev`
- Password: `Admin1234!`

### 4. Levantar los apps

```bash
# Backend (NestJS en http://localhost:3001)
npx nx serve api

# Frontend (Next.js en http://localhost:3000)
npx nx serve web

# Ambos en paralelo
npx nx run-many -t serve -p web api
```

Abre http://localhost:3000 y haz login con las credenciales de arriba.

---

## Comandos útiles

```bash
# Ver grafo de dependencias del monorepo
npx nx graph

# Lint (todos los proyectos)
npx nx run-many -t lint

# Tests del backend (Jest con mocks puros, sin DB real)
npx nx run api:test

# Build de producción
npx nx run-many -t build

# Chequear estado de migraciones
npx prisma migrate status --schema=apps/api/prisma/schema

# Regenerar el Prisma client después de editar un schema
npx prisma generate --schema=apps/api/prisma/schema
```

## Convención de commits

Ver [COMMITS.md](./COMMITS.md) para la convención de mensajes de commit y
naming de ramas.

## Licencia

Propietaria. Todos los derechos reservados.
