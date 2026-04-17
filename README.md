# Excelsia ERP

Plataforma financiera gerencial para empresas chilenas. Permite visualizar,
controlar y anticipar la situacion financiera consolidando movimientos bancarios,
informacion tributaria (SII), compromisos y proyecciones.

Sistema multi-tenant con aislamiento estricto de datos por empresa.

## Stack tecnologico

| Capa           | Tecnologia                                      |
| -------------- | ----------------------------------------------- |
| Monorepo       | Nx                                              |
| Frontend       | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend        | NestJS, TypeScript                              |
| Base de datos  | PostgreSQL con Row Level Security (RLS)         |
| ORM            | Prisma (schema dividido por modulo)             |
| Colas/Jobs     | Redis + BullMQ                                  |
| Storage        | MinIO (S3-compatible)                           |
| Auth           | JWT en cookies HttpOnly + Passport.js           |
| Autorizacion   | RBAC + CASL                                     |
| Auditoria      | Triggers PostgreSQL                             |
| Observabilidad | Sentry + OpenTelemetry                          |
| Infra local    | Docker Compose                                  |
| CI/CD          | GitHub Actions                                  |

## Estructura del proyecto

```
apps/
  web/          # Frontend Next.js (BFF layer)
  api/          # Backend NestJS
libs/
  ui/           # Componentes de UI compartidos
  config/       # Configuracion compartida
  types/        # Tipos TypeScript compartidos
  utils/        # Utilidades compartidas
infra/          # Docker, nginx, scripts
docs/           # Documentacion tecnica y ADRs
```

## Requisitos previos

- Node.js >= 20
- npm >= 10
- Docker y Docker Compose (para servicios de infraestructura)

## Como correr en local

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar el frontend (Next.js en http://localhost:4200)
npx nx serve web

# 3. Levantar el backend (NestJS en http://localhost:3000)
npx nx serve api

# 4. Levantar ambos en paralelo
npx nx run-many -t serve -p web api
```

## Comandos utiles

```bash
# Ver grafo de dependencias
npx nx graph

# Ejecutar linting
npx nx run-many -t lint

# Ejecutar tests
npx nx run-many -t test

# Build de produccion
npx nx run-many -t build
```

## Convencion de commits

Ver [COMMITS.md](./COMMITS.md) para la convencion de mensajes de commit.
