# Operations Module — API Reference

Every endpoint exposed by `apps/api/src/modules/operations/`. Generated from the controllers themselves; if a row here drifts from the code, the code wins. Auth column legend:

- **JWT** — `@UseGuards(JwtAuthGuard)`. Cookie-based. Always present unless a row says "public".
- **CASL action** — `@CheckPolicies((a) => a.can(<action>, <Subject>))`. Empty when the endpoint has no `@CheckPolicies` (open to every authenticated user via `read all`).
- **Public** — explicitly anonymous. Only row in this table.

---

## Public

| Method | Path                                | Auth | Notes                                     |
| ------ | ----------------------------------- | ---- | ----------------------------------------- |
| GET    | `/operations/public/asset/:qrToken` | none | Throttled 30/min/IP. Limited public view. |

---

## Health (OPS-037)

| Method | Path                       | Auth | Notes                                                        |
| ------ | -------------------------- | ---- | ------------------------------------------------------------ |
| GET    | `/operations/health`       | JWT  | Aggregate db / redis / MV / cron / storage status.           |
| GET    | `/operations/health/crons` | JWT  | List every armed BullMQ repeatable across operations queues. |

---

## Assets (`/operations/assets`)

| Method | Path                            | CASL          | Notes                                      |
| ------ | ------------------------------- | ------------- | ------------------------------------------ |
| GET    | `/assets`                       | read          | Paginated list.                            |
| GET    | `/assets/blocked`               | read          | Currently blocked assets.                  |
| GET    | `/assets/:id`                   | read          | Full detail with relations.                |
| GET    | `/assets/:id/photo`             | read          | Streams photo bytes.                       |
| GET    | `/assets/:id/status-history`    | read          | Status-change audit.                       |
| POST   | `/assets`                       | create        | New asset.                                 |
| POST   | `/assets/:id/photo`             | update        | Multipart upload, max 2 MB.                |
| POST   | `/assets/:id/evaluate-blocking` | manage        | Re-runs the blocking engine for one asset. |
| POST   | `/assets/:id/force-unblock`     | force-unblock | ADMIN-only override.                       |
| PATCH  | `/assets/:id`                   | update        |                                            |
| DELETE | `/assets/:id`                   | delete        | Soft delete.                               |
| DELETE | `/assets/:id/photo`             | update        |                                            |

### Asset import

| Method | Path                      | CASL   | Notes                     |
| ------ | ------------------------- | ------ | ------------------------- |
| GET    | `/assets/import/template` | read   | XLSX template download.   |
| POST   | `/assets/import/preview`  | create | Validate without writing. |
| POST   | `/assets/import`          | create | Commit.                   |

### Asset QR (OPS-035)

| Method | Path                                              | CASL                    | Notes                      |
| ------ | ------------------------------------------------- | ----------------------- | -------------------------- |
| GET    | `/operations/public/asset/:qrToken/authenticated` | JWT only, company match | Extended view.             |
| POST   | `/assets/:id/qr`                                  | update                  | Idempotent token issuance. |
| POST   | `/assets/:id/qr/regenerate`                       | manage                  | Rotates token (ADMIN).     |
| POST   | `/assets/qr/bulk-generate`                        | manage                  | ADMIN only.                |
| GET    | `/assets/qr/stats`                                | read                    | Counts for AvanzadoTab.    |
| GET    | `/assets/:id/qr.png`                              | read                    | 400×400 PNG.               |
| GET    | `/assets/:id/qr.svg`                              | read                    | Inline SVG.                |
| GET    | `/assets/:id/qr.pdf`                              | read                    | 10cm or 5cm label.         |

---

## Asset types & subtypes (`/operations/asset-types`, `/operations/asset-subtypes`)

| Method | Path                                      | CASL   | Notes                                                               |
| ------ | ----------------------------------------- | ------ | ------------------------------------------------------------------- |
| GET    | `/asset-types`                            | read   |                                                                     |
| GET    | `/asset-types/:id`                        | read   |                                                                     |
| POST   | `/asset-types`                            | create |                                                                     |
| POST   | `/asset-types/:id/apply-vehicle-defaults` | manage | Auto-attach SOAP / PERMCIRC / REVTEC / PADRON for VEHICLE-category. |
| PATCH  | `/asset-types/:id`                        | update |                                                                     |
| DELETE | `/asset-types/:id`                        | delete |                                                                     |
| GET    | `/asset-subtypes`                         | read   |                                                                     |
| GET    | `/asset-subtypes/:id`                     | read   |                                                                     |
| POST   | `/asset-subtypes`                         | create |                                                                     |
| PATCH  | `/asset-subtypes/:id`                     | update |                                                                     |
| DELETE | `/asset-subtypes/:id`                     | delete |                                                                     |

---

## Locations (`/operations/locations`)

Standard CRUD: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`. CASL gates `create`/`update`/`delete` on `LocationSubject`.

---

## Document types & requirements (`/operations/document-types`, `/operations/document-requirements`)

| Method | Path                                      | CASL   | Notes                                                   |
| ------ | ----------------------------------------- | ------ | ------------------------------------------------------- |
| GET    | `/document-types`                         | read   |                                                         |
| GET    | `/document-types/:id`                     | read   |                                                         |
| POST   | `/document-types/seed-defaults`           | manage | Loads the 12 Chilean default doc types.                 |
| POST   | `/document-types`                         | create |                                                         |
| PATCH  | `/document-types/:id`                     | update |                                                         |
| DELETE | `/document-types/:id`                     | delete |                                                         |
| GET    | `/document-requirements`                  | read   |                                                         |
| GET    | `/document-requirements/resolve/:assetId` | read   | Returns resolved (asset > subtype > type) requirements. |
| GET    | `/document-requirements/:id`              | read   |                                                         |
| POST   | `/document-requirements`                  | create |                                                         |
| PATCH  | `/document-requirements/:id`              | update |                                                         |
| DELETE | `/document-requirements/:id`              | delete |                                                         |

---

## Document records (`/operations/documents`)

| Method | Path                                    | CASL      | Notes                                        |
| ------ | --------------------------------------- | --------- | -------------------------------------------- |
| GET    | `/documents`                            | read      | Filters: assetId, status, expiringSoon, etc. |
| GET    | `/documents/compliance`                 | read      | Per-company aggregate.                       |
| GET    | `/documents/pending-review`             | read      | Review queue.                                |
| GET    | `/documents/pending-review/count`       | read      | Sidebar badge.                               |
| GET    | `/documents/history`                    | read      |                                              |
| GET    | `/documents/folder/:assetId`            | read      | Carpeta documental.                          |
| GET    | `/documents/folder/:assetId/export-pdf` | read      | Compliance PDF.                              |
| GET    | `/documents/folder/:assetId/export-zip` | read      | PDF + all docs zipped.                       |
| GET    | `/documents/:id/file`                   | read      | Streams the file blob.                       |
| GET    | `/documents/:id`                        | read      |                                              |
| POST   | `/documents`                            | create    | Multipart upload.                            |
| PATCH  | `/documents/:id`                        | update    |                                              |
| POST   | `/documents/:id/supersede`              | supersede | Replaces with new version.                   |
| POST   | `/documents/:id/archive`                | update    |                                              |
| POST   | `/documents/:id/approve`                | approve   | MANAGER+, uploader ≠ approver.               |
| POST   | `/documents/:id/reject`                 | reject    | Reason required, ≥10 chars.                  |
| POST   | `/documents/:id/resubmit`               | resubmit  | Original uploader only.                      |
| DELETE | `/documents/:id`                        | delete    | ADMIN only.                                  |

---

## Permits & permit types (`/operations/permits`, `/operations/permit-types`)

| Method | Path                          | CASL      | Notes                   |
| ------ | ----------------------------- | --------- | ----------------------- |
| GET    | `/permit-types`               | read      |                         |
| GET    | `/permit-types/:id`           | read      |                         |
| POST   | `/permit-types/seed-defaults` | manage    | Loads Chilean defaults. |
| POST   | `/permit-types`               | create    |                         |
| PATCH  | `/permit-types/:id`           | update    |                         |
| DELETE | `/permit-types/:id`           | delete    |                         |
| GET    | `/permits`                    | read      |                         |
| GET    | `/permits/compliance`         | read      |                         |
| GET    | `/permits/history`            | read      |                         |
| GET    | `/permits/:id`                | read      |                         |
| GET    | `/permits/:id/file`           | read      |                         |
| POST   | `/permits`                    | create    |                         |
| PATCH  | `/permits/:id`                | update    |                         |
| POST   | `/permits/:id/supersede`      | supersede |                         |
| POST   | `/permits/:id/archive`        | update    |                         |
| POST   | `/permits/:id/approve`        | approve   |                         |
| POST   | `/permits/:id/reject`         | reject    |                         |
| POST   | `/permits/:id/resubmit`       | resubmit  |                         |
| DELETE | `/permits/:id`                | delete    | ADMIN only.             |

---

## Work permits (`/operations/work-permits`, `/operations/work-permit-types`)

Catalog: same shape as permit-types (CRUD + seed-defaults).

| Method | Path                                             | CASL      | Notes                          |
| ------ | ------------------------------------------------ | --------- | ------------------------------ |
| GET    | `/work-permits`                                  | read      |                                |
| GET    | `/work-permits/active-count`                     | read      |                                |
| GET    | `/work-permits/in-execution`                     | read      | Sidebar surface.               |
| GET    | `/work-permits/:id`                              | read      |                                |
| GET    | `/work-permits/:id/attachments/:attachmentIndex` | read      | Streams attachment bytes.      |
| POST   | `/work-permits`                                  | create    |                                |
| PATCH  | `/work-permits/:id`                              | update    |                                |
| POST   | `/work-permits/:id/submit`                       | update    | DRAFT → PENDING_AUTHORIZATION. |
| POST   | `/work-permits/:id/authorize`                    | authorize |                                |
| POST   | `/work-permits/:id/reject`                       | reject    |                                |
| POST   | `/work-permits/:id/start`                        | start     | AUTHORIZED → IN_EXECUTION.     |
| POST   | `/work-permits/:id/suspend`                      | suspend   |                                |
| POST   | `/work-permits/:id/resume`                       | resume    |                                |
| POST   | `/work-permits/:id/close`                        | close     | Captures incidentsReported.    |
| POST   | `/work-permits/:id/cancel`                       | cancel    |                                |
| POST   | `/work-permits/:id/gas-measurement`              | update    | LOTO compliance.               |
| POST   | `/work-permits/:id/attachments`                  | update    | Multipart.                     |
| DELETE | `/work-permits/:id/attachments/:attachmentIndex` | update    |                                |

### Approval steps + approvals (multi-step chains)

| Method | Path                                         | CASL    | Notes               |
| ------ | -------------------------------------------- | ------- | ------------------- |
| GET    | `/approval-steps`                            | read    |                     |
| POST   | `/approval-steps/apply-defaults`             | manage  |                     |
| POST   | `/approval-steps/reorder`                    | manage  |                     |
| GET    | `/approval-steps/:id`                        | read    |                     |
| POST   | `/approval-steps`                            | create  |                     |
| PATCH  | `/approval-steps/:id`                        | update  |                     |
| DELETE | `/approval-steps/:id`                        | delete  |                     |
| GET    | `/permit-approvals`                          | read    |                     |
| GET    | `/permit-approvals/pending`                  | read    |                     |
| GET    | `/permit-approvals/pending-counts`           | read    |                     |
| GET    | `/permit-approvals/permit/:permitId`         | read    | Per-permit history. |
| POST   | `/permit-approvals/permit/:permitId/approve` | approve |                     |
| POST   | `/permit-approvals/permit/:permitId/reject`  | reject  |                     |
| POST   | `/permit-approvals/permit/:permitId/skip`    | skip    | ADMIN only.         |

---

## Procedures (`/operations/procedures`, `/operations/acknowledgments`)

| Method | Path                                            | CASL        | Notes                            |
| ------ | ----------------------------------------------- | ----------- | -------------------------------- |
| GET    | `/procedures`                                   | read        |                                  |
| GET    | `/procedures/kpi`                               | read        |                                  |
| GET    | `/procedures/category-counts`                   | read        |                                  |
| GET    | `/procedures/applicable`                        | read        | Per-asset applicable procedures. |
| GET    | `/procedures/:id`                               | read        |                                  |
| GET    | `/procedures/:id/file`                          | read        |                                  |
| GET    | `/procedures/:id/attachments/:attachmentIndex`  | read        |                                  |
| GET    | `/procedures/:id/revisions`                     | read        | Immutable revision history.      |
| POST   | `/procedures`                                   | create      |                                  |
| PATCH  | `/procedures/:id`                               | update      |                                  |
| DELETE | `/procedures/:id`                               | delete      |                                  |
| POST   | `/procedures/:id/submit`                        | review      | DRAFT → IN_REVIEW.               |
| POST   | `/procedures/:id/review`                        | review      |                                  |
| POST   | `/procedures/:id/publish`                       | publish     | MANAGER+.                        |
| POST   | `/procedures/:id/new-version`                   | update      |                                  |
| POST   | `/procedures/:id/deprecate`                     | deprecate   | ADMIN only.                      |
| POST   | `/procedures/:id/attachments`                   | update      |                                  |
| DELETE | `/procedures/:id/attachments/:attachmentIndex`  | update      |                                  |
| GET    | `/acknowledgments/my-pending`                   | acknowledge | Per-user.                        |
| GET    | `/acknowledgments/my-pending-count`             | acknowledge | Sidebar badge.                   |
| GET    | `/acknowledgments/company-coverage`             | read        |                                  |
| GET    | `/acknowledgments`                              | read        |                                  |
| GET    | `/acknowledgments/coverage/:procedureId`        | read        |                                  |
| GET    | `/acknowledgments/user/:userId/coverage`        | read        |                                  |
| POST   | `/acknowledgments/:procedureId/acknowledge`     | acknowledge | Per-user signed read.            |
| POST   | `/acknowledgments/:procedureId/exempt/:userId`  | exempt      | ADMIN only.                      |
| POST   | `/acknowledgments/:procedureId/reapply/:userId` | exempt      | ADMIN only.                      |

---

## Exceptions (`/operations/exceptions`)

| Method | Path                                    | CASL    | Notes                   |
| ------ | --------------------------------------- | ------- | ----------------------- |
| GET    | `/exceptions`                           | read    |                         |
| GET    | `/exceptions/pending-count`             | read    |                         |
| GET    | `/exceptions/active-for-asset/:assetId` | read    |                         |
| GET    | `/exceptions/:id`                       | read    |                         |
| POST   | `/exceptions`                           | create  | Any authenticated role. |
| POST   | `/exceptions/:id/approve`               | approve | ADMIN only.             |
| POST   | `/exceptions/:id/reject`                | reject  | ADMIN only.             |
| POST   | `/exceptions/:id/revoke`                | revoke  | ADMIN only.             |

---

## Alerts (`/operations/alerts/instances`, `/operations/alert-rules`, `/operations/alert-settings`)

| Method | Path                                   | CASL   | Notes                                   |
| ------ | -------------------------------------- | ------ | --------------------------------------- |
| GET    | `/alerts/instances`                    | read   |                                         |
| GET    | `/alerts/instances/:id`                | read   |                                         |
| GET    | `/alerts/instances/active-count`       | read   | Sidebar badge.                          |
| GET    | `/alerts/instances/kpis`               | read   |                                         |
| POST   | `/alerts/instances/bulk-acknowledge`   | manage |                                         |
| POST   | `/alerts/instances/bulk-resolve`       | manage |                                         |
| POST   | `/alerts/instances/:id/acknowledge`    | update |                                         |
| POST   | `/alerts/instances/:id/resolve`        | update |                                         |
| POST   | `/alerts/instances/:id/dismiss`        | manage |                                         |
| POST   | `/alerts/recalculate`                  | manage | Manual recompute trigger.               |
| GET    | `/alert-rules`                         | read   |                                         |
| GET    | `/alert-rules/resolve/:documentTypeId` | read   |                                         |
| GET    | `/alert-rules/:id`                     | read   |                                         |
| POST   | `/alert-rules/apply-recommended-chile` | manage | Loads the recommended Chilean rule set. |
| POST   | `/alert-rules`                         | create |                                         |
| PATCH  | `/alert-rules/:id`                     | update |                                         |
| DELETE | `/alert-rules/:id`                     | delete |                                         |
| GET    | `/alert-settings`                      | read   | Singleton company alert settings.       |
| PATCH  | `/alert-settings`                      | update |                                         |

---

## Notifications (`/operations/notifications`)

Per-user inbox; no CASL (RLS scopes to userId at the DB layer).

| Method | Path                           | Notes                    |
| ------ | ------------------------------ | ------------------------ |
| GET    | `/notifications`               | List with unread filter. |
| GET    | `/notifications/unread-count`  |                          |
| POST   | `/notifications/mark-all-read` |                          |
| POST   | `/notifications/:id/read`      |                          |
| POST   | `/notifications/:id/dismiss`   |                          |

---

## Domain events (`/operations/domain-events`, OPS-032)

| Method | Path                       | CASL   | Notes                     |
| ------ | -------------------------- | ------ | ------------------------- |
| GET    | `/domain-events`           | read   | Paginated audit.          |
| GET    | `/domain-events/stats`     | read   |                           |
| GET    | `/domain-events/:id`       | read   |                           |
| POST   | `/domain-events/:id/retry` | manage | ADMIN only.               |
| POST   | `/domain-events/test`      | manage | Dev/staging emit harness. |

---

## Commitment templates (`/operations/commitment-templates`, OPS-033)

| Method | Path                                                      | CASL   | Notes            |
| ------ | --------------------------------------------------------- | ------ | ---------------- |
| GET    | `/commitment-templates`                                   | read   |                  |
| GET    | `/commitment-templates/estimate/document/:documentTypeId` | read   |                  |
| GET    | `/commitment-templates/estimate/permit/:permitTypeId`     | read   |                  |
| GET    | `/commitment-templates/:id`                               | read   |                  |
| POST   | `/commitment-templates`                                   | manage | MANAGER + ADMIN. |
| PATCH  | `/commitment-templates/:id`                               | manage |                  |
| DELETE | `/commitment-templates/:id`                               | manage |                  |

---

## Dashboard (`/operations/dashboard`, OPS-029 + OPS-034)

Read endpoints intentionally have no CASL — the dashboard must work for every role.

| Method | Path                                | CASL   | Notes                   |
| ------ | ----------------------------------- | ------ | ----------------------- |
| GET    | `/dashboard/overview`               | none   | Headline KPIs.          |
| GET    | `/dashboard/action-items`           | none   | Urgent items banner.    |
| GET    | `/dashboard/upcoming-events`        | none   | 30-day forecast.        |
| GET    | `/dashboard/top-assets-at-risk`     | none   | Risk-scored.            |
| GET    | `/dashboard/recent-activity`        | none   | 6-source merged stream. |
| GET    | `/dashboard/my-tasks`               | none   | Personalized.           |
| GET    | `/dashboard/asset-distribution`     | none   | Donut chart.            |
| GET    | `/dashboard/compliance-by-category` | none   | Bar chart.              |
| GET    | `/dashboard/freshness`              | none   | MV refresh timestamps.  |
| POST   | `/dashboard/refresh-views`          | manage | ADMIN only.             |

---

## Calendar (`/operations/calendar`, OPS-030)

| Method | Path                       | Notes                                      |
| ------ | -------------------------- | ------------------------------------------ |
| GET    | `/calendar/events`         | Range filter, returns multi-source events. |
| GET    | `/calendar/events/by-date` | Single-day grouping.                       |
| GET    | `/calendar/month-summary`  | Heatmap counts.                            |
| GET    | `/calendar/export`         | iCal (.ics) download.                      |

---

## Reports (`/operations/reports`, OPS-031)

| Method | Path                                | Notes         |
| ------ | ----------------------------------- | ------------- |
| POST   | `/reports/asset-compliance`         | XLSX.         |
| POST   | `/reports/activity`                 | XLSX.         |
| POST   | `/reports/acknowledgment-coverage`  | XLSX.         |
| POST   | `/reports/alerts-history`           | XLSX.         |
| POST   | `/reports/work-permits`             | XLSX.         |
| GET    | `/reports/preview/asset-compliance` | JSON preview. |
| GET    | `/reports/preview/activity`         | JSON preview. |

---

## Audit packages (`/operations/audit`, OPS-036)

| Method | Path                           | CASL       | Notes                  |
| ------ | ------------------------------ | ---------- | ---------------------- |
| POST   | `/audit/generate-package`      | create     | MANAGER + ADMIN.       |
| GET    | `/audit/packages`              | read       | Paginated history.     |
| GET    | `/audit/packages/:id`          | read       |                        |
| GET    | `/audit/packages/:id/download` | read       | Streams ZIP.           |
| POST   | `/audit/validate-package`      | read       | Multipart, max 100 MB. |
| GET    | `/audit/compliance-snapshot`   | read       | KPI bar data.          |
| GET    | `/audit/legal-framework`       | none (JWT) | Static legal data.     |

---

## Fleet vehicles (`/operations/fleet/vehicles`)

| Method | Path                              | CASL   | Notes                                |
| ------ | --------------------------------- | ------ | ------------------------------------ |
| GET    | `/fleet/vehicles`                 | read   |                                      |
| GET    | `/fleet/vehicles/:id`             | read   |                                      |
| POST   | `/fleet/vehicles`                 | create | Asset type must be VEHICLE category. |
| PATCH  | `/fleet/vehicles/:id/kilometers`  | update | Validates non-decreasing odometer.   |
| PATCH  | `/fleet/vehicles/:id`             | update |                                      |
| DELETE | `/fleet/vehicles/:id`             | delete |                                      |
| GET    | `/fleet/vehicles/import/template` | read   | XLSX.                                |
| POST   | `/fleet/vehicles/import/preview`  | create | Validates without writing.           |
| POST   | `/fleet/vehicles/import`          | create | Commit.                              |
