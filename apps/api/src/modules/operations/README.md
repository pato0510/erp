# Operations Module

Multi-tenant operations management for Chilean companies. Tracks assets (equipment + vehicles), documents with expiration, permits, work permits, procedures with signed acknowledgments, alerts, automated blocking, exceptions, calendar, reports, and packaged compliance evidence for audits.

## Quick start for developers

```bash
# 1. Apply migrations (uses prismaSchemaFolder under apps/api/prisma/schema)
npx prisma migrate deploy --schema=apps/api/prisma/schema

# 2. Seed Chilean defaults — one POST per catalog (per-company, requires JWT)
POST /api/operations/document-types/seed-defaults    # 12 docs
POST /api/operations/permit-types/seed-defaults      # external permits
POST /api/operations/work-permit-types/seed-defaults # PT en altura, en caliente, …

# 3. Apply recommended Chilean alert rules
POST /api/operations/alert-rules/apply-recommended-chile
```

After step 3 the module is fully usable for that company. Importing assets / vehicles, uploading documents, and generating QR codes are next-step actions.

## Documentation

| File                                           | What's in it                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| [MODULE_OVERVIEW.md](./MODULE_OVERVIEW.md)     | Architecture, submodule map, key decisions, data flow diagram                         |
| [API_REFERENCE.md](./API_REFERENCE.md)         | Every endpoint with method, path, CASL action, notes                                  |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)       | Auth posture, public endpoint justifications, RLS, manual multi-tenant isolation test |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)           | V2 backlog and tech debt (none of this blocks production)                             |
| [MIGRATION_HISTORY.md](./MIGRATION_HISTORY.md) | Schema timeline, sprint-by-sprint                                                     |

## Health check

```
GET /api/operations/health        → aggregate db / redis / MV / cron / storage status
GET /api/operations/health/crons  → list of every armed BullMQ repeatable
```

Both require JWT but no CASL — point a monitoring service account at them. Returns 200 OK regardless of degraded subsystems; the body's `status` field switches to `degraded` when any check fails.

## Module status

- **Sprints completed:** 8 of 8
- **Tickets completed:** 37 of 37 (OPS-001 through OPS-037)
- **Status:** V1 complete, ready for production
- **Last update:** 2026-04-29 (OPS-037 — module closure)
