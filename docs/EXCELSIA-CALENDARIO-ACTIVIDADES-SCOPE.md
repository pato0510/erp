# Excelsia — Calendario de Actividades (Master Activity Calendar): Scope Capture

**Status:** Scope captured — NOT designed. No data-model or ticket commitments here.
**Date:** 2026-07-09
**Scheduled:** After Marketing V1 closes (next module in the roadmap).
**Origin:** Decided at the Marketing kickoff. The original `/modulos` "Calendario" card is repurposed as the **Marketing** module (MKT-001); the master-calendar ambition becomes its **own future module** with its own card.

---

## 1. Decision record

- The existing "Calendario" card in `/modulos` (previously `href: null, active: false` — a pure placeholder) is repurposed as **Marketing** during MKT-001.
- A **new gated card "Calendario de Actividades"** is added to `/modulos` in the same ticket, as the visible placeholder for this future module.
- This document exists so the founder's stated scope is not lost between modules. Design happens at this module's kickoff, following the standard pattern (recon → data model → tickets).

## 2. What it is (founder's stated intent)

A company-wide **master calendar for internal coordination**:

- Plan activities with the team; run **daily and weekly control**.
- Internal visibility of **each area's status** — what work has been done, what is scheduled.
- Schedule miscellaneous activities of any kind, **including birthdays**.
- **Multiple views** are expected (e.g. month / week / day; possibly per-area lanes).

It is an internal-control instrument first ("saber el estado de cada área"), a scheduling tool second.

## 3. Candidate capabilities (to validate at design time)

- **Manual activities:** title, date or range, area, assignee(s), status (pending / done), notes.
- **Recurring events:** birthdays (yearly) at minimum.
- **Read-only aggregation feeds** from other modules, each one opt-in and independently toggleable:
  - **Operaciones:** operational calendar events (document/permit expirations already exist there).
  - **Marketing:** campaign start/end dates.
  - **RRHH:** birthdays; vacations/absences (availability-safe only — see §5).
  - **Comercial:** `expectedCloseDate` of open opportunities (maybe).
- Filters by area / person / source module; a "what happened this week" digest view for the weekly control use case.

## 4. Explicitly out of scope (this module's V2+)

- External calendar sync (Google / Outlook / iCal).
- Push notifications / reminders engine.
- Mobile app.

## 5. Design flags (record now, resolve at design time)

- **CASL-aware feeds:** cross-module content must be shaped by the _caller's_ ability. RRHH absence **reasons** are MANAGER/ADMIN/SUPER_ADMIN-only (AvailabilitySubject, health-adjacent PII) — the calendar may only surface availability-safe information. The COM-012 reason-free consumption pattern is the precedent. **Money never appears on the calendar** (ANALYST/VIEWER rule holds everywhere).
- **EXPOSE/CONSUME rule:** feeds are read-only exported service methods (DI) or dedicated endpoints — never direct reads of another module's tables; no mutual imports.
- **UI reuse (from MARKETING-RECON M3):** the Operations month-grid calendar _views_ (MonthView etc.) are props-driven and reusable; the `CalendarEventType` union, TYPE_META and backend feed are ops-bound. This module extracts/parameterizes the views and builds its own feed/page.
- **Module shell:** standard COM-001/MKT-001 scaffold — Nest aggregator module, guarded ping controller, CASL default-deny floor per subject, config-driven sidebar, gated card until module close.
- Every new table: RLS + audit trigger + GRANT to `app_user` in the same hand-authored migration; ASCII enum members with display labels in the UI. (Platform invariants, restated for completeness.)

## 6. Kickoff checklist (when this module starts)

1. Read-only recon (same pattern as RRHH / Comercial / Marketing), producing `docs/CALENDARIO-RECON.md`.
2. Data-model design session with the founder (validate §3 against real needs).
3. Ticket plan (`CAL-001`…) with acceptance criteria, serial human-gated flow.
