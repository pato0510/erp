# Excelsia — Calendario de Actividades: Plan Part 1 — Data Model & Design Decisions

**Status:** Validated by founder — 2026-07-15. Source of truth for all CAL tickets.
**References:** `docs/CALENDARIO-RECON.md` (CAL-000 findings), `docs/EXCELSIA-CALENDARIO-ACTIVIDADES-SCOPE.md` (original scope capture), `CLAUDE.md`, `docs/EXCELSIA-CALENDARIO-PLAN-PART2-TICKETS.md`.

---

## 1. Scope

**V1 (this plan):** manual activities on a company-wide calendar (month/week/day views) + a birthdays feed derived live from RRHH + a small configurable area catalog. Route namespace: **`/actividades`** (per recon C1 — avoids the `/marketing/calendario` naming trap).

**Explicitly deferred (V2 backlog):**

- **Unified cross-module feed architecture** (founder's framing: feed the calendar with ALL inputs from the other areas, done once and orderly): Operaciones expirations, Marketing campaign dates, Comercial expected closes, RRHH vacations/absences (availability-safe). V1 proves the pattern with birthdays; V2 generalizes it.
- Stored recurrence for manual activities (weekly meetings etc.). V1: recurring things are created by hand; birthdays need no stored recurrence (derived at read time).
- Optional mapping `AreaRRHH` → activity area (auto-lanes).
- Reminders/notifications; external calendar sync (per the scope doc).

---

## 2. Entities

Two new tables. Both ship RLS policy + audit trigger + GRANT to `app_user` in the same hand-authored migration (platform invariant).

### 2.0 Naming collision (important)

The obvious name `Activity`/`activities` **is taken by Comercial** (the opportunity timeline, COM-009 — past-tense, immutable, system-generated; recon C5 confirmed it must not be reused). This module's entities are therefore **`CalendarActivity` / `calendar_activities`** and **`ActivityArea` / `activity_areas`**. This is deliberate, not stylistic.

### 2.1 `activity_areas` — configurable lane catalog

```prisma
model ActivityArea {
  id        String   @id @default(uuid()) @db.Uuid
  companyId String   @db.Uuid
  name      String
  color     String?  // hex for the lane/chip; the UI offers a palette
  active    Boolean  @default(true)
  createdBy String   @db.Uuid
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  activities CalendarActivity[]

  @@unique([companyId, name])
  @@index([companyId])
  @@map("activity_areas")
}
```

**Semantics:**

- Configurable catalog, managed by MANAGER/ADMIN/SUPER_ADMIN (decision c). AGS creates its three starting lanes ("Operaciones", "Finanzas y Admin", "HSEC") through the config screen — **nothing seeded in production**.
- `DELETE` only when pristine (zero activities); the FK `Restrict` is the DB backstop. Otherwise deactivate via `active` (inactive areas stop appearing in forms; existing activities keep rendering).

**Coexistence doctrine (record for future CC):** `ActivityArea` deliberately coexists with RRHH's fixed `AreaRRHH` enum. They are DIFFERENT concepts — where an employee belongs organizationally (8 fixed values on `Employee.area`) vs. under which lane the company plans activities (small, founder-configurable). AGS's three lanes do not map 1:1 to the eight RRHH areas, and that is fine. **No future ticket unifies them without an explicit founder decision** (same class of trap as the VIEWER↔caja doctrine). Optional mapping is a V2 seed.

### 2.2 `calendar_activities` — the central entity

```prisma
enum ActivityStatus {
  PENDIENTE
  HECHA
  CANCELADA
}

model CalendarActivity {
  id         String         @id @default(uuid()) @db.Uuid
  companyId  String         @db.Uuid
  title      String
  areaId     String         @db.Uuid
  startDate  DateTime       @db.Date
  endDate    DateTime?      @db.Date
  startTime  String?
  assigneeId String?        @db.Uuid
  status     ActivityStatus @default(PENDIENTE)
  notes      String?
  createdBy  String         @db.Uuid
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  area ActivityArea @relation(fields: [areaId], references: [id], onDelete: Restrict)

  @@index([companyId])
  @@index([companyId, startDate])
  @@map("calendar_activities")
}
```

**Semantics:**

- **Dates:** `startDate` required; `endDate` optional and ≥ `startDate` when present (multi-day ranges, decision from Q1). `@db.Date`, UTC-anchored arithmetic end-to-end (HR-004b).
- **`startTime` is WALL-CLOCK time**, stored as a validated `"HH:mm"` string — never a timestamp. A 13:00 lunch is 13:00 in Antofagasta regardless of server timezone; strings avoid every TZ trap and sort lexicographically. **Valid ONLY for single-day activities** (decision f): service rejects `startTime` when `endDate` is set and differs from `startDate`.
- **Status machine** (canonical `PATCH /:id/status`): allowed edges — `PENDIENTE → HECHA`, `HECHA → PENDIENTE` (undo a misclick), `PENDIENTE → CANCELADA`, `CANCELADA → PENDIENTE` (reactivate). Everything else (incl. same-status) rejected per the COM-005 convention.
- **DELETE is always allowed for writers** (decision b, with a confirm dialog in the UI) — this is planning, not a financial record; removing a typo must be one click. Contrast with campaigns deliberately recorded here.
- `assigneeId` is a bare actor UUID (codebase convention; no user-existence lookup beyond `@IsUUID`).
- Creating/editing validates the area: exists, belongs to the company, and is `active`.

---

## 3. Birthdays feed — the single cross-module contract of V1

- **RRHH exposes** a new minimal read: `BirthdayReadService.listForMonth(companyId, month)` → `[{ employeeId, fullName, day, month }]`, derived live from `Employee.birthDate`:
  - **ACTIVO employees only**; employees with null `birthDate` simply do not appear (field is nullable — verified in `rrhh.prisma`).
  - **Day and month only — NEVER year or age** (birthdate is personal data; this is the hard privacy line).
  - No stored recurrence: the derivation IS the recurrence.
- **Actividades consumes** it via DI. Module graph: `ActividadesModule → RrhhBirthdayReadModule (leaf, imports nothing)`. Acyclic by construction, no forwardRef — the established pattern.
- One feed endpoint: `GET /actividades/calendar?month=YYYY-MM` → `{ activities, birthdays }`, month bounds clamped in UTC (the MKT-004 recipe). Birthdays carry no id-linkable RRHH payload beyond the name.
- **Deliberate exposure, founder-signed (decision d):** birthdays (name + day/month of active employees) are visible to ALL roles through this calendar, including ANALYST/VIEWER who cannot read employees in RRHH. The calendar exposes exactly this and nothing more.

---

## 4. CASL matrix (validated — a platform first)

| Subject            | MANAGER / ADMIN / SUPER_ADMIN | ACCOUNTANT | ANALYST  | VIEWER   |
| ------------------ | ----------------------------- | ---------- | -------- | -------- |
| `CalendarActivity` | create/read/update/delete     | read       | **read** | **read** |
| `ActivityArea`     | create/read/update/delete     | read       | **read** | **read** |

- **First module where ANALYST and VIEWER hold read grants** — possible because no money appears anywhere on this surface, and "todos lo ven" is the founder's word (Q4). The default-deny floor still extends over both subjects; read is then re-granted to all six roles, write to MANAGER+ only (last-rule-wins, COM-001 mechanics).
- Frontend gating via `GET /actividades/permissions` + `useCanWrite` pattern; zero role strings.

---

## 5. UI surface

- `/modulos`: the existing "Calendario de Actividades" card gains `href: '/actividades'` but stays gated (`active: false`) until CAL-007 (the COM-015/MKT-010 pattern).
- `/actividades`: calendar page with **three views — Mes (default) · Semana · Día** (Q6). Month reuses the shared MonthView as-is; Week/Day are extracted from Operaciones per recon C2 (lifting the hardcoded `work_permit_scheduled` literal and re-injecting the severity accessor via props) with a **triple Operaciones regression** as its own delicate ticket.
- Chips colored by **area** (catalog color); birthday chips have their own distinguishable style. `CANCELADA` activities are not painted on the calendar (reachable via a filter); `HECHA` renders dimmed with a check (decision e).
- Filters: área, estado. "Nueva actividad" + edit/status/delete actions gated by `canWrite`. Areas config screen under the module (MANAGER+).
- Current design tokens; Spanish labels with accents; ASCII identifiers.

---

## 6. Decision record (founder-validated, 2026-07-15)

- **(a)** Technical name `CalendarActivity`/`calendar_activities` (collision with Comercial's `activities` — no real alternative).
- **(b)** Activity DELETE always allowed for writers, with confirmation (planning tool, not a ledger).
- **(c)** Area catalog managed by MANAGER+.
- **(d)** Birthdays (name + day/month, active employees) visible to all roles — deliberate, founder-signed exposure; never year or age.
- **(e)** CANCELADA hidden from the calendar (filter-accessible); HECHA dimmed with check.
- **(f)** `startTime` only on single-day activities; wall-clock `"HH:mm"`.
- Activity shape: title + dates (single or range) + area + assignee + status + notes (Q1).
- Areas: configurable catalog; AGS starts with Operaciones / Finanzas y Admin / HSEC (Q2).
- Feeds V1: manual activities + birthdays only; unified feed architecture is V2 (Q3, founder's framing).
- Visibility: everyone reads, MANAGER+ writes (Q4). No stored recurrence in V1 (Q5). Three views in V1 (Q6).
