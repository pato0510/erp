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

## Current sprint

Sprint 8 — Monthly closing and hardening

## Current ticket

SEC-001 — Security hardening and production checklist

## Completed tickets (add to Sprint 8 section)

### Sprint 8 — Hardening (in progress)

CLS-001 — Monthly closing process ✓
