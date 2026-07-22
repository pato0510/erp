# Excelsia — Actividades: Vista Gestión — Increment Plan (Decisions, Model Deltas & Tickets)

**Status:** Validated by founder — 2026-07-21. Source of truth for CAL-008..CAL-010.
**References:** `docs/EXCELSIA-ACTIVIDADES-GESTION-SCOPE.md` (origin),
`docs/EXCELSIA-CALENDARIO-PLAN-PART1-DATAMODEL.md` (base model), `CLAUDE.md`.

---

## 1. Decision record (founder-validated, 2026-07-21)

1. **One date, reinterpreted.** No new `dueDate` column. "La fecha de la
   actividad" is when it happens or when it is due, by nature. Derived rule:
   **`fechaCierre = endDate ?? startDate`** (a range is due when it ends).
   Tasks render on the calendar on their due day — useful, not noise.
2. **Fourth status: `EN_EJECUCION`.** Free movement among PENDIENTE ↔
   EN_EJECUCION ↔ HECHA (all six directed edges, including the
   PENDIENTE→HECHA shortcut for small tasks); CANCELADA reachable from
   PENDIENTE and EN_EJECUCION; CANCELADA → PENDIENTE stays. HECHA ↔
   CANCELADA stays rejected; same-status rejected. Calendar chips paint
   EN_EJECUCION like PENDIENTE — the distinction lives in the Gestión table.
3. **"Atrasado" is DERIVED, never stored** (pre-committed doctrine):
   `overdue = fechaCierre < today(America/Santiago) AND STATUS IN (PENDIENTE, EN_EJECUCION)` - "today" is the CHILEAN calendar date (CHILE_IVA_RATE-class constant; per-company timezone = V2 seed), so task due today never paints red while the founder's day is still alive. **Due TODAY is NOT overdue** (strict `<`). Computed
   server-side at read time; the UI only paints it.
4. **Single responsable** this increment (the accountable owner — consistent
   with the module's original Q1). Companions live in the bitácora. Multiple
   assignees = V2 seed (a full M2M).
5. **FOUNDER-SIGNED EXPOSURE (members):** a members-lite read returning ONLY
   `{ userId, displayName }` for the caller's company, gated
   `read CalendarActivity` (all six roles — every reader of the table must
   resolve names). Never email, role, or status. Structural line, like
   birthdays.
6. **Bitácora (FOUNDER-SIGNED, immutable):** append-only dated entries per
   activity (author + timestamp automatic), the Comercial-timeline
   discipline. No edit, no delete — a typo gets a correcting entry. The
   existing `notes` field remains as static description.
   - **REVERSAL (founder, 2026-07-22, CAL-012):** the immutability above is
     REVERSED — after being counseled twice (original design 2026-07-21; a
     grace-window alternative offered and declined 2026-07-22), the founder
     chose FREE editing/deletion: any activity writer may edit or delete any
     entry, forever (`updatedAt` nullable + PATCH/DELETE note endpoints). The
     platform audit trigger is the forensic layer — every UPDATE/DELETE keeps
     the prior content in `audit_logs`. The original decision above is kept for
     history; this reversal supersedes it.
7. **The Gestión view** replaces the sheet's date-blocks with living
   filters: default shows open items (PENDIENTE + EN_EJECUCION) sorted by
   fecha de cierre asc with overdue floating on top; quick filters
   **Atrasadas** and **Esta semana** (cierre within the current week — the
   Monday meeting IS that filter) plus área / responsable / estado;
   hechas/canceladas reachable by filter.

## 2. Model deltas

### 2.1 Enum extension (migration — the only schema-shape landmine)

`ALTER TYPE "ActivityStatus" ADD VALUE 'EN_EJECUCION' BEFORE 'HECHA';`

- PG16 allows ADD VALUE inside the migration transaction, but the new value
  CANNOT be USED in the same transaction — this migration adds and stops (no
  UPDATE/INSERT using it). Prisma enum updated to the same order.

### 2.2 New table `calendar_activity_notes` (the bitácora)

```prisma
model CalendarActivityNote {
  id         String   @id @default(uuid()) @db.Uuid
  companyId  String   @db.Uuid
  activityId String   @db.Uuid
  authorId   String   @db.Uuid   // bare actor UUID; display via members map
  text       String              // non-empty
  createdAt  DateTime @default(now())

  activity CalendarActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([activityId])
  @@map("calendar_activity_notes")
}
```

- Immutable: NO `updatedAt`, NO update/delete endpoints. CASCADE with the
  activity (delete-any-status now cascades its log — accepted: deleting the
  activity deletes its history, decision b's spirit).
- RLS + audit trigger + GRANT in the same hand-authored migration (template).
- `CalendarActivity` gains the `notes CalendarActivityNote[]` relation
  (lands together with the table — no deferral needed this time).

### 2.3 Derived fields (read-time, list AND detail payloads)

`dueDate` (= endDate ?? startDate) and `overdue` (per §1.3). No stored
columns, no cron.

### 2.4 Members-lite endpoint

`GET /actividades/members` → `[{ userId, displayName }]`, company-scoped,
`@CheckPolicies (read, CalendarActivity)`. `displayName` follows the
existing User display convention (CC reports which fields the User model
carries and the convention chosen; fallback: name → email local-part).
Service header carries the founder signature (2026-07-21) and the
structural line.

## 3. Surface changes

- **List endpoint** gains `assigneeId` filter + the derived fields +
  `latestNote { text, createdAt } | null` and `notesCount` per row (small
  volumes; efficient query).
- **Bitácora endpoints:** `GET /actividades/activities/:id/notes` (desc)
  gated `read CalendarActivity`; `POST` gated `update CalendarActivity`
  (writers only). NO new CASL subject — notes are part of the activity.
- **Activity modal** (calendar + gestión): gains the Responsable select
  (members) — resolving the CAL-005 omission — and the bitácora (entries
  with author name + date, append box for writers, zero edit/delete
  affordances).
- **Sidebar** gains **Gestión** (`/actividades/gestion`): table Tarea ·
  Área · Responsable · Fecha cierre · Estado (INLINE dropdown per the
  machine, gated canWrite) · Atrasado badge (derived, automatic) · última
  observación (truncated) + count; filters and defaults per §1.7. Row
  click → the extended modal.
- Calendar feed: EN_EJECUCION flows automatically (only CANCELADA was ever
  excluded) — verified, not assumed.

## 4. Tickets

### CAL-008 — Backend foundations: status, derived overdue, members

Migration (enum ADD VALUE, per §2.1 caveat — apply locally). Machine
updated to the §1.2 edges. Derived `dueDate`/`overdue` in list + detail.
`assigneeId` filter. Members endpoint per §2.4 with the signed header.
Feed verified to include EN_EJECUCION.
**AC:** full new machine matrix (all six free edges pass; HECHA↔CANCELADA
and same-status still 400); overdue flips proven around the boundary
(cierre = ayer → true; cierre = HOY → false; hecha con cierre pasado →
false); a range uses endDate as cierre; members JSON as VIEWER pasted with
structural key proof `["displayName","userId"]`; no CASL changes; roles
regression on status edges.

### CAL-009 — Bitácora: migration + append/list + modal integration

Migration `calendar_activity_notes` per §2.2 (+ RLS/audit/GRANT, CASCADE).
Endpoints per §3. Modal gains the log AND the Responsable select (members)
in the form.
**AC:** append as MANAGER shows author name resolved via members; entries
immutable (no PATCH/DELETE routes exist — proven); VIEWER GET notes 200 /
POST 403; empty-text 400; activity delete cascades its notes (evidence);
RLS + audit on the new table; latestNote/notesCount appear in the list
payload.

### CAL-010 — Vista Gestión + increment close

The `/actividades/gestion` page per §1.7 and §3; sidebar item; CLAUDE.md
addendum to the Actividades block (new status + derived-overdue doctrine +
the two signed exposures + the Gestión view) and Próximos pasos update
(Vista Gestión → done; ADD V2 seed: multiple assignees; keep everything
else intact with preservation proof).
**AC:** founder walkthrough = the Monday simulation (create real-ish tasks
with cierres, watch Atrasado paint itself, inline status changes, the Esta
semana filter, a bitácora exchange); viewer@ sees the full table + log,
zero affordances; CLAUDE.md region verbatim + preservation grep.

## 5. V2 seeds (record only)

Multiple assignees (M2M) · note correction/deletion policy · overdue
reminders/notifications · export of the weekly view.
