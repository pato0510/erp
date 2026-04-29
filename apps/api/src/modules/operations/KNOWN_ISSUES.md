# Known Issues / V2 Improvements — Operations Module

Consolidated backlog of items deferred during Sprints 1–8. None of these are bugs that block production for AGS Solutions; they are improvements that would be picked up in a V2 pass.

---

## From OPS-034 (Materialized Views)

- [ ] Emit more granular events for selective MV refresh — today only `asset.blocked/unblocked`, `document.renewal-imminent`, `permit.renewal-imminent`, and `work-permit.closed` trigger throttled refreshes. Adding `document.approved`, `alert.created`, and `exception.granted/expired` would shrink the dashboard's worst-case staleness window.
- [ ] Extend `mv_compliance_by_category` with `expiringSoon` / `expired` / `missing` columns. Today the dashboard's `getComplianceByCategory` falls back to live computation because the MV doesn't carry the granular breakdown.
- [ ] Replace the company-summary fallback (`> 2 h staleness ⇒ live`) with a synchronous MV refresh kicked off by the read path, capped at 1 / minute / company.

## From OPS-035 (QR codes)

- [ ] Public asset page should optionally upgrade to the authenticated view when a session cookie is present (today the upgrade requires the user to navigate to the dashboard via "Iniciar sesión").
- [ ] Public asset photo — requires a separate public photo endpoint with its own rate limit and a watermark to discourage scraping.
- [ ] Replace the inline triangle / wordmark in the PDF label with a real Excelsia logo asset (currently drawn with PDFKit primitives).
- [ ] Cron to clean up `qrLastScannedAt`/`qrScanCount` for soft-deleted assets so the AvanzadoTab stats stay accurate.

## From OPS-036 (Audit packages)

- [ ] Multi-select for `locationIds` and `assetTypeIds` in the package generator UI (today the page sends "all"; the backend already accepts arrays).
- [ ] `AssetComplianceReportGenerator` filter should accept `string[]` for asset type / location instead of singular ids (the orchestrator picks `[0]` today).
- [ ] Extract the `apps/web/src/app/(dashboard)/operaciones/auditoria/page.tsx` sub-components (~1100 lines) into the `apps/web/src/components/operations/audit/` folder for testability.
- [ ] BullMQ cron for cleanup of expired audit packages (>1 year `expiresAt`).
- [ ] Async generation via BullMQ + WebSocket progress + email notification when ready (large companies can take 60s+ today, blocking the request).
- [ ] Validator endpoint should also re-derive the `dataSnapshot` from a fresh count and surface deltas vs. the manifest's snapshot.

## From OPS-037 (Closure)

- [ ] ~30 pre-existing `Forbidden non-null assertion` lint warnings remain in `operations-calendar.service.ts`, `operations-dashboard.service.ts` (`getUpcomingEvents`), `work-permits.generator.ts`, and a couple of other generators. Each is an upstream-`.filter()`-guarded reference TS can't narrow across closures. Refactor pass would flatten or use type predicates.
- [ ] `_userId` and similar underscore-prefixed unused parameters in `work-permits.generator.ts` and `operations-listeners.service.ts` — remove or convert to ESLint comment.
- [ ] Extract a `WithRls` decorator that enforces `executeWithRls` is called inside service methods that take `(companyId, userId)` (suggested in SECURITY_AUDIT.md).
- [ ] Add an integration test that fails CI if any new controller adds a write endpoint without `@CheckPolicies`.
- [ ] Tighten the `app_user` Postgres role to remove `BYPASSRLS` once migrations are routed through a separate migrator account.

## Carryovers from earlier sprints (consolidated from CLAUDE.md history)

### Reports (OPS-031)

- [ ] Searchable autocomplete dropdowns instead of UUID text inputs.
- [ ] Cross-screen links from reports to source records.
- [ ] Historical re-download of previously generated reports (today reports stream and disappear).

### Document control & procedures

- [ ] Pre-loaded document templates per industry (PT en altura, en caliente, espacio confinado).
- [ ] Inline PDF editor that produces the file directly without an external upload.
- [ ] Word / Google Docs integration for procedure authoring.
- [ ] AI assistant for drafting procedures from a free-text brief.
- [ ] OCR for paper documents uploaded as images.
- [ ] Native electronic signature integration (today the acknowledgment uses a SHA-256 of timestamp + content; legal teams sometimes want certificate-backed signatures).

### Cross-cutting

- [ ] Bitemporal modeling (valid-time + transaction-time) for advanced "what did this look like on date X?" audit queries.
- [ ] PWA with offline sync for field operations.
- [ ] Mobile app dedicated to QR scanning + photo upload + work-permit close.

## Architecture debt

- [ ] `AlertEngine.processCompany` runs companies sequentially in the daily cron — could parallelize with a configurable concurrency cap.
- [ ] Domain-event handlers in Finance only log; they don't emit metrics or push to Sentry on failure.
- [ ] No retry logic for failed event handlers beyond the 15-minute cron — exponential backoff and dead-letter queue would be cleaner.
- [ ] `StorageService` MinIO connection pool isn't bounded; under load a runaway upload loop could exhaust file descriptors.
- [ ] `MaterializedViewsService.refreshThrottled` uses an in-process Map for the throttle window — multi-instance deploys (Railway scales horizontally) could double-fire on event bursts. Move to Redis SETNX.

## Documentation debt

- [ ] No OpenAPI / Swagger schema is generated yet. NestJS supports `@nestjs/swagger`; adoption would auto-publish API_REFERENCE.md from the source.
- [ ] No diagrams (sequence / ER) under `docs/`. The textual descriptions in MODULE_OVERVIEW are useful but a rendered diagram would help onboarding.
