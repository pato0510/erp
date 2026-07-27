# Excelsia — HSEC V1: Plan PART 2 — Tickets

**Status:** Validated by founder — 2026-07-27. Serial execution, one CC run
per ticket, live validation embedded, STOP on failure (fixes are separately
approved tickets). Every prompt begins with the verbatim CLAUDE.md/no-git
line. References: PART1 (the model), `docs/HSEC-RECON.md` (the boundary).

### HSEC-001 — Module shell (card gated, CASL floor, placeholders)

Card gains `href: '/hsec'`, keeps `active: false` (+ dated shell comment —
COM/MKT/CAL pattern step 1). `HsecSidebar` + `startsWith('/hsec')` branch.
Placeholder pages for the five routes (Terminal Noir). Backend
`modules/hsec` skeleton registered. CASL: five subject classes,
`HSEC_SUBJECTS` array, type-union + AppAbility additions, default-deny floor
in MANAGER/ACCOUNTANT/VIEWER/ANALYST branches, MANAGER full re-grant on all
five (the matrix is uniform — grants land now). NO tables, NO migration.
**AC:** ability spec pasted (manager can create HsecIncident; accountant/
analyst/viewer cannot read it; admin manages); placeholders reachable by
direct URL as manager; card click still inert + badge present (diff quoted);
builds green.

### HSEC-002 — Incidents backend core

Migration `hsec_incidents` (RLS + trigger + GRANT — SQL quoted vs template).
Numbering `INC-{YYYY}-{0000}` per company, transaction-safe (orderNumber
precedent). CRUD + PATCH /:id/status with the PART1 §3 machine. Free edit any
status; DELETE for writers. All endpoints `@CheckPolicies`.
**AC:** full machine matrix (legal edges 2xx, illegal + same-status 400
verbatim); numbering evidence (two creates → 0001/0002); curls as manager
(2xx) AND accountant (403 — the floor is live); `createdBy` from JWT proven
(spoofed DTO field ignored); migration SQL verbatim.

### HSEC-003 — RRHH roster leaf + afectados

`RrhhEmployeeReadModule` leaf per PART1 §4 with the SIGNED header
(2026-07-27): `listActiveLite` + `resolveNamesByIds`, two-key structural
contract. Migration `hsec_incident_persons` (RLS + trigger + GRANT, CASCADE,
unique pair). Nested endpoints GET/POST/PATCH/DELETE under
/hsec/incidents/:id/persons gated `HsecIncidentPerson`. `GET /hsec/roster`
gated `read HsecIncident`. Incident detail embeds persons with names
resolved via the leaf.
**AC:** leaf module file pasted (no imports array); structural key proof
`["employeeId","fullName"]` on both methods' output; persons CRUD as
manager; duplicate person 409; incident delete cascades persons to zero
(count evidence) with audit rows present; a DESVINCULADO fixture still
resolves its name via `resolveNamesByIds`.

### HSEC-004 — Attachments + severity notification

Incident `attachments` (max 5) upload/download mirroring the WorkPermit
convention + `storeFile` blob fallback (copy-adapt, cited). GRAVE|FATAL
notification per PART1 decision 7 (create as GRAVE|FATAL, or edit INTO it;
staying GRAVE never re-notifies).
**AC:** upload/download roundtrip; 6th attachment 400 verbatim; blob-fallback
log line with storage unconfigured; `user_notifications` row pasted for an
admin after a GRAVE create; LEVE create → no row; LEVE→GRAVE edit → row;
GRAVE edit staying GRAVE → no second row.

### HSEC-005 — Incidents frontend

`/hsec/incidentes`: list (filters estado/tipo/severidad + date range —
server `?status`, rest client-side over the fetched set, Gestión precedent),
create/edit modal (afectados picker via /hsec/roster, occurredTime as "HH:mm"
input), detail with status dropdown showing ONLY legal targets, attachments
UI, afectados section with injury fields. Backend 4xx verbatim inline.
**AC:** founder click-through script (create → afectado → attach photo →
GRAVE → admin sees the notification → investigate → close → reopen); machine
dropdown never offers an illegal edge.

### HSEC-006 — Trainings backend

Migration `hsec_trainings` + `hsec_training_attendees` (both tables, one
migration, full template each). CRUD + attendee add/remove; single inline
file (Procedure-shaped columns) upload/download; free edit/delete.
**AC:** attendee duplicate 409; training delete cascades attendees (count);
file roundtrip; role floor curls (manager 2xx / viewer 403); migration SQL
verbatim ×2 tables.

### HSEC-007 — Trainings frontend

`/hsec/capacitaciones`: list with type/date filters + per-employee filter
(attendee-based), create/edit with roster multi-select + planilla upload,
detail with attendee names (leaf-resolved).
**AC:** founder click-through (charla with 5 asistentes + scanned planilla);
removing an attendee updates live; filters behave.

### HSEC-008 — EPP backend

Migration: `hsec_epp_items` + `hsec_epp_deliveries` + `hsec_epp_delivery_lines`
(template ×3). Seed-defaults endpoint (idempotent upsert on
`companyId_name`, OPS-004 pattern) with the 8-item Chilean catalog: casco,
lentes de seguridad, guantes, calzado de seguridad, chaleco reflectante,
protector auditivo, respirador, arnés. Items: inactivate-not-delete when
used (Restrict as DB backup); pristine delete allowed. Deliveries + lines
CRUD; `quantity > 0` 400 verbatim; inline acuse file.
**AC:** seed called twice → same 8 rows (idempotence evidence); delete of a
used item 409 → inactivate path works; delivery with 3 lines roundtrip;
quantity 0 → 400 verbatim; migration SQL verbatim ×3.

### HSEC-009 — EPP frontend

`/hsec/epp`: deliveries list (per-employee filter) + create/edit with item
lines (item select, cantidad, talla) + acuse upload. `/hsec/configuracion`:
EPP catalog tab (CRUD + activate/inactivate + "Cargar catálogo chileno"
seed button).
**AC:** founder click-through (seed the catalog → deliver 4 items to an
employee → attach acuse → filter by that employee).

### HSEC-010 — Dashboard

`/hsec` landing: current-month counts derived LIVE at read time —
incidentes by severity and type, capacitaciones held, entregas made —
rendered as clickable cards landing on the pre-filtered lists (CAL-013
pattern). ZERO stored rollups, ZERO cron.
**AC:** counts match fixtures; creating an incident moves the count with no
job run (derivation proof); each card click lands filtered.

### HSEC-011 — Module close

Role QA walkthrough (manager full loop; accountant/analyst/viewer: card
visible but every /hsec API 403s — house convention, APIs are the gate).
Card flips `active: true` + dated un-gating comment (pattern step 2).
CLAUDE.md gains the HSEC block: the matrix VERBATIM, decisions 4/6/8/9, the
leaf inventory addition, V2 seeds; Próximos pasos updated; preservation
grep. Manual de HSEC joins the pending-manuals list (Comercial precedent).
**AC:** founder walkthrough script per role; card diff quoted; CLAUDE.md
region verbatim + preservation proof.
