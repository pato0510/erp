# Excelsia — Marketing Module: Plan Part 1 — Data Model & Design Decisions

**Status:** Validated by founder — 2026-07-09. Source of truth for all MKT tickets.
**References:** `docs/MARKETING-RECON.md` (MKT-000 findings), `CLAUDE.md`, `docs/EXCELSIA-MARKETING-PLAN-PART2-TICKETS.md`.

---

## 1. Scope

**V1 (this plan):** campaigns + campaign calendar + per-campaign expense ledger + campaign→account attribution & ROI + digital-presence dashboard (manual monthly snapshots).

**Explicitly deferred (V2 backlog):**

- Campaign sub-tasks / internal checklists.
- Expense ↔ Finance `Movement` reconciliation link (`movementId`).
- Ads/analytics API integrations (Google, LinkedIn) and SEO crawler.
- Notifications/cron for marketing alerts — V1 ships **derived UI badges only** (see §6).
- Master activity calendar — separate future module, see `docs/EXCELSIA-CALENDARIO-ACTIVIDADES-SCOPE.md`.

---

## 2. Entities

Three new tables + one micro-migration on `accounts`. Every new table ships RLS policy + audit trigger + GRANT to `app_user` in the same hand-authored migration (platform invariant).

### 2.1 `campaigns`

```prisma
enum CampaignChannel {
  FERIA_EVENTO
  REDES_SOCIALES
  GOOGLE_ADS
  EMAIL
  REFERIDOS
  LICITACION
  OTRO
}

enum CampaignStatus {
  BORRADOR
  ACTIVA
  PAUSADA
  FINALIZADA
  CANCELADA
}

model Campaign {
  id           String          @id @default(uuid()) @db.Uuid
  companyId    String          @db.Uuid
  name         String
  description  String?
  channel      CampaignChannel
  status       CampaignStatus  @default(BORRADOR)
  startDate    DateTime?       @db.Date
  endDate      DateTime?       @db.Date
  budgetAmount Decimal?        @db.Decimal(18, 2)
  ownerId      String?         @db.Uuid
  notes        String?
  createdBy    String          @db.Uuid
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  expenses MarketingExpense[]
  accounts Account[]

  @@index([companyId])
  @@index([status])
  @@map("campaigns")
}
```

**Semantics:**

- **Status machine** (canonical endpoint `PATCH /:id/status`): free movement among `BORRADOR ↔ ACTIVA ↔ PAUSADA`. `FINALIZADA` / `CANCELADA` are **semi-terminal**: reachable from `ACTIVA`/`PAUSADA`, and reopenable only via an explicit reopen action back to `ACTIVA` (Comercial GANADA/PERDIDA discipline).
- **Activation guard:** creating a `BORRADOR` requires no dates; transitioning to `ACTIVA` **requires `startDate`** (COM-010 "send requires validUntil" parallel). `endDate` stays optional (open-ended campaigns exist).
- **Dates** are `@db.Date` → UTC-anchored date arithmetic everywhere (HR-004b convention).
- **Money is never stored derived:** `spent = Σ expenses.amount` and the over-budget condition are computed live. No rollup columns.
- **Deletion policy:** `DELETE` allowed only for a **pristine `BORRADOR`** (zero expenses AND zero attributed accounts). Anything else is `CANCELADA`, never deleted — preserves attribution history.
- `ownerId` / `createdBy` are bare actor UUIDs (codebase convention), no FK to users.

### 2.2 `marketing_expenses`

```prisma
model MarketingExpense {
  id          String   @id @default(uuid()) @db.Uuid
  companyId   String   @db.Uuid
  campaignId  String   @db.Uuid
  expenseDate DateTime @db.Date
  description String
  amount      Decimal  @db.Decimal(18, 2)
  vendorName  String?
  notes       String?
  createdBy   String   @db.Uuid
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([campaignId])
  @@map("marketing_expenses")
}
```

**Semantics:**

- **Informational ledger only.** Real money lives in Finanzas (invoice + approval + SII sync). This table NEVER writes to Finance — no Movement, no Commitment, no domain event. Zero double-count risk by construction.
- **Amounts are NET of IVA** (founder decision b) so ROI compares like-for-like against quote `netAmount`. The UI states this in a caption.
- `vendorName` is free text — deliberately NOT an FK to `counterparties`.
- Dependent child of campaign (`onDelete: Cascade`), same pattern as contacts / quote lines.
- Simple CRUD, no approval workflow.

### 2.3 `presence_snapshots`

```prisma
model PresenceSnapshot {
  id                 String   @id @default(uuid()) @db.Uuid
  companyId          String   @db.Uuid
  period             DateTime @db.Date
  webVisits          Int?
  linkedinFollowers  Int?
  googleProfileViews Int?
  notes              String?
  createdBy          String   @db.Uuid
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([companyId, period])
  @@index([companyId])
  @@map("presence_snapshots")
}
```

**Semantics:**

- **Wide row = one row per month**, one column per metric. Chosen over the narrow metric-per-row model because it maps 1:1 to the "Registrar datos del mes" form, upsert is trivial via `@@unique([companyId, period])`, and charting is direct. Cost accepted: a new metric = a one-column micro-migration.
- `period` is always the **first day of the month**, enforced in the service (normalize any input date to day 01, UTC).
- Metric set validated for V1: `webVisits`, `linkedinFollowers`, `googleProfileViews`. All nullable — record what you have.
- Manual monthly entry only in V1; API integrations are V2.

### 2.4 Micro-migration on `accounts` (attribution)

- Pre-check for orphans: `SELECT` any `sourceCampaignId` values not present in `campaigns(id)` before adding the constraint (recon MKT-000 expects zero, verify anyway).
- `ALTER TABLE accounts ADD CONSTRAINT ... FOREIGN KEY (sourceCampaignId) REFERENCES campaigns(id) ON DELETE SET NULL` + `CREATE INDEX` on `sourceCampaignId` (missing today, confirmed by recon M2/M7).
- **The FK does not validate tenant**: cross-company campaign assignment must be rejected in the service (COM-004 pattern).
- No RLS/audit/GRANT boilerplate needed — `accounts` already has all three.

---

## 3. Attribution & ROI semantics (validated)

- The Comercial account form gains a **"Campaña de origen"** selector (Comercial writers edit; ACCOUNTANT sees it read-only). Editable at any time, not only at creation.
- **ROI is a live read, never a stored rollup.** For a campaign: attributed accounts = `accounts WHERE sourceCampaignId = :id`; won deals = their opportunities **currently** in `GANADA`; revenue = `netAmount` of each won opportunity's `ACEPTADA` quote. A reopened deal drops out of ROI until re-won (recon M7 pitfall, resolved by design). Return is shown against `Σ marketing_expenses.amount`.
- Volumes are small (single-digit campaigns, tens of accounts): live aggregation is fine.

---

## 4. Cross-module contracts (EXPOSE/CONSUME — no mutual imports, no cross-table reads)

| Direction             | Contract                                                                                                                                                           | Consumer                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Marketing **exposes** | `CampaignLookupService` — read-only list `{ id, name, status }` for the current company                                                                            | Comercial account form ("Campaña de origen" select), via DI |
| Comercial **exposes** | `CampaignAttributionReadService.getCampaignReturn(companyId, campaignId)` → `{ accountsCount, wonCount, wonNetAmount }` with an explicit field map (COM-012 style) | Marketing campaign detail (Retorno section), via DI         |

**No `domain_events` in V1** — attribution is an FK set through the UI and ROI is a read. Nothing to emit, nothing to listen to. (If a future feature needs events: `aggregateId` must be a real UUID — never a composite string — per the platform landmine.)

---

## 5. CASL matrix (validated)

| Subject            | MANAGER / ADMIN / SUPER_ADMIN | ACCOUNTANT | ANALYST / VIEWER |
| ------------------ | ----------------------------- | ---------- | ---------------- |
| `Campaign`         | create/read/update/delete     | read       | —                |
| `MarketingExpense` | create/read/update/delete     | read       | —                |
| `PresenceSnapshot` | create/read/update/delete     | —          | —                |

- MKT-001 extends the **default-deny floor** to the three subjects, then re-grants per row with last-rule-wins (COM-001 pattern).
- ACCOUNTANT reads `Campaign` and `MarketingExpense` because budget and spend are financial data (Chilean contador pattern). `PresenceSnapshot` carries no money → outside the ACCOUNTANT grant.
- ANALYST/VIEWER floored on the whole module (consistent with Comercial; budget/spend are money).
- Frontend permission checks via `GET /marketing/permissions` + `useCanWrite` — zero hardcoded role strings.

---

## 6. Derived badges (V1, no cron)

Computed at read time, shown in campaign list + detail:

- **"Sobre presupuesto"** — `budgetAmount` set AND `Σ expenses > budgetAmount`.
- **"Termina en 7 días"** — `status = ACTIVA` AND `endDate` within the next 7 days (UTC date arithmetic).

Recon M4 confirmed the Operations alert engine is document-expiry-hardcoded; the RRHH precedent (own thin path) is deferred to V2 for Marketing. No `alert_rules` rows, no BullMQ job in V1.

---

## 7. UI surface map

- `/modulos`: the old "Calendario" card is repurposed as **Marketing** (gated `active: false` until MKT-010); a new gated card **"Calendario de Actividades"** is added (future module placeholder).
- `/marketing` sidebar: **Campañas** (`/marketing/campanas`), **Calendario** (`/marketing/calendario`), **Presencia digital** (`/marketing/presencia`).
- Campaign detail sections: Datos · Gastos (budget vs spent + badges) · Retorno (ROI).
- Current design tokens throughout (accent `#2563eb`, Outfit headings, glassmorphism) — identical to Comercial pages.
- Spanish UI labels with proper accents; ASCII-only enum members and identifiers.

---

## 8. Decision record (founder-validated, 2026-07-09)

- **(a)** Channel enum: `FERIA_EVENTO, REDES_SOCIALES, GOOGLE_ADS, EMAIL, REFERIDOS, LICITACION, OTRO`.
- **(b)** Expense amounts are net of IVA (UI caption states it).
- **(c)** Presence metrics V1: web visits, LinkedIn followers, Google profile views (wide row; adding a metric later is a one-column micro-migration).
- **(d)** Delete only pristine `BORRADOR`; everything else is cancelled, never deleted.
- **(e)** V1 alerts = derived UI badges only; no cron, no notifications, no alert-engine rows.
- **(f)** `startDate` required to activate, not to create a draft.
- Attribution & ROI: campaign selector on account + live ROI counting only currently-GANADA deals (net amounts).
- Digital presence dashboard: **in** V1, manual monthly entry.
