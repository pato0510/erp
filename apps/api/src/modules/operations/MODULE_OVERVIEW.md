# Operations Module — Overview

## Purpose and scope

The Operations module is the asset-and-compliance backbone of Excelsia ERP. It manages every physical thing a Chilean company operates (equipment, vehicles, infrastructure), the documents and permits that keep those assets legal, the procedures their staff must read, the alerts and bloqueos that fire when paperwork lapses, and the audit trail that proves to a labor inspector or ISO certifier that the company has been doing the right thing.

It is multi-tenant from the database up: every row carries a `companyId`, RLS enforces isolation in PostgreSQL, and every controller pulls the caller's company from a JWT-derived header before touching data.

## Submodules

| Folder                                       | Responsibility                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assets/`                                    | Universal `OperationalAsset` (equipment AND vehicles), import wizard, photos, QR codes (OPS-035).                                                                        |
| `asset-types/`                               | Catalog of asset types and subtypes; auto-applies the Chilean vehicle pack (SOAP / PERMCIRC / REVTEC / PADRON) for VEHICLE-category types.                               |
| `locations/`                                 | Hierarchical site catalog (faena → planta → área).                                                                                                                       |
| `fleet/`                                     | Vehicle-specific extension (license plate, VIN, kilometers, fuel type) on top of `OperationalAsset`.                                                                     |
| `document-types/` + `document-requirements/` | Document catalog and the matrix that says "asset X must have docs Y". Resolution is asset > subtype > type (most specific wins).                                         |
| `document-control/`                          | DocumentRecord lifecycle: upload → review → approve / reject / supersede / archive. Asset-folder export (PDF + ZIP).                                                     |
| `permits/`                                   | External operational permits (Patente Municipal, Autorización Sanitaria, RCA, …). Includes work permits (Permisos de Trabajo) and multi-step approval chains.            |
| `procedures/`                                | Procedure library + acknowledgment workflow with cryptographically signed reads (SHA-256).                                                                               |
| `procedures/acknowledgments/`                | Per-user, per-procedure acknowledgment tracking with reminder + expiration crons.                                                                                        |
| `exceptions/`                                | Temporary exceptions that allow a blocked asset to operate with a justification and a vigencia. ADMIN-only approval.                                                     |
| `alerts/`                                    | Alert rules + per-instance alerts + escalation + automatic asset blocking when a critical document expires.                                                              |
| `notifications/`                             | Per-user inbox; written to by alerts, escalations, and ad-hoc producers. RLS adds a per-user filter on top of the per-company one.                                       |
| `events/`                                    | Domain event bus (OPS-032) that broadcasts operations events (`asset.blocked`, `document.renewal-imminent`, `work-permit.closed`, …) to Finance and other listeners.     |
| `commitment-templates/`                      | Cost templates that drive auto-creation of cashflow commitments when a document or permit is about to expire (OPS-033).                                                  |
| `dashboard/`                                 | Operations landing-page aggregator (OPS-029) with materialized views (OPS-034) for read performance.                                                                     |
| `calendar/`                                  | Month / week / day / list views over expirations, alerts, work permits, acknowledgments. iCal export.                                                                    |
| `reports/`                                   | 5 Excel report generators (OPS-031): asset compliance, activity stream, ack coverage, alerts history, work permits.                                                      |
| `audit/`                                     | Cryptographically signed audit packages with manifest + cover PDF + legal framework PDF (OPS-036). Distinct from `/modules/audit/` which queries PG-trigger row history. |
| `health/`                                    | Module-level health endpoint aggregating db / redis / MV / cron / storage checks (OPS-037).                                                                              |

## Dependencies

Operations depends on:

- **Common:** `PrismaModule`, `RlsModule`, `CaslModule`, `StorageModule`, `JwtAuthGuard`, `PoliciesGuard`, `@CurrentCompany` / `@CurrentUser` decorators.
- **IAM:** for `JwtStrategy`, role lookup via `Membership`.
- **Jobs:** BullMQ queue constants registered globally for cron + worker processors.
- **Finance** (downstream listener, not import): `OperationsListenersService` listens to operations domain events and creates cashflow commitments.

Operations is consumed by:

- **Finance** (read-only: emits domain events that Finance handlers turn into commitments).
- **Frontend** (Next.js BFF) at `/operaciones/*` and the public scan at `/p/asset/[token]`.

## Key architectural decisions

1. **One asset, two faces.** `OperationalAsset` is the universal table; `Vehicle` is a 1:1 extension with vehicle-only columns. The frontend renders different fichas (equipos vs. vehiculos) but the underlying asset, document, alert, and permit logic is shared.
2. **Hierarchies via self-referencing FK.** `parentAssetId` on `operational_assets` and `parentLocationId` on `locations`. Walks are bounded in the UI (depth ≤ 4) to avoid pathological recursion.
3. **Document supersession is immutable.** Approved records are never edited. A new upload supersedes the old one (`supersededByDocumentId` link) and the prior row is marked `REPLACED` and excluded from compliance.
4. **Domain events are persisted before broadcast.** OPS-032 writes every event to `domain_events` with idempotency on `(companyId, eventType, aggregateId, occurredAt)` BEFORE calling `EventEmitter2.emitAsync`. Failed handlers retry via a 15-minute cron.
5. **Materialized views power the dashboard.** OPS-034 introduced 4 MVs that pre-compute the heaviest aggregates. Read paths fall back to live queries when the MV is empty or stale (>2h).
6. **Cryptographic audit packages.** OPS-036 ships every dashboard / inspection check with a SHA-256 manifest of every file plus a master signature. The validate endpoint can prove a package wasn't tampered with after the fact.
7. **QR public scan.** OPS-035 issues 32-char base64url tokens per asset. The scan endpoint is the only public one in the module, rate-limited to 30/min/IP, returning a deliberately limited view.

## Data flow

```
                            [ Frontend ]
                                  ↓
                           [ NestJS Controller ]
                                  ↓ JwtAuthGuard
                                  ↓ PoliciesGuard (CASL)
                                  ↓ extract companyId from x-company-id
                                  ↓
                              [ Service ]
                                  ↓
                       executeWithRls(companyId, userId)
                                  ↓
                           SET LOCAL rls.company_id
                           SET LOCAL audit.user_id
                                  ↓
                              [ Prisma ]
                                  ↓
                             [ PostgreSQL ]
                          ↙               ↘
                    RLS policy         Audit trigger
                  (per-row scope)    (writes audit_logs)

When the service mutates an "interesting" row, it ALSO calls
DomainEventsService.emit(...) which:
                                  ↓
                       INSERT INTO domain_events (status=PENDING)
                                  ↓
                       emitter.emitAsync(eventType, payload)
                          ↙               ↘
              [ Finance listener ]   [ Other future listener ]
                          ↓
                  Auto-commitment created in Finance,
                  domain_events.status = PROCESSED
```

## Module structure on disk

```
apps/api/src/modules/operations/
├── README.md                  ← entry-point doc
├── MODULE_OVERVIEW.md         ← this file
├── API_REFERENCE.md           ← every endpoint
├── SECURITY_AUDIT.md          ← auth / RLS / isolation
├── KNOWN_ISSUES.md            ← V2 backlog
├── MIGRATION_HISTORY.md       ← schema evolution
├── operations.module.ts       ← Nest aggregator
├── alerts/
├── assets/
├── asset-types/
├── audit/                     ← OPS-036 packaged compliance evidence
├── calendar/
├── commitment-templates/
├── dashboard/                 ← OPS-029 + OPS-034 (materialized views)
├── document-control/
├── document-requirements/
├── document-types/
├── events/                    ← OPS-032 domain bus
├── exceptions/
├── fleet/
├── health/                    ← OPS-037 module health
├── locations/
├── notifications/
├── permits/
├── procedures/
└── reports/
```
