# Excelsia — Actividades: Vista Gestión (Weekly Management View) — Scope Capture

**Status:** Scope captured — NOT designed. No data-model or ticket commitments here.
**Date:** 2026-07-20
**Scheduled:** First increment of the Actividades module AFTER V1 closes (CAL-007).
**Origin:** The founder's real weekly management spreadsheet (AGS), reviewed row by row on 2026-07-20. AGS runs a weekly progress meeting over a shared sheet (Tarea · Responsable · Fecha Cierre · Estado · Observaciones, grouped in dated blocks like "LUNES 20 DE JULIO"). The founder wants this practice to live inside the Actividades module instead of the sheet: a sidebar view to manage activities as a review table.

---

## 1. Anatomy of the current practice (observed in the real sheet)

- **Tarea:** short free-text titles; a mix of scheduled work and deadline-style commitments.
- **Responsable:** informal person names; sometimes MULTIPLE per task ("Sergio/Miguel / Christian"); sometimes empty.
- **Fecha Cierre:** a DUE/commitment date, not a scheduled calendar date; precision varies (exact dates, "Semana 26", empty).
- **Estado:** manual dropdown — observed values "En Ejecución" (blue) and "Atrasado" (red), plus empty. "Atrasado" is flipped BY HAND today.
- **Observaciones:** free text used both as context and as a dated progress log ("LP: 21/07 entrega de diagnóstico", "Se agenda reunión para Martes 10:00").
- **Weekly rhythm:** rows are grouped under date headers; the meeting walks the open items.

## 2. What Actividades V1 already covers

Activities with title/area/dates/status (PENDIENTE·HECHA·CANCELADA), the list endpoint with status/area/date filters, the areas catalog, the status machine, notes, and `assigneeId` in the model/API (form-omitted in V1 for lack of a writer-readable members endpoint).

## 3. The deltas this view needs (design-session material, NOT decided)

- **A review-table UI** in the module sidebar ("Gestión"): columns ≈ the sheet's, inline status change, filters, and some grouping suited to the weekly meeting (by week? by area? by responsable? — session decision).
- **Estado model:** likely a fourth member EN_EJECUCION (ASCII-safe) between PENDIENTE and HECHA. Session decision: exact set and machine edges.
- **"Atrasado" is DERIVED, never stored** — design principle, pre-committed: `dueDate < today && status != HECHA/CANCELADA`, computed at read time (the platform's derived-not-stored doctrine). This is the single biggest quality win over the sheet: nobody has to remember to paint it red.
- **Fecha de cierre semantics:** the sheet's date is a commitment, not a schedule. Options: (a) reuse `startDate` as the commitment date for management-style activities; (b) add an optional `dueDate` distinct from the calendar dates. Session decision — affects how these items render (or don't) on the calendar views.
- **Responsables reales:** PREREQUISITE #1 — a company-members listing endpoint readable by activity writers (the CAL-005 V2 seed, now promoted). Session decisions: single vs multiple assignees (the sheet uses multiple), and display convention.
- **Observaciones as a log?** The sheet's dated-note pattern suggests an append-style activity log (author + date + text) instead of a single mutable field. Session decision: log vs plain field for V1 of this view.

## 4. Explicitly out of scope for this increment

- Cross-module feeds (still the separate V2 "unified feed architecture" item).
- Notifications/reminders for overdue items (candidate for later; derived Atrasado comes first).
- Any change to the calendar views themselves.

## 5. Kickoff checklist (when this increment starts, after CAL-007)

1. Mini design session with the founder over §3 (the questions above, one by one).
2. Members-endpoint prerequisite resolved (small backend ticket, permission-shaped).
3. Data-model addendum to `EXCELSIA-CALENDARIO-PLAN-PART1` + ticket plan (CAL-008…), same serial ritual.
