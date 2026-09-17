# HUB-005 — Module palette adoption audit

Date: 2026-09-17. Decision document only; no product changes are authorized by this audit.

## 1. Decision and boundaries

**Go with changes for module identification; no-go for a global color replacement.** Start with the sidebar's active indicator and existing page-header markers. Follow with local tabs and navigation. Keep the global action accent, tables, forms, page/card backgrounds, charts, domain colors, attention/success/info/error colors and logos unchanged.

The direct hub-to-app mapping is unsafe: every hub `ink` fails normal-text contrast on light surfaces; every hub `border` fails the 3:1 indicator target on light `--bg-subtle`. Dark-page accents need a different value from light-page accents. The sidebar is a third context: its light-theme background is still colored/dark.

Read in full before inventory: `CLAUDE.md` and `apps/web/src/styles/tokens.css`. The token-layer proposal applies the `design-system` skill's primitive → purpose → component separation. No skill was used to authorize a redesign. This file is the only repository deliverable.

### Existing invariants

| Evidence                                                                                                                                       | Consequence                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:396–400`: `darkMode: 'class'`; color utilities “Referencian variables CSS completas: no admiten modificadores de opacidad (`/50`).” | Theme-dependent aliases belong in CSS; no slash-opacity module utilities.                                                                                |
| `CLAUDE.md:408`: “`dark:` se permite en colores semánticos (rojo, verde, ámbar, azul), nunca en neutros.”                                      | Do not introduce identity-color `dark:` branches. Preserve existing semantic variants. Visibility variants used by branding are outside this color rule. |
| `CLAUDE.md:425–426`: “nunca estirar, rotar ni aplicar filtros/recolor”; “El acento de la app (`#2563eb`) no cambia”.                           | Keep logo assets and `--color-accent` intact. Add opt-in module aliases, not a new value for the global accent.                                          |
| `CLAUDE.md:430–434`: hub values are “VALORES EXACTOS” and “no se redondean ni armonizan”.                                                      | Never alter `--hub-*`. Adjustments below are proposed new module-layer values only.                                                                      |
| `apps/web/src/styles/tokens.css:51–55`: hub is dark in both themes; no theme variants.                                                         | Directly sharing hub ink with light-page text would violate contrast. New app-module tokens must be theme aware.                                         |

**Apply-or-report:** promoting colors means aliasing the protected hub palette, not changing it. Lightness-only derivatives are an explicit proposal for approval in a later implementation ticket. The general “Only write and modify code files” instruction under “RULES FOR CLAUDE CODE” (`CLAUDE.md:60–65`) conflicts with this ticket’s explicit single-document deliverable. This audit follows the ticket and writes only the requested Markdown file; the product invariants remain unchanged.

## 2. Inventory and classification

The reproducible search covers accent variables/utilities/hex, equivalent Tailwind blues, active sidebar and tab state, headings/breadcrumbs, the `ACCENT` aliases RGB spellings of the global blue, and related `#1d4ed8` / `#3b82f6` / `#60a5fa` spellings. Matches are deduplicated by file and line; a line can contain several color expressions. Adjacent paired foreground declarations were also read. Appendix A quotes **all 906 inventoried lines across 197 files**, including comments and false-positive structural matches, with a decision for each. These are source-line counts, not counts of rendered components.

| Class | Meaning                                                                                        | Lines | Files containing this class |
| ----- | ---------------------------------------------------------------------------------------------- | ----: | --------------------------: |
| C-S   | Candidate: sidebar active indicator                                                            |    11 |                           8 |
| C-H   | Candidate: existing header marker                                                              |    26 |                          26 |
| C-T   | Candidate: local tabs/view selection                                                           |    43 |                          14 |
| C-L   | Candidate: local navigation/landing-card border                                                |     7 |                           5 |
| C-I   | Candidate: non-semantic section/icon identity                                                  |     4 |                           2 |
| K     | Keep global accent: actions, forms, focus, shared controls and data links                      |   470 |                         151 |
| N     | Not applicable: semantic/domain data, protected surfaces, neutral text or non-rendered matches |   345 |                         131 |

The candidate groups span **49 distinct source files**; file columns overlap. “Candidate” is eligibility for the scoped later work, not permission to recolor the whole file. In particular, a header can be C-H while its Save button remains K and its error badge remains N.

### 2.1 Shared surfaces and high-value evidence

| Surface                         | Source quote                                                                                                                                                                                                                                                           | Decision                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared sidebar active state     | `apps/web/src/app/(dashboard)/layout.tsx:197–203`: `.tn-nav__item--active`; `color: var(--sidebar-text-active)`; `border-left-color: var(--sidebar-active-border)`                                                                                                     | C-S for the border only. Keep white active labels/icons and the existing active background.                                                                                            |
| Sidebar counts share that token | `apps/web/src/app/(dashboard)/layout.tsx:205–207`: `.tn-nav__badge { background: var(--sidebar-active-border); color: #0f1422;`                                                                                                                                        | K. Do **not** rebind `--sidebar-active-border` across the sidebar; change the active-item border declaration separately.                                                               |
| Sidebar consumers               | `FinanceSidebar.tsx:82`, `OperationsSidebar.tsx:187,238`, `HsecSidebar.tsx:58`, `ComercialSidebar.tsx:80`, `MarketingSidebar.tsx:47`, `RrhhSidebar.tsx:58`, `ActividadesSidebar.tsx:90`, all under `apps/web/src/components/sidebars/`, quote `tn-nav__item--active`   | Seven consumers of one shared rule. No seven-way CSS duplication is needed.                                                                                                            |
| Attention count                 | `apps/web/src/components/sidebars/ActividadesSidebar.tsx:96–100`: `bg-amber-100` / `dark:bg-amber-950`, ``aria-label={`${alertCount} alertas`}``                                                                                                                       | N. Preserve semantic amber and its label. Commercial alert badges follow the same exclusion.                                                                                           |
| Local detail tabs               | `apps/web/src/app/(dashboard)/comercial/cuentas/[id]/page.tsx:158–160`: `color: tab === t.key ? 'var(--color-accent)' : 'var(--text-secondary)'`; `borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent'`                                        | C-T. Replace the active foreground and underline together, leave inactive text unchanged. RRHH repeats this at `rrhh/trabajadores/[id]/page.tsx:162–164`.                              |
| Header bar                      | `apps/web/src/app/(dashboard)/hsec/page.tsx:73`: `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />`                                                                                                                           | C-H. The adjacent heading remains `--text-primary`.                                                                                                                                    |
| Neutral headings/breadcrumbs    | `apps/web/src/components/operations/PlaceholderPage.tsx:12–13`: `ops-breadcrumb`, `ops-title`; `:27,31,38` specify neutral text. `apps/web/src/app/(dashboard)/actividades/alertas/page.tsx:96–103` uses a neutral breadcrumb and `text-fg`.                           | N for a replacement-only first wave. Do not recolor entire breadcrumb trails or add new header bars. A later module-name-only breadcrumb treatment needs its own scoped markup review. |
| Global scrollbar/cursor         | `apps/web/src/app/global.css:147,160,182`: `var(--color-accent)`                                                                                                                                                                                                       | K. Shared chrome stays blue.                                                                                                                                                           |
| Global notification UI          | `apps/web/src/components/NotificationCenter.tsx:312,327,339`: `var(--color-accent)`, `text-blue-600`                                                                                                                                                                   | K. Cross-module actions and read state must not change when the route changes.                                                                                                         |
| Shared source/file links        | `apps/web/src/components/shared/OriginCard.tsx:62`; `apps/web/src/lib/file-icons.tsx:19,25`: `var(--color-accent)`                                                                                                                                                     | K. These cross module boundaries and encode a link/file affordance.                                                                                                                    |
| Selected to-do scopes           | `apps/web/src/app/(dashboard)/actividades/alertas/page.tsx:119,131`: `effectiveScope === … ? 'bg-subtle' : ''`; `actividades/todos/page.tsx:123,131`: `aria-pressed`                                                                                                   | N for the initial replacement sweep: they are deliberately neutral today. Do not turn a neutral surface into a new colored fill.                                                       |
| Status disguised as accent      | `apps/web/src/components/operations/ServiceOrderStatusBadge.tsx:28`: `RECIBIDA: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8', dot: 'var(--color-accent)' }`                                                                                                          | N. “Received” is status, not module identity.                                                                                                                                          |
| Priority / error semantics      | `apps/web/src/components/actividades/TodoRowCells.tsx:21`: `LOW: { label: 'Baja', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' }`; `apps/web/src/components/marketing/CampaignExpenses.tsx:81`: `over ? '#ef4444' : 'var(--color-accent)'` | N. Keep priority, over-budget and corresponding blue states stable.                                                                                                                    |

There is no shared `components/ui` directory or shared page-header/tab primitive to update once. Headers and tabs are mostly inlined in pages; the Operations `PlaceholderPage` is a limited shared exception. Several RRHH components declare `const ACCENT = 'var(--color-accent)'`: do not change the alias wholesale because headers, actions, payroll numbers and charts share it.

### 2.2 Module landing surfaces

The real hub navigation is `apps/web/src/app/modulos/page.tsx:33–97`. Some module root pages are redirects, not dashboards.

| Module      | Actual entry and source                                                                         | Current accents / classification                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| finanzas    | Hub `:39`: `/dashboard`; `apps/web/src/app/(dashboard)/dashboard/page.tsx:452` neutral heading  | Local navigation links `:1038,1085` C-L; the “Definir metas” action at `:716` K; graph fills/strokes `:806,885,1406,1516` N. No existing header bar to migrate.             |
| operaciones | Hub `:47`: `/operaciones`; `operaciones/page.tsx:369` neutral heading                           | Navigation links `:558,604`, `text-[var(--accent-color,#2563eb)]`, C-L. The misspelled/fallback accent is a local replacement candidate, not a new global token.            |
| hsec        | Hub `:59`: `/hsec`                                                                              | `hsec/page.tsx:68` hover card border C-L; `:73` header bar C-H; counters stay neutral/semantic.                                                                             |
| comercial   | Hub `:67`: `/comercial`; root `comercial/page.tsx:7`: `redirect('/comercial/cuentas')`          | `comercial/cuentas/page.tsx:135` header C-H. Separate dashboard header `comercial/dashboard/page.tsx:112` C-H; chart `:309` N, icon `:504` C-I.                             |
| marketing   | Hub `:77`: `/marketing`; root `marketing/page.tsx:7`: `redirect('/marketing/campanas')`         | `marketing/campanas/page.tsx:83` header C-H; create action `:98` K.                                                                                                         |
| rrhh        | Hub `:85`: `/rrhh`                                                                              | `rrhh/page.tsx:119` header C-H; `:343` navigation C-L; `:163,215,319` KPI/chart colors N.                                                                                   |
| gestion     | Hub `:95`: `/actividades`; root `actividades/page.tsx:9`: `redirect('/actividades/calendario')` | `actividades/calendario/page.tsx:439` view tabs C-T; `:419` neutral heading N; calendar event/area/feed colors N. Other header marker: `actividades/areas/page.tsx:78` C-H. |

Paths abbreviated in this table after the first row are relative to `apps/web/src/app/(dashboard)/`. Root-route comments still mention old “Próximamente” gating; the actual redirect/hub code above is the evidence used. No route or permission change is proposed.

## 3. Token proposal — opt-in module identity

Keep the existing exact hub primitives. Add a separate module block in `tokens.css` and three route-scoped utility aliases, only when a later ticket is approved. Do not scope or override `--color-accent` itself.

For each key, propose all three named tokens below. `S` is a slightly darkened version of that module's hub `from`; `I` is its exact hub `ink`; `B` is its exact hub `border`.

- Light theme: `--module-<key>-accent = S`; `--module-<key>-on-accent = I`.
- Dark theme: `--module-<key>-accent = I`; `--module-<key>-on-accent = S`.
- Both themes: `--module-<key>-accent-soft = color-mix(in srgb, var(--hub-<key>-border) 8%, transparent)`. This derives from `B`, using the existing global dim token's 8% convention (`tokens.css:11`). It is a subtle **optional local selection/icon tint**, never a replacement for page, card, table or form backgrounds, and never the only active indicator.

Why darken `from`? Exact `from` already passes 4.5:1 as light-page text, but exact `ink` on exact `from` fails normal text in every module. Keeping the on-accent color inside the requested module palette requires a darker partner. `S` targets at least **4.6:1** against `I` and the light soft surface, leaving a small margin above AA. This also makes the swapped dark-theme pair valid. The hub colors are untouched; only the proposed new token changes lightness. Global white-on-blue buttons remain unchanged.

No hue is invented: the derivation moves `from` toward black along its sRGB ray, then quantizes to 8-bit channels. Black is a neutral mixing endpoint, not a new identity hue. The percentages in the table are exact search amounts at 0.01 percentage-point resolution; the hex values are the proposed stored results. Minor hue drift from channel rounding is not an intentional hue change.

| Key / named token prefix | `accent` light = `on-accent` dark (`S`) | Source `from` / black mix                  | `accent` dark = `on-accent` light (`I`) | `accent-soft` source (`B`, at 8%)    |
| ------------------------ | --------------------------------------- | ------------------------------------------ | --------------------------------------- | ------------------------------------ |
| `--module-finanzas-`     | `#1e509a`                               | `--hub-finanzas-from` `#2461bc`; 17.82%    | `--hub-finanzas-ink` `#aec8ee`          | `--hub-finanzas-border` `#669bdc`    |
| `--module-operaciones-`  | `#8a4822`                               | `--hub-operaciones-from` `#aa582a`; 18.53% | `--hub-operaciones-ink` `#f1ccb0`       | `--hub-operaciones-border` `#ca916c` |
| `--module-hsec-`         | `#1f6c4e`                               | `--hub-hsec-from` `#237b58`; 11.79%        | `--hub-hsec-ink` `#b6e6d5`              | `--hub-hsec-border` `#65a98c`        |
| `--module-comercial-`    | `#85375d`                               | `--hub-comercial-from` `#a14370`; 17.17%   | `--hub-comercial-ink` `#ebbad0`         | `--hub-comercial-border` `#bf7da0`   |
| `--module-marketing-`    | `#654598`                               | `--hub-marketing-from` `#7650b1`; 13.99%   | `--hub-marketing-ink` `#d3c7ed`         | `--hub-marketing-border` `#a587cd`   |
| `--module-rrhh-`         | `#19666f`                               | `--hub-rrhh-from` `#1d7680`; 13.14%        | `--hub-rrhh-ink` `#b6e0dc`              | `--hub-rrhh-border` `#63aeb4`        |
| `--module-gestion-`      | `#246186`                               | `--hub-gestion-from` `#2a719b`; 13.72%     | `--hub-gestion-ink` `#b5ddeb`           | `--hub-gestion-border` `#71accb`     |

Each prefix above expands to **exactly** `accent`, `accent-soft`, and `on-accent` (21 named tokens, with light/dark values). Source values are at `tokens.css:69–108`. A future route wrapper can alias these to `--module-accent`, `--module-accent-soft`, `--module-on-accent`, mapped to Tailwind `text-module-accent`, `border-module-accent`, `bg-module-accent`, `bg-module-accent-soft`, and `text-module-on-accent`. Literal class names keep Tailwind discovery predictable. Inline CSS variable consumers can use the same aliases.

**Sidebar exception:** use the exact module `I` for its active border in **both themes**, selected in the shared layout; do not use the light-page `S` there. Keep `--sidebar-text-active: #ffffff`, the white icon and the existing `--sidebar-active-bg`. Name the scoped binding for its purpose (for example `--module-sidebar-indicator`) rather than overriding a shared sidebar token that also colors counts. This is a consumer alias of `I`, not an additional palette/hue.

Resolve route identity with explicit known module paths. The current layout falls back to `FinanceSidebar` (`layout.tsx:53–78`), but `/configuracion`, `/notificaciones` and global user administration should not automatically acquire the Finance accent merely because of that fallback. Shared portals/modals must retain their global tokens unless an explicit local identity consumer opts in.

## 4. Contrast measurements

### 4.1 Method and actual backgrounds

Use WCAG 2.2 relative luminance: decode each sRGB channel with the 0.04045 threshold; `L = 0.2126R + 0.7152G + 0.0722B`; contrast is `(L_lighter + 0.05) / (L_darker + 0.05)`. Alpha colors are composited **before** computing luminance. Normal text requires 4.5:1; large text requires 3:1. The sidebar's 14 px and typical tabs' 12–14 px are normal text. Results are judged before rounding. [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C relative luminance](https://www.w3.org/WAI/GL/wiki/Relative_luminance).

Required control/state indicators use a 3:1 target against adjacent surfaces. An 8% soft fill is not sufficient on its own; pair it with the measured opaque indicator and a textual/structural selected state. Decorative-only markers do not themselves establish interface compliance. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

All values below are **calculated from source**, not screenshot samples or a claim that every rendered page passes WCAG. Existing semantic colors are excluded from replacement, not certified by this audit.

| Code    | Theme / token                                                | Real value and evidence                                                                                                                                  |
| ------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LP / LC | Light `--bg-primary` / `--bg-card`                           | Both `#ffffff`, `tokens.css:19,23`; identical columns are combined below.                                                                                |
| LS      | Light `--bg-subtle`                                          | `#f3f4f6`, `tokens.css:21`.                                                                                                                              |
| DP      | Dark `--bg-primary`                                          | `#0f0f0f`, `tokens.css:117`.                                                                                                                             |
| DCp     | Dark `--bg-card` over DP                                     | `rgba(28,28,30,0.5)` (`tokens.css:121`) over `#0f0f0f` → fractional sRGB `(21.5,21.5,22.5)`, approximately `#161617`. Calculations retain the fractions. |
| DCg     | Dark card over dashboard gradient, conservative bright bound | Same card over the bound below → `(29.9855,30.741,43.012)`, approximately `#1e1f2b`.                                                                     |
| DS      | Dark `--bg-subtle`                                           | `#242424`, `tokens.css:119`.                                                                                                                             |
| DG      | Visible dark page gradient, conservative bright bound        | `(31.971,33.482,56.024)`, approximately `#202138`; not the same as DP.                                                                                   |

The actual light dashboard shell uses `--bg-secondary: #f8f9fa` (`tokens.css:20`, `layout.tsx:96,101`); it lies between white and LS in luminance, so the LS result bounds dark accent text there. Dark `--bg-secondary` is transparent (`tokens.css:118`). `DarkGradientBackground.tsx:21,27–28` supplies `#0f0f14 → #1a1a22 → #15151e` plus blue at up to 6% and violet at up to 5%. For a conservative bright bound, composite both maximum overlays over the brightest base `#1a1a22`, violet first, blue second. Their spatial peaks need not coincide; this intentionally overestimates luminance. The bound also covers blur of these backgrounds. It does not cover an unrelated image/overlay introduced later. Opaque `--bg-card-solid: #1c1c1e` is darker than DS and is covered by the proposed dark-text minimum.

**Legend for every matrix cell: ratio + normal / large / non-text.** P = pass, F = fail. Border and text contrast share the same numerical ratio; the thresholds differ. Tables include all required token backgrounds in both themes, plus the actual gradient/card bound.

### 4.2 Exact hub colors, before adaptation

| Module / exact source          | LP = LC     | LS          | DP           | DCp          | DCg          | DS           | DG           |
| ------------------------------ | ----------- | ----------- | ------------ | ------------ | ------------ | ------------ | ------------ |
| finanzas `ink` `#aec8ee`       | 1.708 F/F/F | 1.552 F/F/F | 11.224 P/P/P | 10.637 P/P/P | 9.581 P/P/P  | 9.089 P/P/P  | 9.167 P/P/P  |
| finanzas `border` `#669bdc`    | 2.882 F/F/F | 2.619 F/F/F | 6.651 P/P/P  | 6.304 P/P/P  | 5.678 P/P/P  | 5.386 P/P/P  | 5.432 P/P/P  |
| finanzas `from` `#2461bc`      | 5.981 P/P/P | 5.435 P/P/P | 3.205 F/P/P  | 3.037 F/P/P  | 2.736 F/F/F  | 2.595 F/F/F  | 2.617 F/F/F  |
| operaciones `ink` `#f1ccb0`    | 1.500 F/F/F | 1.363 F/F/F | 12.783 P/P/P | 12.115 P/P/P | 10.912 P/P/P | 10.352 P/P/P | 10.440 P/P/P |
| operaciones `border` `#ca916c` | 2.700 F/F/F | 2.453 F/F/F | 7.100 P/P/P  | 6.729 P/P/P  | 6.061 P/P/P  | 5.749 P/P/P  | 5.798 P/P/P  |
| operaciones `from` `#aa582a`   | 5.074 P/P/P | 4.611 P/P/P | 3.778 F/P/P  | 3.580 F/P/P  | 3.225 F/P/P  | 3.059 F/P/P  | 3.085 F/P/P  |
| hsec `ink` `#b6e6d5`           | 1.375 F/F/F | 1.250 F/F/F | 13.937 P/P/P | 13.209 P/P/P | 11.897 P/P/P | 11.286 P/P/P | 11.383 P/P/P |
| hsec `border` `#65a98c`        | 2.761 F/F/F | 2.508 F/F/F | 6.944 P/P/P  | 6.581 P/P/P  | 5.928 P/P/P  | 5.623 P/P/P  | 5.671 P/P/P  |
| hsec `from` `#237b58`          | 5.191 P/P/P | 4.717 P/P/P | 3.693 F/P/P  | 3.500 F/P/P  | 3.152 F/P/P  | 2.990 F/F/F  | 3.016 F/P/P  |
| comercial `ink` `#ebbad0`      | 1.684 F/F/F | 1.531 F/F/F | 11.380 P/P/P | 10.785 P/P/P | 9.714 P/P/P  | 9.215 P/P/P  | 9.294 P/P/P  |
| comercial `border` `#bf7da0`   | 3.155 F/P/P | 2.867 F/F/F | 6.076 P/P/P  | 5.758 P/P/P  | 5.187 P/P/P  | 4.920 P/P/P  | 4.962 P/P/P  |
| comercial `from` `#a14370`     | 5.912 P/P/P | 5.372 P/P/P | 3.242 F/P/P  | 3.073 F/P/P  | 2.768 F/F/F  | 2.626 F/F/F  | 2.648 F/F/F  |
| marketing `ink` `#d3c7ed`      | 1.595 F/F/F | 1.450 F/F/F | 12.014 P/P/P | 11.386 P/P/P | 10.256 P/P/P | 9.729 P/P/P  | 9.812 P/P/P  |
| marketing `border` `#a587cd`   | 3.023 F/P/P | 2.747 F/F/F | 6.341 P/P/P  | 6.010 P/P/P  | 5.413 P/P/P  | 5.135 P/P/P  | 5.179 P/P/P  |
| marketing `from` `#7650b1`     | 5.911 P/P/P | 5.371 P/P/P | 3.243 F/P/P  | 3.073 F/P/P  | 2.768 F/F/F  | 2.626 F/F/F  | 2.648 F/F/F  |
| rrhh `ink` `#b6e0dc`           | 1.430 F/F/F | 1.299 F/F/F | 13.404 P/P/P | 12.704 P/P/P | 11.442 P/P/P | 10.855 P/P/P | 10.947 P/P/P |
| rrhh `border` `#63aeb4`        | 2.547 F/F/F | 2.315 F/F/F | 7.525 P/P/P  | 7.132 P/P/P  | 6.424 P/P/P  | 6.094 P/P/P  | 6.146 P/P/P  |
| rrhh `from` `#1d7680`          | 5.309 P/P/P | 4.824 P/P/P | 3.610 F/P/P  | 3.422 F/P/P  | 3.082 F/P/P  | 2.924 F/F/F  | 2.949 F/F/F  |
| gestion `ink` `#b5ddeb`        | 1.448 F/F/F | 1.315 F/F/F | 13.242 P/P/P | 12.550 P/P/P | 11.304 P/P/P | 10.723 P/P/P | 10.815 P/P/P |
| gestion `border` `#71accb`     | 2.481 F/F/F | 2.254 F/F/F | 7.727 P/P/P  | 7.323 P/P/P  | 6.596 P/P/P  | 6.258 P/P/P  | 6.311 P/P/P  |
| gestion `from` `#2a719b`       | 5.338 P/P/P | 4.851 P/P/P | 3.591 F/P/P  | 3.403 F/P/P  | 3.065 F/P/P  | 2.908 F/F/F  | 2.933 F/F/F  |

Every exact `ink` is safe on the tested dark backgrounds and unsafe on the tested light backgrounds. Exact `border` passes on dark backgrounds; although Comercial and Marketing borders exceed 3:1 on white, they fail on LS. Exact `from` passes normal text on all tested light surfaces but fails normal text on dark surfaces. Consequently, one unchanged color cannot cover both themes.

### 4.3 Text on accent and proposed module accents

For text on a filled local tab, `I` over `S` in light and `S` over `I` in dark have the same ratio. The unadapted `I`/`from` pair is shown for comparison. The soft columns measure the proposed foreground on `B` at 8% over LS or DS. Both tint and backdrop are included, not just the nominal token.

| Module      | Original `I` / `from` | Proposed on-accent pair, both themes | Light text/indicator minimum (LS) | Dark text/indicator minimum (DS) | Light text on soft | Dark text on soft |
| ----------- | --------------------- | ------------------------------------ | --------------------------------- | -------------------------------- | ------------------ | ----------------- |
| finanzas    | 3.502 F/P/P           | 4.606 P/P/P                          | 7.149 P/P/P                       | 9.089 P/P/P                      | 6.679 P/P/P        | 8.057 P/P/P       |
| operaciones | 3.384 F/P/P           | 4.621 P/P/P                          | 6.296 P/P/P                       | 10.352 P/P/P                     | 5.907 P/P/P        | 9.116 P/P/P       |
| hsec        | 3.774 F/P/P           | 4.608 P/P/P                          | 5.759 P/P/P                       | 11.286 P/P/P                     | 5.396 P/P/P        | 9.961 P/P/P       |
| comercial   | 3.510 F/P/P           | 4.614 P/P/P                          | 7.063 P/P/P                       | 9.215 P/P/P                      | 6.564 P/P/P        | 8.233 P/P/P       |
| marketing   | 3.705 F/P/P           | 4.605 P/P/P                          | 6.677 P/P/P                       | 9.729 P/P/P                      | 6.228 P/P/P        | 8.648 P/P/P       |
| rrhh        | 3.713 F/P/P           | 4.630 P/P/P                          | 6.017 P/P/P                       | 10.855 P/P/P                     | 5.662 P/P/P        | 9.513 P/P/P       |
| gestion     | 3.688 F/P/P           | 4.636 P/P/P                          | 6.098 P/P/P                       | 10.723 P/P/P                     | 5.752 P/P/P        | 9.367 P/P/P       |

Full proposed-accent matrix (these same foreground ratios govern header markers, local link text, active underlines and opaque borders):

| Module / theme foreground     | LP = LC     | LS          | DP           | DCp          | DCg          | DS           | DG           |
| ----------------------------- | ----------- | ----------- | ------------ | ------------ | ------------ | ------------ | ------------ |
| finanzas / light `#1e509a`    | 7.867 P/P/P | 7.149 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |
| operaciones / light `#8a4822` | 6.929 P/P/P | 6.296 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |
| hsec / light `#1f6c4e`        | 6.338 P/P/P | 5.759 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |
| comercial / light `#85375d`   | 7.772 P/P/P | 7.063 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |
| marketing / light `#654598`   | 7.348 P/P/P | 6.677 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |
| rrhh / light `#19666f`        | 6.622 P/P/P | 6.017 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |
| gestion / light `#246186`     | 6.711 P/P/P | 6.098 P/P/P | — theme swap | — theme swap | — theme swap | — theme swap | — theme swap |

| Module / dark foreground | DP           | DCp          | DCg          | DS           | DG           |
| ------------------------ | ------------ | ------------ | ------------ | ------------ | ------------ |
| finanzas `#aec8ee`       | 11.224 P/P/P | 10.637 P/P/P | 9.581 P/P/P  | 9.089 P/P/P  | 9.167 P/P/P  |
| operaciones `#f1ccb0`    | 12.783 P/P/P | 12.115 P/P/P | 10.912 P/P/P | 10.352 P/P/P | 10.440 P/P/P |
| hsec `#b6e6d5`           | 13.937 P/P/P | 13.209 P/P/P | 11.897 P/P/P | 11.286 P/P/P | 11.383 P/P/P |
| comercial `#ebbad0`      | 11.380 P/P/P | 10.785 P/P/P | 9.714 P/P/P  | 9.215 P/P/P  | 9.294 P/P/P  |
| marketing `#d3c7ed`      | 12.014 P/P/P | 11.386 P/P/P | 10.256 P/P/P | 9.729 P/P/P  | 9.812 P/P/P  |
| rrhh `#b6e0dc`           | 13.404 P/P/P | 12.704 P/P/P | 11.442 P/P/P | 10.855 P/P/P | 10.947 P/P/P |
| gestion `#b5ddeb`        | 13.242 P/P/P | 12.550 P/P/P | 11.304 P/P/P | 10.723 P/P/P | 10.815 P/P/P |

The soft fill alone contrasts only **1.12–1.15:1 at most** against these surfaces: **F for a required 3:1 indicator**. Use the opaque module accent for the border/underline, never `accent-soft` as the only selected-state cue. Keep labels, underline/left-border shape and `aria-selected` / `aria-current` / `aria-pressed` where applicable. Adding missing state semantics belongs to the later implementation's accessibility review.

### 4.4 Sidebar: test the colored surface, not the page

`tokens.css:33,38,131` defines light-theme gradient `#3b5c8a → #284b75`, dark-theme gradient `#0a0a12 → #0f1422`, and a 10% white active overlay. The brightest active row is `(78.6,108.3,149.7)` in light and `(39,43.5,56.1)` in dark. These are worse than the inactive adjacent sidebar for a light indicator. Use these unrounded composites when calculating.

| Module      | Original border / light active row | Exact ink / light active row | Exact ink / dark active row | Decision                               |
| ----------- | ---------------------------------- | ---------------------------- | --------------------------- | -------------------------------------- |
| finanzas    | 1.856 F/F/F                        | 3.133 F/P/P                  | 8.217 P/P/P                 | Ink indicator P; keep white small text |
| operaciones | 1.982 F/F/F                        | 3.568 F/P/P                  | 9.358 P/P/P                 | Ink indicator P; keep white small text |
| hsec        | 1.938 F/F/F                        | 3.890 F/P/P                  | 10.203 P/P/P                | Ink indicator P; keep white small text |
| comercial   | 1.696 F/F/F                        | 3.176 F/P/P                  | 8.331 P/P/P                 | Ink indicator P; keep white small text |
| marketing   | 1.770 F/F/F                        | 3.353 F/P/P                  | 8.796 P/P/P                 | Ink indicator P; keep white small text |
| rrhh        | 2.100 F/F/F                        | 3.741 F/P/P                  | 9.813 P/P/P                 | Ink indicator P; keep white small text |
| gestion     | 2.157 F/F/F                        | 3.696 F/P/P                  | 9.694 P/P/P                 | Ink indicator P; keep white small text |

White active text is **5.350:1 P** in the light sidebar and **14.033:1 P** in the dark sidebar. Hub ink would be only **3.133–3.890:1** in the light sidebar: P for a 3:1 indicator, F for its 14 px label. Do not tint the label/icon by globally replacing `--sidebar-text-active`. This is the reason the highest-value wave is the **indicator**, not a sidebar repaint.

### 4.5 Nearest compliant alternatives for failing ink/border

“Nearest” here has a reproducible, constrained meaning: preserve the source's hue direction by scaling all sRGB channels toward black; select the **smallest black mixture in 0.01 percentage-point increments** whose rounded 8-bit result meets the target on all light backgrounds. LS is limiting. This is not a claim of a globally nearest perceptual color in all of color space. The starting design hex, mix percentage and achieved ratio quantify the deviation. There is no adjustment needed for these colors on the tested dark surfaces.

These are alternatives **if the design team wants to retain the pale ink/border's hue direction**. The recommended family instead starts from the already darker, same-module `from`, requiring a smaller lightness change for the on-accent pair. Do not redefine the hub token with any of these results.

| Module / original design value | Nearest 3:1 indicator / large-text alternative | Black mix / achieved LS ratio | Nearest 4.5:1 normal-text alternative | Black mix / achieved LS ratio |
| ------------------------------ | ---------------------------------------------- | ----------------------------- | ------------------------------------- | ----------------------------- |
| finanzas ink `#aec8ee`         | `#7c8eaa`                                      | 28.76% / 3.026 P              | `#627187`                             | 43.40% / 4.510 P              |
| finanzas border `#669bdc`      | `#5f90cd`                                      | 6.78% / 3.002 P               | `#4b72a3`                             | 26.13% / 4.506 P              |
| operaciones ink `#f1ccb0`      | `#a18976`                                      | 32.99% / 3.003 P              | `#806c5e`                             | 46.82% / 4.517 P              |
| operaciones border `#ca916c`   | `#b68261`                                      | 10.01% / 3.003 P              | `#90674d`                             | 28.63% / 4.508 P              |
| hsec ink `#b6e6d5`             | `#75948a`                                      | 35.44% / 3.001 P              | `#5d756d`                             | 48.92% / 4.510 P              |
| hsec border `#65a98c`          | `#5c997f`                                      | 9.18% / 3.020 P               | `#497965`                             | 28.11% / 4.537 P              |
| comercial ink `#ebbad0`        | `#a68493`                                      | 29.15% / 3.008 P              | `#846875`                             | 43.82% / 4.524 P              |
| comercial border `#bf7da0`     | `#ba7a9c`                                      | 2.36% / 3.004 P               | `#93607c`                             | 22.81% / 4.538 P              |
| marketing ink `#d3c7ed`        | `#9289a4`                                      | 30.91% / 3.011 P              | `#736d82`                             | 45.27% / 4.502 P              |
| marketing border `#a587cd`     | `#9d80c3`                                      | 4.82% / 3.024 P               | `#7c669b`                             | 24.55% / 4.510 P              |
| rrhh ink `#b6e0dc`             | `#779390`                                      | 34.35% / 3.000 P              | `#5f7472`                             | 48.00% / 4.514 P              |
| rrhh border `#63aeb4`          | `#56979d`                                      | 12.94% / 3.024 P              | `#45787d`                             | 30.75% / 4.505 P              |
| gestion ink `#b5ddeb`          | `#77919b`                                      | 34.17% / 3.025 P              | `#5f737b`                             | 47.74% / 4.517 P              |
| gestion border `#71accb`       | `#6194ae`                                      | 14.04% / 3.002 P              | `#4d758b`                             | 31.69% / 4.508 P              |

The proposal in §3 uses a 4.6 target rather than shipping a color exactly on the 4.5 boundary. Minimum-compliance alternatives in this table are evidence, not a reason to remove the margin or change opacity at hover/focus.

## 5. Guard, allowlist and integration impact

This audit changes none of these files. A later adoption ticket would touch the following foundations:

| File                                                    | Proposed change                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/styles/tokens.css`                        | Add the 21 module tokens and their dark values in a new app-module block; leave hub, global accent, neutrals and sidebar gradient values intact.                                                                                                                                   |
| `apps/web/tailwind.config.js:22–40`                     | Add generic module accent/soft/on-accent utilities backed by complete CSS color variables. No per-module raw hex in components and no opacity modifiers.                                                                                                                           |
| `apps/web/src/app/(dashboard)/layout.tsx:53–78,197–207` | Supply explicit route-scoped aliases and a sidebar-specific ink binding; consume it only in active-item border. Do not color global settings/notifications by the Finance fallback.                                                                                                |
| `apps/web/scripts/check-theme-tokens.mjs:8–14`          | Extend the existing forbidden slash-opacity utility pattern to the new module utility names. The current pattern enumerates semantic utility names and would miss `bg-module-accent/50`. Also cover arbitrary slash opacity and the new utility's supported CSS-property prefixes. |
| `apps/web/scripts/check-theme-tokens.test.mjs`          | Add allow/fail examples for the new utilities and preserve semantic `dark:` cases.                                                                                                                                                                                                 |

The guard is **not a contrast checker**. It catches raw neutral utilities (`:9`), **all** hex literals in the specified inline/SVG color syntaxes (`:10–11`, broader than the prose “neutral hex”), white/black string literals (`:12`) and unsupported opacity syntax (`:14`). It does not currently ban raw blue Tailwind classes, CSS declarations such as `border-color: #2563eb`, or all `dark:` variants. Therefore a clean guard does not prove module ownership or sufficient contrast.

A new blanket “forbid module-accent utilities” rule is **not** appropriate. Extend the opacity rule; optionally add a narrowly scoped identity-token `dark:` rule so `dark:text-module-accent` is rejected while `dark:bg-red-950/40` remains allowed. Theme switching should occur in CSS aliases. Suggested later guard cases:

| Expression                                                                                     | Expected                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `text-module-accent`, `border-module-accent`, `bg-module-accent-soft`, `text-module-on-accent` | Pass                                                                                         |
| `bg-module-accent/50`, `border-module-accent/[.5]`, `ring-module-accent/20`                    | Fail: full-color token opacity modifier                                                      |
| `dark:text-module-accent`                                                                      | Fail under the proposed narrow identity rule; do not reintroduce a standalone ban on `dark:` |
| `dark:bg-gray-800`                                                                             | Fail under the existing neutral rule                                                         |
| `dark:bg-red-950/40`                                                                           | Pass: semantic color, existing UI-001 doctrine                                               |

### Allowlist effects

Current `apps/web/scripts/theme-allowlist.json` has **93 entries**. No new exemption is needed for CSS variables. Keep the five whole-surface entries at `:3–20`: `DarkGradientBackground.tsx`, `Starfield.tsx`, `app/modulos/**`, `app/(auth)/**`, and `components/sidebars/**`. Keep every status/chart/domain exception. Whole-file exemptions mean sidebar review must be deliberate: the guard does not inspect those files' colors (`check-theme-tokens.mjs:32–34`).

Specific possible reductions, only after actual later replacements:

- `theme-allowlist.json:33–40`, `comercial/pipeline/[id]/page.tsx`: remove exact `background: '#2563eb'` when the header marker at page `:203` migrates. Keep `color: '#2563eb'` while the separate action/data-link sites at `:218,465` remain global; keep the red/green literals. Do not delete the whole entry.
- Local filled-tab replacements may remove individual `'#fff'` exceptions from Operations alert/permit/procedure pages (`theme-allowlist.json:98–105,187–189,220–229`). Remove a literal only if **all** its occurrences in that file disappear. Other white action text still needs its existing exception. No entry expansion is proposed.
- Global body/sidebar chrome entries, semantic palettes and the hub allowlist stay as they are. New module shades exist only in token declarations, which do not match the guard's inline/SVG regex. Do not add raw colors to page/component allowlists to bypass the new tokens.

## 6. Scope and ordered recommendations

Counts below are source files observed, not estimates based on route count. A consumer can appear in several groups. The candidate-file manifests follow the table; Appendix A provides exact line-level boundaries.

| Priority / group                                 | Inspected candidate files / expected implementation files                            | Recommendation                                        | Reason and acceptance boundary                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Sidebar active item                           | 8 = seven sidebars + shared layout; **1 UI file** can implement the change in layout | **GO WITH CHANGES**                                   | Use exact ink for the 2 px active indicator in both themes. White labels, sidebar gradient, hover fill and count badge stay unchanged. Ink passes 3:1; ink text fails 4.5:1 on the light sidebar.                                        |
| 2. Existing page-header markers                  | **26 page files**: HSEC 8, Comercial 7, RRHH 6, Marketing 4, Gestión 1               | **GO WITH CHANGES**                                   | Theme-aware module accent on the existing marker only. No newly colored full headings, no new marker on Finance/Operations/calendar pages without one.                                                                                   |
| 3. Active local tabs / view toggles              | **14 files** (13 pages + `WorkPermitsTab`)                                           | **GO WITH CHANGES**                                   | Change active label and underline/fill as a pair. Never leave `text-white` on pale dark-theme accent; use on-accent. Keep inactive/semantic/form-control states and general backgrounds. Start with the two underlined detail-tab pages. |
| 4. Landing navigation / hover borders            | **5 page files**                                                                     | **GO WITH CHANGES**                                   | Scope to the seven listed local navigation/hover declarations; preserve backgrounds, metric values, text sizes, link affordances and global focus.                                                                                       |
| 5. Non-semantic section/icon accent              | **2 page files**, overlaps earlier groups                                            | **GO WITH CHANGES, LATER**                            | A secondary identity cue, lower user value. Soft tint never carries selected state alone; keep data/chart/alert-count colors.                                                                                                            |
| 6. Token and guard foundation                    | **4 files**, plus layout already counted                                             | **GO** as a prerequisite in the later approved ticket | Tokens + Tailwind + guard + guard tests. No dependencies or extra broad allowlist.                                                                                                                                                       |
| 7. Neutral breadcrumb/heading recolor            | **0 edits in the first wave**; all inventoried in Appendix A                         | **NO-GO for a blanket sweep**                         | A neutral heading is not an existing accent. If requested later, color only a module-identifying breadcrumb segment after markup and contrast review, not the whole trail.                                                               |
| 8. Actions, focus, shared controls, tables/forms | **0 planned edits**; K appears in 151 files                                          | **NO-GO**                                             | Keep app action blue and consistent form/link behavior. Color adoption must not recolor data rows, input states, tables or global chrome.                                                                                                |
| 9. Semantic/domain colors, charts, brand/hub     | **0 planned edits**; N appears in 131 files                                          | **NO-GO**                                             | Meaning, status and protected palette take priority over module identity.                                                                                                                                                                |

Full candidate inventory: **49 unique source files**. With centralized sidebar handling, only **42** of those need edits (seven sidebar consumers need inspection but no edits). Add the four foundation files → **46 potential implementation files**, or **47** including exact allowlist cleanup. These are an upper scoped wave estimate, not approval to modify all files. No new component is required for this color-only change. The first two visible groups plus infrastructure are **31 distinct files**, potentially 32 with the header's allowlist cleanup. Follow-up browser QA is required per wave.

### Candidate-file manifests

#### C-S — Sidebar consumers and shared rule

- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/components/sidebars/ActividadesSidebar.tsx`
- `apps/web/src/components/sidebars/ComercialSidebar.tsx`
- `apps/web/src/components/sidebars/FinanceSidebar.tsx`
- `apps/web/src/components/sidebars/HsecSidebar.tsx`
- `apps/web/src/components/sidebars/MarketingSidebar.tsx`
- `apps/web/src/components/sidebars/OperationsSidebar.tsx`
- `apps/web/src/components/sidebars/RrhhSidebar.tsx`

#### C-H — Header markers

- `apps/web/src/app/(dashboard)/actividades/areas/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/alertas/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/cuentas/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/cuentas/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/empresas/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/pipeline/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/pipeline/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/capacitaciones/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/capacitaciones/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/configuracion/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/epp/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/epp/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/incidentes/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/incidentes/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/page.tsx`
- `apps/web/src/app/(dashboard)/marketing/calendario/page.tsx`
- `apps/web/src/app/(dashboard)/marketing/campanas/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/marketing/campanas/page.tsx`
- `apps/web/src/app/(dashboard)/marketing/presencia/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/cargos/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/disponibilidad/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/parametros/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/trabajadores/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/trabajadores/page.tsx`

#### C-T — Local tabs and view selection

- `apps/web/src/app/(dashboard)/actividades/calendario/page.tsx`
- `apps/web/src/app/(dashboard)/actividades/gestion/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/cuentas/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/comercial/pipeline/page.tsx`
- `apps/web/src/app/(dashboard)/conciliacion/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/alertas/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/calendario/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/cobertura-acuses/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/configuracion/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/permisos/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/procedimientos/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/trabajadores/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/tributario/page.tsx`
- `apps/web/src/components/operations/WorkPermitsTab.tsx`

#### C-L — Local navigation and landing hover

- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/hsec/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/reportes/page.tsx`
- `apps/web/src/app/(dashboard)/rrhh/page.tsx`

#### C-I — Non-semantic identity accents

- `apps/web/src/app/(dashboard)/comercial/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/operaciones/auditoria/page.tsx`

## 7. Risks and rollout checks

1. **Light-theme readability.** Pale hub ink/border cannot become light-page text. Do not lower opacity on the proposed accent. Test normal-sized labels, not only headings. Source values alone cannot prove contrast on a new tinted surface.
2. **Sidebar is not a light page.** A route-wide light accent would disappear against its blue background. Use the dedicated ink binding, leave white labels and count semantics. The 3.133 Finance indicator result has limited margin: never apply the hub scene's reduced opacity to navigation.
3. **Global accent consistency.** `--color-accent` remains `#2563eb`. Identity accents are reserved for wayfinding. Save/Create/Delete controls, focus rings, notification links, file icons, cross-module origin links and charts must not inherit a new hue via a blanket variable override.
4. **Existing contrast debt remains separate.** Current global blue `#2563eb` has 5.169:1 on white and 4.696:1 on LS, but only 3.709:1 on DP and 3.003:1 on DS: F for normal dark-theme text. Preserving it here is a scope decision, not certification of those existing links. A global accessibility correction should be a separate approved ticket, not hidden inside module adoption.
5. **Semantic collision.** HSEC green is not success; Operations orange is not warning; Gestión/Finance blue is not info. Keep labels, position and selection shape as the meaning of module color. Never recolor overdue badges, errors, risk/severity, to-do priorities, cash/margin series, account/quote stages, or user-chosen category/area colors. The sidebar's amber alert counts and the hub status tokens remain independent.
6. **`dark:` and token opacity.** Use root/dark token overrides, no identity-color `dark:` utilities and no `/50`. Semantic color variants remain allowed. Guard coverage is lexical and allowlist-sensitive; test examples, do not infer accessibility from a green guard alone.
7. **Shared styled-JSX/global selectors.** The Operations `.ops-breadcrumb` definitions repeat across pages, sometimes with `html.dark` overrides (`operaciones/auditoria/page.tsx:282–291`). Do not make a global breadcrumb rule module-colored; restrict any future addition to the module-name fragment. Do not recolor `NotificationCenter` merely because it sits inside the route shell.
8. **Meaningful state vs decoration.** Keep underlines/left borders and labels; selected tint alone is insufficient. Preserve accessible selected/current attributes, focus visibility, keyboard navigation and disabled state. Only recoloring an existing marker must not change geometry or content.
9. **Transparent cards and future surfaces.** The conservative gradient calculation is source-based. Browser QA must inspect actual parent layers and hover/active states in light and dark; remeasure if a new image, glow, overlay or stronger soft fill is introduced.
10. **Route boundaries and portals.** Map known Finance routes explicitly, keep app-wide settings/notifications global, and avoid a route-key fallback that changes shared content. Modals/forms remain global even if rendered below a module-colored wrapper.

Suggested later release check: compare before/after screenshots of sidebar and header first, then active/hover/focus tab states on each module in both themes; inspect computed foreground/background colors, including alpha compositing; verify labels and non-color state cues; check semantic badges, tables, forms, charts and logos have not changed; run the theme guard and its new utility cases. This audit does not claim that browser QA has already been performed for unimplemented tokens.

## 8. Verification and reproducibility

Only `docs/HUB-005-COLOR-ADOPTION-AUDIT.md` is created. No product code, styles, tokens, allowlist, `CLAUDE.md` or `next-env.d.ts` is changed. No Git command is used. No app/build/test execution is needed for this report-only ticket.

Required formatting verification:

```sh
npx prettier --check docs/HUB-005-COLOR-ADOPTION-AUDIT.md
```

The inventory searches (run from the repository root) are represented below. The exact quoted lines, including adjacent paired colors, are preserved in Appendix A so the audit remains reviewable as code moves.

```sh
rg -n -i -- '#2563eb|--color-accent[\w-]*|(?:text|bg|border|ring|fill|stroke|from|to|via|outline)-accent(?:-[a-z]+)?' apps/web/src
rg -n -- '(?:text|bg|border|ring|fill|stroke|from|to|via|outline)-blue-\d+|tn-nav__item--active|sidebar-active-(?:border|bg)|aria-current|aria-selected|role="tab"' apps/web/src
rg -n -i -- '<h1\b|breadcrumb' apps/web/src
rg -n -- '\bACCENT\b|rgba?\(\s*37\s*,\s*99\s*,\s*235|(?:scope|tab|view)\s*===.*\?|borderBottom:.*\?|aria-pressed=' apps/web/src
rg -n -i -- '#(?:1d4ed8|3b82f6|60a5fa)\b' apps/web/src
```

The following dependency-free Python reproduces the contrast calculation and the constrained nearest-color search; it only reads the existing token file. It is embedded in this document rather than adding another repository artifact. Main matrix inputs are the token values and the composites in §4.1. Use unrounded channels throughout; hex rendering in the document is only a display convenience.

```python
import math
import re
from pathlib import Path

css = Path("apps/web/src/styles/tokens.css").read_text()
keys = ["finanzas", "operaciones", "hsec", "comercial", "marketing", "rrhh", "gestion"]


def rgb(value):
    return tuple(int(value.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))


def mix(front, back, alpha):
    return tuple(alpha * f + (1 - alpha) * b for f, b in zip(front, back))


def luminance(color):
    def linear(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return sum(w * linear(v) for w, v in zip((0.2126, 0.7152, 0.0722), color))


def contrast(a, b):
    x, y = sorted((luminance(a), luminance(b)))
    return (y + 0.05) / (x + 0.05)


def nearest(source, backgrounds, target):
    for step in range(10001):
        # Smallest tested black mix; quantize exactly as the stored proposal.
        result = tuple(math.floor(v * (1 - step / 10000) + 0.5) for v in source)
        if min(contrast(result, b) for b in backgrounds) >= target:
            return "#" + "".join(f"{v:02x}" for v in result), step / 100
    raise ValueError("No compliant candidate on the constrained ray")


white, subtle, dark, dark_subtle = map(rgb, ("#ffffff", "#f3f4f6", "#0f0f0f", "#242424"))
gradient_bound = mix(rgb("#2563eb"), mix(rgb("#8b5cf6"), rgb("#1a1a22"), 0.05), 0.06)
backgrounds = [white, subtle, dark, mix(rgb("#1c1c1e"), dark, 0.5),
               mix(rgb("#1c1c1e"), gradient_bound, 0.5), dark_subtle, gradient_bound]
for key in keys:
    values = {name: rgb(re.search(r"--hub-" + key + "-" + name + r": (#[0-9a-f]+);", css)[1])
              for name in ("from", "border", "ink")}
    for name, value in values.items():
        print(key, name, [round(contrast(value, bg), 6) for bg in backgrounds])
    for name in ("ink", "border"):
        print(key, name, "nearest", {t: nearest(values[name], [subtle], t) for t in (3, 4.5)})
    soft = mix(values["border"], subtle, 0.08)
    print(key, "proposal", nearest(values["from"], [values["ink"], soft], 4.6))
```

## Appendix A. Complete classified source inventory

Every row quotes the source text at the stated line, under its exact file heading. The file heading plus line number is the `file:line` reference. C-S/C-H/C-T/C-L/C-I are **candidate for module accent**; K is **keep global accent**; N is **not applicable**. Repeated snippets are intentionally retained: the goal is an exhaustive, traceable search ledger, not a representative sample. Sources are the working-tree snapshot on 2026-09-17; no line is a request to edit the whole surrounding file.

### `apps/web/src/app/(dashboard)/actividades/alertas/page.tsx`

| Line | Source quote                                                                                                                        | Class |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 20   | `'rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-subtle-hover disabled:opacity-50 focus-visible:outline-accent';` | K     |
| 96   | `<Link href="/actividades" className="hover:underline focus-visible:outline-accent">`                                               | K     |
| 100  | `<span aria-current="page">Alertas</span>`                                                                                          | N     |
| 103  | `<h1 className="text-2xl font-bold text-fg" style={{ fontFamily: 'var(--font-display)' }}>`                                         | N     |
| 120  | `aria-pressed={effectiveScope === 'mine'}`                                                                                          | N     |
| 132  | `aria-pressed={effectiveScope === 'all'}`                                                                                           | N     |
| 205  | `className="text-sm text-fg underline underline-offset-2 hover:no-underline focus-visible:outline-accent"`                          | K     |

### `apps/web/src/app/(dashboard)/actividades/areas/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 8    | `* 409) shown verbatim. Tokens: accent #2563eb, Outfit, glassmorphism. */`                  | N     |
| 78   | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 79   | `<h1`                                                                                       | N     |
| 93   | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/actividades/calendario/page.tsx`

| Line | Source quote                                                                        | Class |
| ---- | ----------------------------------------------------------------------------------- | ----- |
| 419  | `<h1 className="text-2xl font-semibold text-[var(--text-primary)]">Calendario</h1>` | N     |
| 433  | `role="tab"`                                                                        | C-T   |
| 434  | `aria-selected={view === v}`                                                        | C-T   |
| 439  | `? 'bg-blue-600 text-white'`                                                        | C-T   |
| 452  | `style={{ background: 'var(--color-accent)' }}`                                     | K     |
| 512  | `? 'bg-blue-600 text-white'`                                                        | C-T   |
| 566  | `aria-pressed={showServicios}`                                                      | N     |
| 581  | `aria-pressed={showVencimientos}`                                                   | N     |
| 597  | `aria-pressed={showCampanas}`                                                       | N     |
| 616  | `aria-pressed={showCierres}`                                                        | N     |
| 633  | `aria-pressed={showAusencias}`                                                      | N     |
| 661  | `) : view === 'month' ? (`                                                          | N     |
| 675  | `) : view === 'week' ? (`                                                           | N     |

### `apps/web/src/app/(dashboard)/actividades/gestion/page.tsx`

| Line | Source quote                                                           | Class |
| ---- | ---------------------------------------------------------------------- | ----- |
| 353  | `<h1 className="text-2xl font-semibold text-[var(--text-primary)]">`   | N     |
| 378  | `style={{ background: 'var(--color-accent)' }}`                        | K     |
| 393  | `color="#1d4ed8"`                                                      | K     |
| 1072 | `<tr className="bg-[rgba(37,99,235,0.03)]" onBlur={onRowBlur}>`        | K     |
| 1206 | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',` | C-T   |
| 1207 | `background: active ? 'rgba(37,99,235,0.12)' : 'transparent',`         | C-T   |
| 1208 | `color: active ? '#1d4ed8' : 'var(--text-secondary)',`                 | C-T   |

### `apps/web/src/app/(dashboard)/actividades/todos/page.tsx`

| Line | Source quote                                                                                                                        | Class |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 21   | `'w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg focus-visible:outline-accent';`                           | K     |
| 23   | `'rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-subtle-hover disabled:opacity-50 focus-visible:outline-accent';` | K     |
| 25   | `'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-accent';`                 | K     |
| 109  | `<h1 className="text-2xl font-bold text-fg" style={{ fontFamily: 'var(--font-display)' }}>`                                         | N     |
| 123  | `aria-pressed={effectiveScope === 'mine'}`                                                                                          | N     |
| 131  | `aria-pressed={effectiveScope === 'all'}`                                                                                           | N     |
| 344  | `className="text-fg-secondary focus-visible:outline-accent"`                                                                        | K     |

### `apps/web/src/app/(dashboard)/alertas/page.tsx`

| Line | Source quote                                                                                                                                        | Class |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 112  | `<h1 className="text-2xl text-fg">Alertas</h1>`                                                                                                     | N     |
| 116  | `className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"`          | K     |
| 139  | `<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">` | N     |

### `apps/web/src/app/(dashboard)/banco/cartola/page.tsx`

| Line | Source quote                                                                                                                     | Class |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 194  | `<h1 className="text-2xl font-bold text-fg mb-6">Importar Cartola Manual</h1>`                                                   | N     |
| 196  | `<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-900">`                                  | K     |
| 198  | `<p className="text-blue-700 text-xs leading-relaxed">`                                                                          | K     |
| 269  | `? 'border-line hover:border-blue-400 cursor-pointer'`                                                                           | K     |
| 407  | `className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"` | K     |
| 437  | `className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"`                     | K     |

### `apps/web/src/app/(dashboard)/banco/page.tsx`

| Line | Source quote                                                                                                                                 | Class |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 60   | `RUNNING: { label: 'Ejecutando', cls: 'bg-blue-100 text-blue-700' },`                                                                        | N     |
| 225  | `<h1 className="text-2xl text-fg">Conexiones Bancarias</h1>`                                                                                 | N     |
| 237  | `className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"`                       | K     |
| 283  | `className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"`                           | K     |
| 327  | `<div className="p-2 bg-blue-100 rounded-lg">`                                                                                               | K     |
| 328  | `<Landmark size={18} className="text-blue-600" />`                                                                                           | K     |
| 356  | `className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1"` | K     |
| 368  | `className={isHistoryOpen ? 'text-blue-600' : 'text-fg-muted'}`                                                                              | K     |

### `apps/web/src/app/(dashboard)/caja/compromisos/[id]/page.tsx`

| Line | Source quote                               | Class |
| ---- | ------------------------------------------ | ----- |
| 85   | `<h1`                                      | N     |
| 145  | `style={{ color: 'var(--color-accent)' }}` | K     |

### `apps/web/src/app/(dashboard)/caja/nuevo-compromiso/page.tsx`

| Line | Source quote                                                                                                                             | Class |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 84   | `<h1 className="text-2xl font-bold text-fg mb-6">Nuevo Compromiso</h1>`                                                                  | N     |
| 120  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 130  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 144  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 160  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 174  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 197  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 214  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"` | K     |
| 228  | `className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"`         | K     |

### `apps/web/src/app/(dashboard)/caja/page.tsx`

| Line | Source quote                                                                                                                           | Class |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 65   | `CHECKING: 'bg-blue-50 text-blue-700 border-blue-200',`                                                                                | N     |
| 185  | `<h1 className="text-2xl text-[var(--text-primary)]">Caja y Tesorería</h1>`                                                            | N     |
| 400  | `className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"` | K     |

### `apps/web/src/app/(dashboard)/categorias/page.tsx`

| Line | Source quote                                                          | Class |
| ---- | --------------------------------------------------------------------- | ----- |
| 24   | `'var(--color-accent)',`                                              | N     |
| 151  | `<h1 className="text-2xl text-[var(--text-primary)]">Categorías</h1>` | N     |
| 468  | `border-color: #2563eb;`                                              | K     |
| 469  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                       | K     |

### `apps/web/src/app/(dashboard)/categorias/reglas/page.tsx`

| Line | Source quote                                                                                                                         | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 167  | `<h1 className="text-2xl text-[var(--text-primary)] flex items-center gap-2">`                                                       | N     |
| 239  | `? { label: 'RUT', cls: 'bg-blue-100 text-blue-700' }`                                                                               | N     |
| 284  | `<span className="inline-flex items-center justify-center w-8 h-4 rounded-full bg-blue-600">`                                        | N     |
| 423  | `className="w-full px-3 py-2 text-sm border border-line rounded-lg bg-input text-fg focus-visible:ring-2 focus-visible:ring-accent"` | K     |
| 429  | `className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"`                   | K     |
| 599  | `aria-pressed={draft.ruleType === t}`                                                                                                | N     |
| 602  | `? 'bg-blue-600 text-white border-blue-600'`                                                                                         | K     |
| 669  | `? 'bg-blue-600 text-white border-blue-600'`                                                                                         | K     |
| 724  | `className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"`                   | K     |

### `apps/web/src/app/(dashboard)/cierre/page.tsx`

| Line | Source quote                                                                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 225  | `<h1 className="text-2xl text-fg flex items-center gap-2">`                                                                                | N     |
| 311  | `className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"` | K     |
| 477  | `confirmVariant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';`                                           | K     |
| 569  | `<SummaryStat label="Libre" value={formatCLP(summary.cash.free)} color="text-blue-600" />`                                                 | N     |

### `apps/web/src/app/(dashboard)/comercial/alertas/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 85   | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 86   | `<h1`                                                                                       | N     |
| 95   | `style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}`           | N     |
| 158  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |
| 187  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |
| 228  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |

### `apps/web/src/app/(dashboard)/comercial/cuentas/[id]/page.tsx`

| Line | Source quote                                                                   | Class |
| ---- | ------------------------------------------------------------------------------ | ----- |
| 8    | `* accent #2563eb, Outfit headings, glassmorphism cards. */`                   | N     |
| 117  | `style={{ background: 'var(--color-accent)' }}`                                | C-H   |
| 120  | `<h1`                                                                          | N     |
| 158  | `color: tab === t.key ? 'var(--color-accent)' : 'var(--text-secondary)',`      | C-T   |
| 159  | `fontWeight: tab === t.key ? 600 : 400,`                                       | C-T   |
| 160  | `borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',` | C-T   |
| 260  | `style={{ color: 'var(--color-accent)' }}`                                     | K     |
| 284  | `<Link2 size={15} style={{ color: 'var(--color-accent)' }} />`                 | K     |
| 336  | `style={{ background: 'var(--color-accent)' }}`                                | K     |
| 400  | `style={{ color: 'var(--color-accent)' }}`                                     | K     |

### `apps/web/src/app/(dashboard)/comercial/cuentas/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 7    | `* accent #2563eb, Outfit headings.`                                                        | N     |
| 135  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 136  | `<h1`                                                                                       | N     |
| 150  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 296  | `background: 'rgba(37,99,235,0.1)',`                                                        | N     |
| 297  | `color: 'var(--color-accent)',`                                                             | N     |
| 368  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |

### `apps/web/src/app/(dashboard)/comercial/dashboard/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 112  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 113  | `<h1`                                                                                       | N     |
| 161  | `aria-pressed={preset === p}`                                                               | N     |
| 167  | `style={preset === p ? { background: 'var(--color-accent)' } : undefined}`                  | K     |
| 309  | `<Cell key={s.stage} fill="var(--color-accent)" />`                                         | N     |
| 386  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |
| 436  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |
| 504  | `style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}`           | C-I   |

### `apps/web/src/app/(dashboard)/comercial/empresas/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 119  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 120  | `<h1`                                                                                       | N     |
| 135  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 305  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |

### `apps/web/src/app/(dashboard)/comercial/pipeline/[id]/opportunity-documents.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 239  | `style={{ background: 'var(--color-accent)' }}` | K     |
| 296  | `background: 'var(--color-accent-dim)',`        | N     |
| 297  | `color: 'var(--color-accent)',`                 | N     |
| 309  | `style={{ color: 'var(--color-accent)' }}`      | K     |

### `apps/web/src/app/(dashboard)/comercial/pipeline/[id]/opportunity-notes.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 185  | `style={{ background: 'var(--color-accent)' }}` | K     |
| 270  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/app/(dashboard)/comercial/pipeline/[id]/page.tsx`

| Line | Source quote                                                                             | Class |
| ---- | ---------------------------------------------------------------------------------------- | ----- |
| 8    | `* via /comercial/permissions. Tokens: accent #2563eb, Outfit headings, glass cards. */` | N     |
| 203  | `<span className="h-7 w-1.5 rounded-full" style={{ background: '#2563eb' }} />`          | C-H   |
| 205  | `<h1`                                                                                    | N     |
| 218  | `style={{ color: '#2563eb' }}`                                                           | K     |
| 465  | `style={{ color: '#2563eb' }}`                                                           | K     |

### `apps/web/src/app/(dashboard)/comercial/pipeline/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 16   | `* Tokens: accent #2563eb, Outfit headings.`                                                | N     |
| 366  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 367  | `<h1`                                                                                       | N     |
| 378  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 418  | `aria-pressed={view === v}`                                                                 | C-T   |
| 425  | `style={view === v ? { background: 'var(--color-accent)' } : undefined}`                    | C-T   |
| 441  | `{view === 'table' ? (`                                                                     | N     |
| 517  | `borderColor: over ? 'var(--color-accent)' : 'var(--border-color)',`                        | K     |
| 518  | `boxShadow: over ? '0 0 0 1px #2563eb inset' : undefined,`                                  | K     |

### `apps/web/src/app/(dashboard)/conciliacion/page.tsx`

| Line | Source quote                                                                                                                                 | Class |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 232  | `<h1 className="text-2xl text-fg flex items-center gap-2">`                                                                                  | N     |
| 244  | `className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"`   | K     |
| 352  | `? 'bg-blue-600 text-white'`                                                                                                                 | C-T   |
| 368  | `? 'bg-blue-600 text-white'`                                                                                                                 | C-T   |
| 422  | `className="text-xs text-blue-600 hover:underline"`                                                                                          | K     |
| 469  | `className="text-xs text-blue-600 hover:underline"`                                                                                          | K     |
| 711  | `? 'bg-blue-50 text-blue-700 hover:bg-blue-100'`                                                                                             | K     |
| 719  | ``className={`text-xs ${selectedId === c.id ? 'text-blue-700' : 'text-fg-muted'}`}``                                                         | K     |
| 744  | `className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"` | K     |
| 769  | `? 'bg-blue-600 text-white border-blue-600'`                                                                                                 | K     |

### `apps/web/src/app/(dashboard)/configuracion/page.tsx`

| Line | Source quote                                                                  | Class |
| ---- | ----------------------------------------------------------------------------- | ----- |
| 83   | `<h1 className="text-2xl text-[var(--text-primary)] mb-2">Configuración</h1>` | N     |
| 112  | `<div className="p-2 rounded-lg bg-blue-50">`                                 | K     |
| 113  | `<UsersIcon size={18} className="text-blue-600" />`                           | K     |
| 158  | `border-color: #2563eb;`                                                      | K     |
| 159  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                               | K     |
| 252  | `<div className="p-2 rounded-lg bg-blue-50">`                                 | K     |
| 253  | `<Building2 size={18} className="text-blue-600" />`                           | K     |
| 460  | `<div className="p-2 rounded-lg bg-blue-50">`                                 | K     |
| 461  | `<CalendarClock size={18} className="text-blue-600" />`                       | K     |
| 493  | `background: active ? 'var(--color-accent)' : 'var(--bg-card)',`              | K     |
| 494  | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',`        | K     |
| 664  | `<div className="p-2 rounded-lg bg-blue-50">`                                 | K     |
| 665  | `<Bell size={18} className="text-blue-600" />`                                | K     |

### `apps/web/src/app/(dashboard)/configuracion/usuarios/page.tsx`

| Line | Source quote                                                                             | Class |
| ---- | ---------------------------------------------------------------------------------------- | ----- |
| 28   | `color: 'var(--color-accent)',`                                                          | K     |
| 29   | `badgeCls: 'bg-blue-50 text-blue-700',`                                                  | K     |
| 31   | `MANAGER: { label: 'Gerente', color: '#3B82F6', badgeCls: 'bg-blue-50 text-blue-600' },` | K     |
| 153  | `<h1 className="text-2xl text-[var(--text-primary)]">Usuarios</h1>`                      | N     |
| 299  | `border-color: #2563eb;`                                                                 | K     |
| 300  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                          | K     |

### `apps/web/src/app/(dashboard)/contrapartes/page.tsx`

| Line | Source quote                                                                                        | Class |
| ---- | --------------------------------------------------------------------------------------------------- | ----- |
| 42   | `CLIENT: { label: 'Cliente', color: 'var(--color-accent)', badgeCls: 'bg-blue-50 text-blue-700' },` | N     |
| 166  | `<h1 className="text-2xl text-[var(--text-primary)]">Contrapartes</h1>`                             | N     |
| 375  | `border-color: #2563eb;`                                                                            | K     |
| 376  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                                     | K     |

### `apps/web/src/app/(dashboard)/dashboard/page.tsx`

| Line | Source quote                                                                         | Class |
| ---- | ------------------------------------------------------------------------------------ | ----- |
| 129  | `if (margin > 20) return 'text-blue-600';`                                           | N     |
| 265  | `'var(--color-accent)',`                                                             | N     |
| 266  | `'#3B82F6',`                                                                         | N     |
| 267  | `'#60A5FA',`                                                                         | N     |
| 452  | `<h1 className="text-2xl text-[var(--text-primary)]">Dashboard</h1>`                 | N     |
| 599  | `color="text-blue-600"`                                                              | N     |
| 650  | `fillColor={incomeVsGoal >= 100 ? '#16a34a' : 'var(--color-accent)'}`                | N     |
| 716  | `className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"` | K     |
| 806  | `stroke="var(--color-accent)"`                                                       | N     |
| 837  | `style={{ backgroundColor: 'var(--color-accent)' }}`                                 | N     |
| 885  | `<Cell fill="var(--color-accent)" />`                                                | N     |
| 894  | `style={{ backgroundColor: 'var(--color-accent)' }}`                                 | N     |
| 986  | `color: 'var(--color-accent)',`                                                      | N     |
| 1038 | `<Link href="/caja" className="text-xs text-blue-600 hover:underline">`              | C-L   |
| 1085 | `<Link href="/movimientos" className="text-xs text-blue-600 hover:underline">`       | C-L   |
| 1338 | `color="text-blue-600"`                                                              | N     |
| 1406 | `fill="var(--color-accent)"`                                                         | N     |
| 1478 | `fill="var(--color-accent)"`                                                         | N     |
| 1516 | `stroke="var(--color-accent)"`                                                       | N     |
| 1537 | `style={{ backgroundColor: 'var(--color-accent)' }}`                                 | N     |

### `apps/web/src/app/(dashboard)/hsec/capacitaciones/[id]/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 172  | `className="mt-3 inline-flex items-center gap-1 text-sm text-[#2563eb]"`                    | K     |
| 195  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 196  | `<h1`                                                                                       | N     |
| 293  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 355  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/capacitaciones/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 107  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 108  | `<h1`                                                                                       | N     |
| 118  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/configuracion/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 129  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 130  | `<h1`                                                                                       | N     |
| 169  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/epp/[id]/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 131  | `className="mt-3 inline-flex items-center gap-1 text-sm text-[#2563eb]"`                    | K     |
| 152  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 153  | `<h1`                                                                                       | N     |
| 277  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/epp/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 102  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 103  | `<h1`                                                                                       | N     |
| 113  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/incidentes/[id]/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 167  | `className="mt-3 inline-flex items-center gap-1 text-sm text-[#2563eb]"`                    | K     |
| 191  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 192  | `<h1`                                                                                       | N     |
| 280  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 357  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/incidentes/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 131  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 132  | `<h1`                                                                                       | N     |
| 142  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/hsec/page.tsx`

| Line | Source quote                                                                                                        | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| 68   | `'block rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 transition hover:border-[#2563eb]';` | C-L   |
| 73   | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />`                         | C-H   |
| 74   | `<h1`                                                                                                               | N     |

### `apps/web/src/app/(dashboard)/layout.tsx`

| Line | Source quote                                       | Class |
| ---- | -------------------------------------------------- | ----- |
| 193  | `background-color: var(--sidebar-active-bg);`      | N     |
| 197  | `.tn-nav__item--active,`                           | C-S   |
| 198  | `.tn-nav__item--active:hover {`                    | C-S   |
| 200  | `background-color: var(--sidebar-active-bg);`      | N     |
| 201  | `border-left-color: var(--sidebar-active-border);` | C-S   |
| 206  | `background: var(--sidebar-active-border);`        | N     |

### `apps/web/src/app/(dashboard)/marketing/calendario/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 9    | `* accent #2563eb, Outfit headings, glassmorphism. */`                                      | N     |
| 131  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 132  | `<h1`                                                                                       | N     |

### `apps/web/src/app/(dashboard)/marketing/campanas/[id]/page.tsx`

| Line | Source quote                                                   | Class |
| ---- | -------------------------------------------------------------- | ----- |
| 10   | `* Tokens: accent #2563eb, Outfit headings, glassmorphism. */` | N     |
| 162  | `style={{ background: 'var(--color-accent)' }}`                | C-H   |
| 165  | `<h1`                                                          | N     |
| 345  | `style={{ color: 'var(--color-accent)' }}`                     | K     |

### `apps/web/src/app/(dashboard)/marketing/campanas/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 6    | `* Tokens: accent #2563eb, Outfit headings, glassmorphism. */`                              | N     |
| 83   | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 84   | `<h1`                                                                                       | N     |
| 98   | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/marketing/presencia/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 8    | `* without data render as GAPS — never an interpolated line. Tokens: accent #2563eb,`       | N     |
| 150  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 206  | `borderColor: 'var(--color-accent)',`                                                       | N     |
| 207  | `color: 'var(--color-accent)',`                                                             | N     |
| 252  | `stroke="var(--color-accent)"`                                                              | N     |
| 289  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 290  | `<h1`                                                                                       | N     |

### `apps/web/src/app/(dashboard)/movimientos/importar/page.tsx`

| Line | Source quote                                                                                                                         | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 112  | `<h1 className="text-2xl font-bold text-fg">Importar Movimientos</h1>`                                                               | N     |
| 126  | `className="bg-card border-2 border-dashed border-line rounded-xl p-12 text-center hover:border-blue-400 transition cursor-pointer"` | K     |
| 247  | `className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"`     | K     |
| 281  | `className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"`                         | K     |

### `apps/web/src/app/(dashboard)/movimientos/nuevo/page.tsx`

| Line | Source quote                                                                                                                                         | Class |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 94   | `<h1 className="text-2xl font-bold text-fg mb-6">Nuevo Movimiento</h1>`                                                                              | N     |
| 130  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 140  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 152  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"` | K     |
| 166  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 183  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 206  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 222  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 243  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |
| 254  | `className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"`             | K     |

### `apps/web/src/app/(dashboard)/movimientos/page.tsx`

| Line | Source quote                                                                                                                                                                                  | Class |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 298  | `<h1 className="text-2xl text-[var(--text-primary)]">Movimientos</h1>`                                                                                                                        | N     |
| 330  | `className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"`                                                                        | K     |
| 389  | `fill="var(--color-accent)"`                                                                                                                                                                  | N     |
| 525  | `className="text-xs text-blue-600 hover:underline px-2 py-2"`                                                                                                                                 | K     |
| 558  | `className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-fg bg-card border border-line rounded-lg hover:bg-subtle-hover focus-visible:ring-2 focus-visible:ring-accent"` | K     |

### `apps/web/src/app/(dashboard)/notificaciones/page.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 60   | `INFO: { label: 'Info', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },` | K     |
| 257  | `<div className="ops-breadcrumb">Notificaciones</div>`                   | N     |
| 259  | `<h1`                                                                    | N     |
| 321  | `background: tab === t ? 'var(--color-accent)' : 'transparent',`         | K     |
| 322  | `color: tab === t ? '#fff' : 'var(--text-secondary)',`                   | N     |
| 400  | `style={{ accentColor: 'var(--color-accent)' }}`                         | K     |
| 423  | `background: n.isRead ? 'transparent' : 'rgba(37, 99, 235, 0.04)',`      | K     |
| 430  | `style={{ accentColor: 'var(--color-accent)', marginTop: 4 }}`           | K     |
| 471  | `background: 'var(--color-accent)',`                                     | K     |
| 562  | `.ops-breadcrumb {`                                                      | N     |
| 570  | `html.dark .ops-breadcrumb {`                                            | N     |
| 585  | `border-color: #2563eb;`                                                 | K     |
| 586  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                          | K     |

### `apps/web/src/app/(dashboard)/operaciones/alertas/page.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 528  | `<div className="ops-breadcrumb">Operaciones / Alertas</div>`                      | N     |
| 531  | `<h1`                                                                              | N     |
| 770  | `background: active ? 'rgba(37, 99, 235, 0.12)' : 'transparent',`                  | K     |
| 771  | `color: active ? '#1d4ed8' : 'var(--text-secondary)',`                             | K     |
| 772  | ``border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border-color)'}`,`` | K     |
| 820  | `background: view === 'list' ? 'var(--color-accent)' : 'transparent',`             | C-T   |
| 821  | `color: view === 'list' ? '#fff' : 'var(--text-secondary)',`                       | C-T   |
| 832  | `background: view === 'cards' ? 'var(--color-accent)' : 'transparent',`            | C-T   |
| 833  | `color: view === 'cards' ? '#fff' : 'var(--text-secondary)',`                      | C-T   |
| 855  | `) : view === 'list' ? (`                                                          | N     |
| 1066 | ``border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border-color)'}`,`` | K     |
| 1067 | `boxShadow: active ? '0 0 0 3px rgba(37,99,235,0.08)' : 'none',`                   | K     |
| 1122 | `bg: 'rgba(37, 99, 235, 0.08)',`                                                   | N     |
| 1123 | `fg: '#1d4ed8',`                                                                   | N     |
| 1124 | `activeBg: 'rgba(37, 99, 235, 0.18)',`                                             | N     |
| 1233 | `style={{ accentColor: 'var(--color-accent)' }}`                                   | K     |
| 1298 | `style={{ accentColor: 'var(--color-accent)' }}`                                   | K     |
| 1688 | `.ops-breadcrumb {`                                                                | N     |
| 1696 | `html.dark .ops-breadcrumb {`                                                      | N     |
| 1714 | `border-color: #2563eb;`                                                           | K     |
| 1715 | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                    | K     |

### `apps/web/src/app/(dashboard)/operaciones/aprobaciones/page.tsx`

| Line | Source quote                                                | Class |
| ---- | ----------------------------------------------------------- | ----- |
| 228  | `<h1`                                                       | N     |
| 403  | `color: it.kind === 'work-permit' ? '#F97316' : '#1d4ed8',` | K     |
| 414  | `className="text-blue-600 hover:underline"`                 | K     |

### `apps/web/src/app/(dashboard)/operaciones/auditoria/page.tsx`

| Line | Source quote                                                                              | Class |
| ---- | ----------------------------------------------------------------------------------------- | ----- |
| 105  | `blue: { bg: 'rgba(37, 99, 235, 0.1)', fg: '#1d4ed8', ring: 'rgba(37, 99, 235, 0.25)' },` | N     |
| 216  | `<div className="ops-breadcrumb">Operaciones / Auditoría</div>`                           | N     |
| 217  | `<h1`                                                                                     | N     |
| 282  | `.ops-breadcrumb {`                                                                       | N     |
| 290  | `html.dark .ops-breadcrumb {`                                                             | N     |
| 306  | `border-left: 3px solid #2563eb;`                                                         | C-I   |
| 312  | `background: rgba(37, 99, 235, 0.12);`                                                    | C-I   |
| 313  | `color: #1d4ed8;`                                                                         | C-I   |
| 359  | `border-color: #2563eb;`                                                                  | K     |
| 360  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                           | K     |
| 660  | `background: preset === p ? 'rgba(37, 99, 235, 0.12)' : 'transparent',`                   | K     |
| 661  | `borderColor: preset === p ? 'var(--color-accent)' : 'var(--border-color)',`              | K     |
| 662  | `color: preset === p ? '#1d4ed8' : 'var(--text-secondary)',`                              | K     |
| 715  | `background: checked ? 'rgba(37, 99, 235, 0.05)' : 'transparent',`                        | K     |
| 725  | `style={{ accentColor: 'var(--color-accent)' }}`                                          | K     |
| 998  | `borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-color)',`                  | K     |
| 1002 | `background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',`                   | K     |

### `apps/web/src/app/(dashboard)/operaciones/calendario/page.tsx`

| Line | Source quote                                                         | Class |
| ---- | -------------------------------------------------------------------- | ----- |
| 341  | `<h1 className="text-2xl font-semibold text-[var(--text-primary)]">` | N     |
| 358  | `role="tab"`                                                         | C-T   |
| 359  | `aria-selected={view === v}`                                         | C-T   |
| 364  | `? 'bg-blue-600 text-white'`                                         | C-T   |
| 461  | `fg="#1d4ed8"`                                                       | K     |
| 462  | `bg="rgba(37,99,235,0.10)"`                                          | K     |
| 537  | `) : view === 'month' ? (`                                           | N     |
| 564  | `) : view === 'week' ? (`                                            | N     |
| 588  | `) : view === 'day' ? (`                                             | N     |

### `apps/web/src/app/(dashboard)/operaciones/cobertura-acuses/page.tsx`

| Line | Source quote                                                  | Class |
| ---- | ------------------------------------------------------------- | ----- |
| 237  | `<h1`                                                         | N     |
| 299  | `) : tab === 'procedimientos' ? (`                            | N     |
| 378  | `className="text-xs text-blue-600 hover:underline mr-2"`      | K     |
| 386  | `className="text-xs text-blue-600 hover:underline"`           | K     |
| 430  | `className="text-blue-600 hover:underline"`                   | K     |
| 501  | `className="text-blue-600 hover:underline"`                   | K     |
| 526  | `className="text-xs text-blue-600 hover:underline"`           | K     |
| 575  | `className="text-xs text-blue-600 hover:underline"`           | K     |
| 643  | `background: active ? 'var(--color-accent)' : 'transparent',` | C-T   |
| 644  | `color: active ? '#fff' : 'var(--text-secondary)',`           | C-T   |

### `apps/web/src/app/(dashboard)/operaciones/configuracion/page.tsx`

| Line | Source quote                                                                                               | Class |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----- |
| 172  | `<div className="ops-breadcrumb">Operaciones / Configuración</div>`                                        | N     |
| 173  | `<h1`                                                                                                      | N     |
| 212  | `? 'bg-blue-600 text-white shadow-sm'`                                                                     | C-T   |
| 230  | `background: '#60A5FA',`                                                                                   | K     |
| 249  | `.ops-breadcrumb {`                                                                                        | N     |
| 257  | `html.dark .ops-breadcrumb {`                                                                              | N     |
| 275  | `border-color: #2563eb;`                                                                                   | K     |
| 276  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                                            | K     |
| 585  | `background: 'rgba(37, 99, 235, 0.1)',`                                                                    | K     |
| 586  | `color: '#1d4ed8',`                                                                                        | K     |
| 999  | `MEDIUM: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`                                                | N     |
| 1295 | `background: active ? 'var(--color-accent)' : 'transparent',`                                              | C-T   |
| 1296 | `color: active ? '#fff' : 'var(--text-secondary)',`                                                        | C-T   |
| 1308 | `MEDIUM: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`                                                | N     |
| 1765 | `background: 'rgba(37, 99, 235, 0.1)',`                                                                    | K     |
| 1766 | `color: '#1d4ed8',`                                                                                        | K     |
| 2027 | `background: 'rgba(37, 99, 235, 0.1)',`                                                                    | K     |
| 2031 | `color: '#1d4ed8',`                                                                                        | K     |
| 2291 | `className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs hover:bg-blue-100 transition"` | K     |
| 2293 | `background: 'rgba(37, 99, 235, 0.1)',`                                                                    | K     |
| 2294 | `color: '#1d4ed8',`                                                                                        | K     |

### `apps/web/src/app/(dashboard)/operaciones/documentos/page.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 509  | `<div className="ops-breadcrumb">Operaciones / Documentos</div>`                   | N     |
| 512  | `<h1`                                                                              | N     |
| 562  | `background: 'rgba(37, 99, 235, 0.08)',`                                           | K     |
| 563  | `border: '1px solid rgba(37, 99, 235, 0.2)',`                                      | K     |
| 567  | `<Settings size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />` | K     |
| 590  | `background: 'var(--color-accent)',`                                               | K     |
| 601  | `background: 'var(--color-accent)',`                                               | K     |
| 612  | `background: 'var(--color-accent)',`                                               | K     |
| 629  | `background: 'rgba(37, 99, 235, 0.08)',`                                           | K     |
| 630  | `border: '1px solid rgba(37, 99, 235, 0.25)',`                                     | K     |
| 633  | `<FileText size={18} style={{ color: '#1d4ed8', flexShrink: 0 }} />`               | K     |
| 648  | `background: 'var(--color-accent)',`                                               | K     |
| 657  | `className="p-1 rounded hover:bg-blue-100 text-[#1d4ed8]"`                         | K     |
| 916  | `style={{ accentColor: 'var(--color-accent)' }}`                                   | K     |
| 1062 | `.ops-breadcrumb {`                                                                | N     |
| 1070 | `html.dark .ops-breadcrumb {`                                                      | N     |
| 1088 | `border-color: #2563eb;`                                                           | K     |
| 1089 | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                    | K     |
| 1317 | `medium: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`                        | N     |

### `apps/web/src/app/(dashboard)/operaciones/documentos/pendientes/page.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 230  | `<div className="ops-breadcrumb">`                                       | N     |
| 231  | `<Link href="/operaciones" className="ops-breadcrumb__link">`            | N     |
| 235  | `<Link href="/operaciones/documentos" className="ops-breadcrumb__link">` | N     |
| 250  | `<h1`                                                                    | N     |
| 279  | `background: 'rgba(37, 99, 235, 0.1)',`                                  | K     |
| 280  | `color: '#1d4ed8',`                                                      | K     |
| 494  | `.ops-breadcrumb {`                                                      | N     |
| 502  | `html.dark .ops-breadcrumb {`                                            | N     |
| 505  | `.ops-breadcrumb__link {`                                                | N     |
| 509  | `.ops-breadcrumb__link:hover {`                                          | N     |
| 527  | `border-color: #2563eb;`                                                 | K     |
| 528  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                          | K     |

### `apps/web/src/app/(dashboard)/operaciones/equipos/[id]/page.tsx`

| Line | Source quote                                                                             | Class |
| ---- | ---------------------------------------------------------------------------------------- | ----- |
| 207  | `MEDIUM: { label: 'Media', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`              | N     |
| 615  | `<div className="ops-breadcrumb">Operaciones / Equipos</div>`                            | N     |
| 834  | `<div className="ops-breadcrumb">`                                                       | N     |
| 835  | `<Link href="/operaciones" className="ops-breadcrumb__link">`                            | N     |
| 839  | `<Link href="/operaciones/equipos" className="ops-breadcrumb__link">`                    | N     |
| 854  | `<h1`                                                                                    | N     |
| 963  | `className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"` | N     |
| 1055 | `className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:underline"`          | K     |
| 1085 | `background: 'rgba(37, 99, 235, 0.08)',`                                                 | K     |
| 1086 | `border: '1px dashed rgba(37, 99, 235, 0.3)',`                                           | K     |
| 1089 | `<MapPin size={14} style={{ color: '#1d4ed8' }} />`                                      | K     |
| 1229 | `className="text-blue-600 hover:underline"`                                              | K     |
| 1340 | `background: 'var(--color-accent)',`                                                     | K     |
| 1360 | `className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"`       | K     |
| 1929 | `className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline"`          | K     |
| 2198 | `<div className="ops-breadcrumb">Operaciones / Equipos</div>`                            | N     |
| 2228 | `.ops-breadcrumb {`                                                                      | N     |
| 2236 | `html.dark .ops-breadcrumb {`                                                            | N     |
| 2239 | `.ops-breadcrumb__link {`                                                                | N     |
| 2243 | `.ops-breadcrumb__link:hover {`                                                          | N     |
| 2258 | `border-color: #2563eb;`                                                                 | K     |
| 2259 | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                          | K     |
| 2345 | `background: rgba(37, 99, 235, 0.06);`                                                   | K     |
| 2346 | `border-color: rgba(37, 99, 235, 0.3);`                                                  | K     |

### `apps/web/src/app/(dashboard)/operaciones/equipos/page.tsx`

| Line | Source quote                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------ | ----- |
| 227  | `<div className="ops-breadcrumb">Operaciones / Equipos</div>`                              | N     |
| 229  | `<h1`                                                                                      | N     |
| 272  | `background: 'rgba(37, 99, 235, 0.08)',`                                                   | K     |
| 273  | `border: '1px solid rgba(37, 99, 235, 0.2)',`                                              | K     |
| 276  | `<Settings size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />`         | K     |
| 296  | `background: 'var(--color-accent)',`                                                       | K     |
| 486  | `.ops-breadcrumb {`                                                                        | N     |
| 494  | `html.dark .ops-breadcrumb {`                                                              | N     |
| 512  | `border-color: #2563eb;`                                                                   | K     |
| 513  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                            | K     |
| 670  | `className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700"` | N     |

### `apps/web/src/app/(dashboard)/operaciones/eventos/page.tsx`

| Line | Source quote                                                                                                                                                                                                           | Class |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 69   | `'document.renewal-imminent': { bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },`                                                                                                                                          | N     |
| 178  | `<h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)]">`                                                                                                                           | N     |
| 408  | `className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-950/40 dark:text-blue-300"` | K     |
| 628  | `className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"`                                                                 | K     |

### `apps/web/src/app/(dashboard)/operaciones/excepciones/page.tsx`

| Line | Source quote                                                  | Class |
| ---- | ------------------------------------------------------------- | ----- |
| 231  | `<div className="ops-breadcrumb">`                            | N     |
| 232  | `<Link href="/operaciones" className="ops-breadcrumb__link">` | N     |
| 238  | `<h1`                                                         | N     |
| 707  | `.ops-breadcrumb {`                                           | N     |
| 715  | `html.dark .ops-breadcrumb {`                                 | N     |
| 718  | `.ops-breadcrumb__link {`                                     | N     |
| 734  | `border-color: #2563eb;`                                      | K     |
| 735  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`               | K     |

### `apps/web/src/app/(dashboard)/operaciones/mis-lecturas/page.tsx`

| Line | Source quote                                                                      | Class |
| ---- | --------------------------------------------------------------------------------- | ----- |
| 56   | `OPERATION: { label: 'Operación', color: 'var(--color-accent)', icon: HardHat },` | N     |
| 141  | `<h1`                                                                             | N     |
| 353  | `background: 'var(--color-accent)',`                                              | K     |

### `apps/web/src/app/(dashboard)/operaciones/ordenes-de-servicio/[id]/page.tsx`

| Line | Source quote                               | Class |
| ---- | ------------------------------------------ | ----- |
| 137  | `<h1`                                      | N     |
| 352  | `style={{ color: 'var(--color-accent)' }}` | K     |

### `apps/web/src/app/(dashboard)/operaciones/ordenes-de-servicio/page.tsx`

| Line | Source quote                                                                        | Class |
| ---- | ----------------------------------------------------------------------------------- | ----- |
| 6    | `--text-*, Outfit headings, #2563eb accent). Row → dedicated [id] detail page (the` | N     |
| 66   | `<div className="ops-breadcrumb">Operaciones / Órdenes de Servicio</div>`           | N     |
| 67   | `<h1`                                                                               | N     |

### `apps/web/src/app/(dashboard)/operaciones/page.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 369  | `<h1 className="text-2xl font-semibold text-[var(--text-primary)]">`     | N     |
| 558  | `className="text-xs text-[var(--accent-color,#2563eb)] hover:underline"` | C-L   |
| 604  | `className="text-xs text-[var(--accent-color,#2563eb)] hover:underline"` | C-L   |

### `apps/web/src/app/(dashboard)/operaciones/permisos/page.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 268  | `<div className="ops-breadcrumb">Operaciones / Permisos</div>`                     | N     |
| 271  | `<h1`                                                                              | N     |
| 322  | `background: tab === 'externos' ? 'var(--color-accent)' : 'transparent',`          | C-T   |
| 323  | `color: tab === 'externos' ? '#fff' : 'var(--text-secondary)',`                    | C-T   |
| 325  | `fontWeight: tab === 'externos' ? 600 : 500,`                                      | C-T   |
| 334  | `background: tab === 'trabajo' ? 'var(--color-accent)' : 'transparent',`           | C-T   |
| 335  | `color: tab === 'trabajo' ? '#fff' : 'var(--text-secondary)',`                     | C-T   |
| 337  | `fontWeight: tab === 'trabajo' ? 600 : 500,`                                       | C-T   |
| 344  | `{tab === 'trabajo' && user?.id && <WorkPermitsTab currentUserId={user.id} />}`    | N     |
| 353  | `background: 'rgba(37, 99, 235, 0.08)',`                                           | K     |
| 354  | `border: '1px solid rgba(37, 99, 235, 0.2)',`                                      | K     |
| 358  | `<Settings size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />` | K     |
| 382  | `background: 'var(--color-accent)',`                                               | K     |
| 813  | `.ops-breadcrumb {`                                                                | N     |
| 821  | `html.dark .ops-breadcrumb {`                                                      | N     |
| 836  | `border-color: #2563eb;`                                                           | K     |
| 837  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                    | K     |

### `apps/web/src/app/(dashboard)/operaciones/permisos/trabajo/[id]/page.tsx`

| Line | Source quote                                                                            | Class |
| ---- | --------------------------------------------------------------------------------------- | ----- |
| 161  | `AUTHORIZED: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`                         | N     |
| 243  | `className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"` | K     |
| 267  | `{/* Breadcrumb */}`                                                                    | N     |
| 319  | `<h1`                                                                                   | N     |
| 340  | `color="var(--color-accent)"`                                                           | K     |
| 434  | `className="text-blue-600 hover:underline"`                                             | K     |
| 810  | `color: '#1d4ed8',`                                                                     | K     |

### `apps/web/src/app/(dashboard)/operaciones/procedimientos/[id]/page.tsx`

| Line | Source quote                                                                            | Class |
| ---- | --------------------------------------------------------------------------------------- | ----- |
| 146  | `OPERATION: { label: 'Operación', color: 'var(--color-accent)', icon: HardHat },`       | N     |
| 334  | `className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"` | K     |
| 402  | `<h1`                                                                                   | N     |
| 425  | `color="var(--color-accent)"`                                                           | K     |
| 467  | `color="var(--color-accent)"`                                                           | K     |
| 671  | `background: 'rgba(37, 99, 235, 0.10)',`                                                | N     |
| 672  | `color: '#1d4ed8',`                                                                     | K     |
| 751  | `background: isCurrent ? 'rgba(37, 99, 235, 0.08)' : 'transparent',`                    | N     |
| 774  | `{isCurrent && <span className="text-xs text-blue-600">Actual</span>}`                  | N     |

### `apps/web/src/app/(dashboard)/operaciones/procedimientos/page.tsx`

| Line | Source quote                                                                      | Class |
| ---- | --------------------------------------------------------------------------------- | ----- |
| 94   | `OPERATION: { label: 'Operación', color: 'var(--color-accent)', icon: HardHat },` | N     |
| 215  | `<h1`                                                                             | N     |
| 244  | `background: 'var(--color-accent)',`                                              | K     |
| 389  | `background: view === 'table' ? 'var(--color-accent)' : 'transparent',`           | C-T   |
| 390  | `color: view === 'table' ? '#fff' : 'var(--text-secondary)',`                     | C-T   |
| 400  | `background: view === 'cards' ? 'var(--color-accent)' : 'transparent',`           | C-T   |
| 401  | `color: view === 'cards' ? '#fff' : 'var(--text-secondary)',`                     | C-T   |
| 427  | `) : view === 'table' ? (`                                                        | N     |
| 543  | `className="text-blue-600 hover:underline"`                                       | K     |

### `apps/web/src/app/(dashboard)/operaciones/reportes/page.tsx`

| Line | Source quote                                                                                                                                                                                          | Class |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 38   | `iconColor: '#1d4ed8',`                                                                                                                                                                               | K     |
| 39   | `iconBg: 'rgba(37,99,235,0.12)',`                                                                                                                                                                     | K     |
| 106  | `<h1 className="text-2xl font-semibold text-[var(--text-primary)]">`                                                                                                                                  | N     |
| 150  | `<article className="group flex h-full flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-blue-400">` | C-L   |
| 185  | `className="block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"`                                                                                                                    | K     |
| 195  | `className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"`                                                                                                   | K     |

### `apps/web/src/app/(dashboard)/operaciones/servicios-activos/page.tsx`

| Line | Source quote                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------ | ----- |
| 78   | `<h1 className="text-2xl font-semibold text-[var(--text-primary)]">Servicios activos</h1>` | N     |

### `apps/web/src/app/(dashboard)/operaciones/vehiculos/[id]/page.tsx`

| Line | Source quote                                                                           | Class |
| ---- | -------------------------------------------------------------------------------------- | ----- |
| 220  | `MEDIUM: { label: 'Media', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`            | N     |
| 610  | `<div className="ops-breadcrumb">Operaciones / Vehículos</div>`                        | N     |
| 821  | `<div className="ops-breadcrumb">`                                                     | N     |
| 822  | `<Link href="/operaciones" className="ops-breadcrumb__link">`                          | N     |
| 826  | `<Link href="/operaciones/vehiculos" className="ops-breadcrumb__link">`                | N     |
| 841  | `<h1`                                                                                  | N     |
| 1083 | `className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:underline"`        | K     |
| 1114 | `background: 'rgba(37, 99, 235, 0.08)',`                                               | K     |
| 1115 | `border: '1px dashed rgba(37, 99, 235, 0.3)',`                                         | K     |
| 1118 | `<MapPin size={14} style={{ color: '#1d4ed8' }} />`                                    | K     |
| 1175 | `className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700"` | N     |
| 1238 | `className="text-blue-600 hover:underline"`                                            | K     |
| 1351 | `background: 'var(--color-accent)',`                                                   | K     |
| 1371 | `className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"`     | K     |
| 1936 | `className="mt-1 inline-flex items-center gap-1 text-blue-600 hover:underline"`        | K     |
| 2206 | `<div className="ops-breadcrumb">Operaciones / Vehículos</div>`                        | N     |
| 2236 | `.ops-breadcrumb {`                                                                    | N     |
| 2244 | `html.dark .ops-breadcrumb {`                                                          | N     |
| 2247 | `.ops-breadcrumb__link {`                                                              | N     |
| 2251 | `.ops-breadcrumb__link:hover {`                                                        | N     |
| 2341 | `background: rgba(37, 99, 235, 0.06);`                                                 | K     |
| 2342 | `border-color: rgba(37, 99, 235, 0.3);`                                                | K     |

### `apps/web/src/app/(dashboard)/operaciones/vehiculos/page.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 280  | `<div className="ops-breadcrumb">Operaciones / Vehículos</div>`                    | N     |
| 282  | `<h1`                                                                              | N     |
| 326  | `background: 'rgba(37, 99, 235, 0.08)',`                                           | K     |
| 327  | `border: '1px solid rgba(37, 99, 235, 0.2)',`                                      | K     |
| 330  | `<Settings size={20} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />` | K     |
| 351  | `background: 'var(--color-accent)',`                                               | K     |
| 609  | `.ops-breadcrumb {`                                                                | N     |
| 617  | `html.dark .ops-breadcrumb {`                                                      | N     |
| 635  | `border-color: #2563eb;`                                                           | K     |
| 636  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                    | K     |

### `apps/web/src/app/(dashboard)/reportes/page.tsx`

| Line | Source quote                                                                                                                                                                   | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 73   | `<h1 className="text-2xl text-fg mb-6">Reportes y Exportaciones</h1>`                                                                                                          | N     |
| 79   | `<div className="p-2 bg-blue-100 rounded-lg">`                                                                                                                                 | K     |
| 80   | `<FileSpreadsheet size={20} className="text-blue-600" />`                                                                                                                      | K     |
| 92   | `className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"` | K     |
| 179  | `{ label: 'Caja Libre', value: summary.cash.free, color: 'text-blue-700' },`                                                                                                   | N     |
| 213  | `<div className="bg-blue-50 rounded-lg p-3">`                                                                                                                                  | N     |
| 214  | `<p className="label text-[11px] text-blue-600">Balance</p>`                                                                                                                   | N     |
| 215  | `<p className="amount text-lg mt-0.5 text-blue-700">`                                                                                                                          | N     |

### `apps/web/src/app/(dashboard)/rrhh/cargos/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 6    | `* Tokens: accent #2563eb, Outfit headings. */`                                             | N     |
| 116  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 117  | `<h1`                                                                                       | N     |
| 127  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 409  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 454  | `style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--color-accent)' }}`               | N     |

### `apps/web/src/app/(dashboard)/rrhh/disponibilidad/page.tsx`

| Line | Source quote                                                                          | Class |
| ---- | ------------------------------------------------------------------------------------- | ----- |
| 7    | `* No salary data. Tokens: accent #2563eb, Outfit headings. Dates UTC. */`            | N     |
| 13   | `const ACCENT = 'var(--color-accent)';`                                               | K     |
| 27   | `VACACIONES: { label: 'Vacaciones', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },`     | N     |
| 148  | `<span className="h-6 w-1.5 rounded-full" style={{ background: ACCENT }} />`          | C-H   |
| 149  | `<h1`                                                                                 | N     |
| 190  | `<Stat label="Vacaciones" value={availability.summary.vacaciones} color="#1d4ed8" />` | N     |

### `apps/web/src/app/(dashboard)/rrhh/page.tsx`

| Line | Source quote                                                                          | Class |
| ---- | ------------------------------------------------------------------------------------- | ----- |
| 19   | `const ACCENT = 'var(--color-accent)';`                                               | K     |
| 119  | `<span className="h-6 w-1.5 rounded-full" style={{ background: ACCENT }} />`          | C-H   |
| 120  | `<h1`                                                                                 | N     |
| 163  | `valueColor={ACCENT}`                                                                 | N     |
| 215  | ``style={{ width: `${pct}%`, background: ACCENT }}``                                  | N     |
| 319  | `valueColor={ACCENT}`                                                                 | N     |
| 343  | `<Link href={action.href} className="text-xs font-medium" style={{ color: ACCENT }}>` | C-L   |

### `apps/web/src/app/(dashboard)/rrhh/parametros/page.tsx`

| Line | Source quote                                                                     | Class |
| ---- | -------------------------------------------------------------------------------- | ----- |
| 8    | `* permiso", no edit actions. Tokens: accent #2563eb, Outfit headings. UF shown` | N     |
| 14   | `const ACCENT = 'var(--color-accent)';`                                          | K     |
| 154  | `<span className="h-6 w-1.5 rounded-full" style={{ background: ACCENT }} />`     | C-H   |
| 155  | `<h1`                                                                            | N     |
| 167  | `style={{ background: ACCENT }}`                                                 | K     |
| 546  | `style={{ background: ACCENT }}`                                                 | K     |
| 632  | `style={{ background: ACCENT }}`                                                 | K     |
| 726  | `style={{ background: ACCENT }}`                                                 | K     |

### `apps/web/src/app/(dashboard)/rrhh/trabajadores/[id]/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 118  | `style={{ color: 'var(--color-accent)' }}`                                                  | K     |
| 138  | `<span className="h-7 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 140  | `<h1`                                                                                       | N     |
| 162  | `color: tab === t.key ? 'var(--color-accent)' : 'var(--text-secondary)',`                   | C-T   |
| 163  | `fontWeight: tab === t.key ? 600 : 400,`                                                    | C-T   |
| 164  | `borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',`              | C-T   |
| 327  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 507  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/rrhh/trabajadores/page.tsx`

| Line | Source quote                                                                                | Class |
| ---- | ------------------------------------------------------------------------------------------- | ----- |
| 6    | `* Tokens: accent #2563eb, Outfit headings. */`                                             | N     |
| 113  | `<span className="h-6 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />` | C-H   |
| 114  | `<h1`                                                                                       | N     |
| 127  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |
| 568  | `style={{ background: 'var(--color-accent)' }}`                                             | K     |

### `apps/web/src/app/(dashboard)/tributario/page.tsx`

| Line | Source quote                                                                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 465  | `<h1 className="text-2xl text-fg flex items-center gap-2">`                                                                                | N     |
| 489  | `background: active ? 'var(--color-accent)' : 'var(--bg-card)',`                                                                           | K     |
| 490  | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',`                                                                     | K     |
| 514  | `background: active ? 'var(--color-accent)' : 'var(--bg-card)',`                                                                           | K     |
| 515  | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',`                                                                     | K     |
| 600  | `color="text-blue-600"`                                                                                                                    | N     |
| 657  | `className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"` | K     |
| 676  | `<div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center gap-3">`                                          | N     |
| 677  | `<div className="p-2 rounded-lg bg-blue-100">`                                                                                             | N     |
| 678  | `<CheckCircle size={18} className="text-blue-600" />`                                                                                      | N     |
| 681  | `<p className="text-sm font-semibold text-blue-900">`                                                                                      | N     |
| 689  | `<p className="text-xs text-blue-700 mt-0.5">`                                                                                             | N     |
| 695  | `className="p-1.5 rounded-md hover:bg-blue-100 text-blue-700 transition"`                                                                  | N     |
| 811  | `? 'bg-blue-600 text-white'`                                                                                                               | C-T   |
| 845  | `{tab === 'EMITIDO' ? 'Receptor' : tab === 'RECIBIDO' ? 'Emisor' : 'Contraparte'}`                                                         | N     |
| 1069 | `className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"`                         | K     |

### `apps/web/src/app/global-error.tsx`

| Line | Source quote                    | Class |
| ---- | ------------------------------- | ----- |
| 21   | `<h1>Something went wrong</h1>` | N     |

### `apps/web/src/app/global.css`

| Line | Source quote                                        | Class |
| ---- | --------------------------------------------------- | ----- |
| 147  | `scrollbar-color: var(--color-accent) transparent;` | K     |
| 160  | `background-color: var(--color-accent);`            | K     |
| 165  | `background-color: #1d4ed8;`                        | K     |
| 182  | `background: var(--color-accent);`                  | K     |

### `apps/web/src/app/modulos/page.tsx`

| Line | Source quote                                          | Class |
| ---- | ----------------------------------------------------- | ----- |
| 191  | `<h1 className="mod-title">Selecciona un módulo</h1>` | N     |

### `apps/web/src/app/p/asset/[qrToken]/page.tsx`

| Line | Source quote | Class |
| ---- | ------------ | ----- |
| 207  | `<h1`        | N     |
| 592  | `<h1`        | N     |

### `apps/web/src/components/DarkGradientBackground.tsx`

| Line | Source quote                                                                        | Class |
| ---- | ----------------------------------------------------------------------------------- | ----- |
| 27   | `radial-gradient(ellipse at 30% 20%, rgba(37, 99, 235, 0.06) 0%, transparent 60%),` | N     |

### `apps/web/src/components/NotificationCenter.tsx`

| Line | Source quote                                                               | Class |
| ---- | -------------------------------------------------------------------------- | ----- |
| 59   | `INFO: '#1d4ed8',`                                                         | N     |
| 259  | `background: n.isRead ? 'transparent' : 'rgba(37, 99, 235, 0.04)',`        | K     |
| 312  | `background: 'var(--color-accent)',`                                       | K     |
| 327  | `className="text-blue-600 hover:underline inline-flex items-center gap-1"` | K     |
| 339  | `className="text-blue-600 hover:underline"`                                | K     |

### `apps/web/src/components/actividades/ActivityDetailModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 339  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/actividades/ActivityFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 226  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/actividades/AreaFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 20   | `'var(--color-accent)',`                        | N     |
| 130  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/actividades/AusenciaCalendarModal.tsx`

| Line | Source quote                                                                                          | Class |
| ---- | ----------------------------------------------------------------------------------------------------- | ----- |
| 81   | `className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/actividades/CampaignCalendarModal.tsx`

| Line | Source quote                                                                                          | Class |
| ---- | ----------------------------------------------------------------------------------------------------- | ----- |
| 89   | `className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/actividades/CierreCalendarModal.tsx`

| Line | Source quote                                                                                          | Class |
| ---- | ----------------------------------------------------------------------------------------------------- | ----- |
| 68   | `className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/actividades/ServicioCalendarModal.tsx`

| Line | Source quote                                                                                          | Class |
| ---- | ----------------------------------------------------------------------------------------------------- | ----- |
| 86   | `className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/actividades/TodoRowCells.tsx`

| Line | Source quote                                                                                        | Class |
| ---- | --------------------------------------------------------------------------------------------------- | ----- |
| 21   | `LOW: { label: 'Baja', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },` | N     |
| 61   | `className="h-4 w-4 accent-accent focus-visible:outline-accent"`                                    | K     |

### `apps/web/src/components/actividades/VencimientoCalendarModal.tsx`

| Line | Source quote                                                                                          | Class |
| ---- | ----------------------------------------------------------------------------------------------------- | ----- |
| 68   | `className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/actividades/statusMachine.ts`

| Line | Source quote                                                   | Class |
| ---- | -------------------------------------------------------------- | ----- |
| 24   | `PENDIENTE: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },` | N     |

### `apps/web/src/components/alerts/AlertCard.tsx`

| Line | Source quote                  | Class |
| ---- | ----------------------------- | ----- |
| 36   | `bg: 'bg-blue-50',`           | N     |
| 37   | `border: 'border-blue-200',`  | N     |
| 38   | `text: 'text-blue-800',`      | N     |
| 39   | `iconColor: 'text-blue-500',` | N     |

### `apps/web/src/components/calendar/DayView.tsx`

| Line | Source quote                                                                                                                                                     | Class |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 76   | `<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">` | N     |

### `apps/web/src/components/calendar/MonthView.tsx`

| Line | Source quote                                                                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 124  | `outline: today ? '2px solid #2563eb' : undefined,`                                                                                        | N     |
| 131  | `today ? 'text-blue-600' : 'text-[var(--text-primary)]'`                                                                                   | N     |
| 137  | `<span className="rounded bg-blue-100 px-1 py-0 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">` | N     |
| 152  | ``<span key={`i-${i}`} className="h-1.5 w-1.5 rounded-full bg-blue-500" />``                                                               | N     |

### `apps/web/src/components/calendar/WeekView.tsx`

| Line | Source quote                                                                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 82   | `today ? 'bg-blue-50/60 dark:bg-blue-950/20' : weekend ? 'bg-subtle' : ''`                                                                 | N     |
| 92   | `today ? 'text-blue-600' : 'text-[var(--text-primary)]'`                                                                                   | N     |
| 99   | `<span className="rounded bg-blue-100 px-1 py-0 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">` | N     |

### `apps/web/src/components/cashflow/AccountFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 157  | `border-color: #2563eb;`                        | K     |
| 158  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);` | K     |

### `apps/web/src/components/cashflow/CashPositionCard.tsx`

| Line | Source quote                                                         | Class |
| ---- | -------------------------------------------------------------------- | ----- |
| 10   | `blue: { text: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },` | N     |

### `apps/web/src/components/cashflow/OpeningBalanceModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 170  | `border-color: #2563eb;`                        | K     |
| 171  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);` | K     |

### `apps/web/src/components/comercial/AccountContactsTab.tsx`

| Line | Source quote                                                       | Class |
| ---- | ------------------------------------------------------------------ | ----- |
| 85   | `style={{ background: 'var(--color-accent)' }}`                    | K     |
| 112  | `style={{ background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }}` | N     |

### `apps/web/src/components/comercial/AccountFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 235  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/ActivityFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 203  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/ActivityTimeline.tsx`

| Line | Source quote                                                                                 | Class |
| ---- | -------------------------------------------------------------------------------------------- | ----- |
| 69   | ``const query = scope === 'account' ? `accountId=${scopeId}` : `opportunityId=${scopeId}`;`` | N     |
| 140  | `style={{ background: 'var(--color-accent)' }}`                                              | K     |
| 250  | `style={{ color: 'var(--color-accent)' }}`                                                   | K     |
| 269  | `style={{ color: 'var(--color-accent)' }}`                                                   | K     |
| 286  | `accountId={scope === 'account' ? scopeId : undefined}`                                      | N     |
| 287  | `opportunityId={scope === 'opportunity' ? scopeId : undefined}`                              | N     |

### `apps/web/src/components/comercial/AssignAccountsModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 257  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/AvailableStaff.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 71   | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/ContactFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 166  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/EnterpriseFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 174  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/NewOpportunityModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 190  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/OpportunityBundle.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 117  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/OpportunityQuotes.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 271  | `style={{ background: 'var(--color-accent)' }}` | K     |
| 583  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/PipelineTable.tsx`

| Line | Source quote                               | Class |
| ---- | ------------------------------------------ | ----- |
| 344  | `style={{ color: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/QuoteLineModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 184  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/SendQuoteModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 97   | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/ServiceLineModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 203  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/comercial/accountLabels.tsx`

| Line | Source quote                                                       | Class |
| ---- | ------------------------------------------------------------------ | ----- |
| 29   | `return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };` | N     |

### `apps/web/src/components/comercial/activityLabels.tsx`

| Line | Source quote                                                       | Class |
| ---- | ------------------------------------------------------------------ | ----- |
| 35   | `return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };` | N     |

### `apps/web/src/components/comercial/quoteLabels.tsx`

| Line | Source quote                                                                                  | Class |
| ---- | --------------------------------------------------------------------------------------------- | ----- |
| 34   | `return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }; // blue — out for decision` | N     |

### `apps/web/src/components/comercial/stageLabels.tsx`

| Line | Source quote                                                       | Class |
| ---- | ------------------------------------------------------------------ | ----- |
| 67   | `return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' };` | N     |

### `apps/web/src/components/dashboard/GoalsModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 146  | `border-color: #2563eb;`                        | K     |
| 147  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);` | K     |

### `apps/web/src/components/hsec/AfectadoFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 180  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/hsec/EppDeliveryFormModal.tsx`

| Line | Source quote                                                                    | Class |
| ---- | ------------------------------------------------------------------------------- | ----- |
| 226  | `className="inline-flex items-center gap-1 text-xs font-medium text-[#2563eb]"` | K     |
| 256  | `style={{ background: 'var(--color-accent)' }}`                                 | K     |

### `apps/web/src/components/hsec/IncidentFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 197  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/hsec/TrainingFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 185  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/hsec/incidentTypes.ts`

| Line | Source quote                                                   | Class |
| ---- | -------------------------------------------------------------- | ----- |
| 82   | `REPORTADO: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },` | N     |

### `apps/web/src/components/hsec/trainingTypes.ts`

| Line | Source quote                                                | Class |
| ---- | ----------------------------------------------------------- | ----- |
| 44   | `CHARLA: { bg: 'rgba(37,99,235,0.12)', color: '#1d4ed8' },` | N     |

### `apps/web/src/components/marketing/CampaignExpenses.tsx`

| Line | Source quote                                                 | Class |
| ---- | ------------------------------------------------------------ | ----- |
| 81   | `const barColor = over ? '#ef4444' : 'var(--color-accent)';` | N     |
| 94   | `style={{ background: 'var(--color-accent)' }}`              | K     |

### `apps/web/src/components/marketing/CampaignFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 180  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/marketing/CampaignRetorno.tsx`

| Line | Source quote                                                       | Class |
| ---- | ------------------------------------------------------------------ | ----- |
| 42   | `style={{ background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }}` | N     |
| 78   | `style={{ color: 'var(--color-accent)' }}`                         | N     |

### `apps/web/src/components/marketing/ExpenseFormModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 158  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/marketing/PresenceRegisterModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 164  | `style={{ background: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/marketing/campaignLabels.tsx`

| Line | Source quote                                                                        | Class |
| ---- | ----------------------------------------------------------------------------------- | ----- |
| 57   | `return { background: 'rgba(37,99,235,0.12)', color: '#1d4ed8' }; // closed / info` | N     |

### `apps/web/src/components/movements/MovementStatusBadge.tsx`

| Line | Source quote                                                                 | Class |
| ---- | ---------------------------------------------------------------------------- | ----- |
| 4    | `RECONCILED: { label: 'Conciliado', classes: 'bg-blue-100 text-blue-700' },` | N     |

### `apps/web/src/components/movements/RecategorizePanel.tsx`

| Line | Source quote                                                                                                                                                   | Class |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 93   | `className="px-3 py-2 text-sm border border-line rounded-lg bg-input text-fg focus-visible:ring-2 focus-visible:ring-accent"`                                  | K     |
| 102  | `className="px-4 py-2 text-sm border border-line text-fg rounded-lg hover:bg-subtle-hover disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent"` | K     |
| 110  | `className="px-4 py-2 text-sm bg-accent text-white rounded-lg disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent"`                             | K     |

### `apps/web/src/components/operations/AcknowledgmentModal.tsx`

| Line | Source quote                                  | Class |
| ---- | --------------------------------------------- | ----- |
| 65   | `background: 'rgba(37, 99, 235, 0.08)',`      | K     |
| 66   | `border: '1px solid rgba(37, 99, 235, 0.2)',` | K     |

### `apps/web/src/components/operations/AlertDetailModal.tsx`

| Line | Source quote                                                               | Class |
| ---- | -------------------------------------------------------------------------- | ----- |
| 86   | `bg: 'rgba(37, 99, 235, 0.12)',`                                           | N     |
| 87   | `fg: '#1d4ed8',`                                                           | N     |
| 88   | `border: 'var(--color-accent)',`                                           | N     |
| 302  | `className="inline-flex items-center gap-1 text-blue-600 hover:underline"` | K     |
| 343  | `className="inline-flex items-center gap-1 text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/operations/ApplicableProcedures.tsx`

| Line | Source quote                                                                      | Class |
| ---- | --------------------------------------------------------------------------------- | ----- |
| 41   | `OPERATION: { label: 'Operación', color: 'var(--color-accent)', icon: HardHat },` | N     |
| 109  | `className="text-sm text-blue-600 hover:underline truncate block"`                | K     |

### `apps/web/src/components/operations/AssetActiveAlerts.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 134  | `className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"` | K     |

### `apps/web/src/components/operations/AssetFolderView.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 102  | `/* Chooses the breadcrumb root and the "Volver al activo" target. Same` | N     |
| 149  | `bg: 'rgba(37, 99, 235, 0.12)',`                                         | N     |
| 150  | `fg: '#1d4ed8',`                                                         | N     |
| 242  | `<div className="ops-breadcrumb">`                                       | N     |
| 297  | `<div className="ops-breadcrumb">`                                       | N     |
| 298  | `<Link href="/operaciones" className="ops-breadcrumb__link">`            | N     |
| 302  | `<Link href={listHref} className="ops-breadcrumb__link">`                | N     |
| 306  | `<Link href={detailHref} className="ops-breadcrumb__link">`              | N     |
| 321  | `<h1`                                                                    | N     |
| 507  | `className="text-blue-600 hover:underline"`                              | K     |
| 811  | `background: 'var(--color-accent)',`                                     | K     |
| 845  | `info: '#1d4ed8',`                                                       | N     |
| 879  | `medium: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`              | N     |
| 920  | `<div className="ops-breadcrumb">`                                       | N     |
| 943  | `.ops-breadcrumb {`                                                      | N     |
| 951  | `html.dark .ops-breadcrumb {`                                            | N     |
| 954  | `.ops-breadcrumb__link {`                                                | N     |
| 958  | `.ops-breadcrumb__link:hover {`                                          | N     |

### `apps/web/src/components/operations/AssetFormModal.tsx`

| Line | Source quote                                                                                           | Class |
| ---- | ------------------------------------------------------------------------------------------------------ | ----- |
| 516  | `className="inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline"`        | K     |
| 530  | `className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"` | K     |
| 537  | `className="hover:text-blue-900"`                                                                      | K     |

### `apps/web/src/components/operations/AssetImportWizard.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 379  | `background: i <= idx ? 'var(--color-accent)' : 'var(--border-color)',`            | K     |
| 425  | `className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"` | K     |
| 447  | `borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-color)',`           | K     |
| 451  | `background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',`            | K     |
| 457  | `<FileSpreadsheet size={28} style={{ color: 'var(--color-accent)' }} />`           | K     |

### `apps/web/src/components/operations/AssetQrSection.tsx`

| Line | Source quote                           | Class |
| ---- | -------------------------------------- | ----- |
| 298  | `background: rgba(37, 99, 235, 0.08);` | K     |
| 299  | `color: #1d4ed8;`                      | K     |
| 308  | `background: rgba(37, 99, 235, 0.16);` | K     |

### `apps/web/src/components/operations/AssetStatusBadge.tsx`

| Line | Source quote                     | Class |
| ---- | -------------------------------- | ----- |
| 34   | `bg: 'rgba(37, 99, 235, 0.12)',` | N     |
| 35   | `fg: '#1d4ed8',`                 | N     |
| 36   | `dot: 'var(--color-accent)',`    | N     |

### `apps/web/src/components/operations/AssetStatusHistoryModal.tsx`

| Line | Source quote                                                                   | Class |
| ---- | ------------------------------------------------------------------------------ | ----- |
| 49   | `MANUAL: { label: 'Manual', icon: <UserIcon size={13} />, color: '#1d4ed8' },` | N     |
| 110  | `background: 'rgba(37, 99, 235, 0.06)',`                                       | K     |
| 111  | `border: '1px solid rgba(37, 99, 235, 0.18)',`                                 | K     |

### `apps/web/src/components/operations/DocumentHistoryModal.tsx`

| Line | Source quote                                   | Class |
| ---- | ---------------------------------------------- | ----- |
| 139  | `background: 'rgba(37, 99, 235, 0.06)',`       | K     |
| 140  | `border: '1px solid rgba(37, 99, 235, 0.18)',` | K     |
| 402  | `background: rgba(37, 99, 235, 0.1);`          | K     |
| 403  | `color: #1d4ed8;`                              | K     |
| 404  | `border: 1px solid rgba(37, 99, 235, 0.3);`    | K     |

### `apps/web/src/components/operations/DocumentStatusBadge.tsx`

| Line | Source quote                     | Class |
| ---- | -------------------------------- | ----- |
| 53   | `bg: 'rgba(37, 99, 235, 0.12)',` | N     |
| 54   | `fg: '#1d4ed8',`                 | N     |
| 55   | `dot: 'var(--color-accent)',`    | N     |

### `apps/web/src/components/operations/DocumentSupersessionModal.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 161  | `background: 'rgba(37, 99, 235, 0.04)',`                                 | K     |
| 162  | `border: '1px dashed rgba(37, 99, 235, 0.2)',`                           | K     |
| 195  | `borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-color)',` | K     |
| 199  | `background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',`  | K     |
| 396  | `border-color: #2563eb;`                                                 | K     |
| 397  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                          | K     |

### `apps/web/src/components/operations/DocumentUploadModal.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 290  | `borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-color)',` | K     |
| 294  | `background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',`  | K     |
| 549  | `border-color: #2563eb;`                                                 | K     |
| 550  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                          | K     |
| 568  | `background: 'rgba(37, 99, 235, 0.06)',`                                 | K     |
| 569  | `border: '1px solid rgba(37, 99, 235, 0.18)',`                           | K     |

### `apps/web/src/components/operations/ExceptionModals.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 254  | `background: 'rgba(37, 99, 235, 0.06)',`        | K     |
| 255  | `border: '1px solid rgba(37, 99, 235, 0.2)',`   | K     |
| 662  | `border-color: #2563eb;`                        | K     |
| 663  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);` | K     |

### `apps/web/src/components/operations/PermitUploadModal.tsx`

| Line | Source quote                                                                         | Class |
| ---- | ------------------------------------------------------------------------------------ | ----- |
| 247  | `background: 'rgba(37, 99, 235, 0.06)',`                                             | K     |
| 248  | `border: '1px solid rgba(37, 99, 235, 0.18)',`                                       | K     |
| 317  | `background: targetType === 'asset' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',`    | K     |
| 318  | `color: targetType === 'asset' ? '#1d4ed8' : 'var(--text-secondary)',`               | K     |
| 320  | `targetType === 'asset' ? '1px solid #2563eb' : '1px solid var(--border-color)',`    | K     |
| 333  | `background: targetType === 'location' ? 'rgba(37, 99, 235, 0.12)' : 'transparent',` | K     |
| 334  | `color: targetType === 'location' ? '#1d4ed8' : 'var(--text-secondary)',`            | K     |
| 337  | `? '1px solid #2563eb'`                                                              | K     |
| 404  | `borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-color)',`             | K     |
| 408  | `background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',`              | K     |
| 593  | `border-color: #2563eb;`                                                             | K     |
| 594  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);`                                      | K     |

### `apps/web/src/components/operations/PlaceholderPage.tsx`

| Line | Source quote                                                                                  | Class |
| ---- | --------------------------------------------------------------------------------------------- | ----- |
| 6    | `breadcrumb?: string;`                                                                        | N     |
| 9    | `export function PlaceholderPage({ title, description, breadcrumb }: PlaceholderPageProps) {` | N     |
| 12   | `{breadcrumb && <div className="ops-breadcrumb">{breadcrumb}</div>}`                          | N     |
| 13   | `<h1 className="ops-title">{title}</h1>`                                                      | N     |
| 22   | `.ops-breadcrumb {`                                                                           | N     |
| 30   | `html.dark .ops-breadcrumb {`                                                                 | N     |

### `apps/web/src/components/operations/ProcedureAcknowledgmentSection.tsx`

| Line | Source quote                                                               | Class |
| ---- | -------------------------------------------------------------------------- | ----- |
| 187  | `className="text-blue-600 hover:underline inline-flex items-center gap-1"` | K     |

### `apps/web/src/components/operations/ProcedureFormModal.tsx`

| Line | Source quote                             | Class |
| ---- | ---------------------------------------- | ----- |
| 348  | `background: 'rgba(37, 99, 235, 0.10)',` | K     |
| 349  | `color: '#1d4ed8',`                      | K     |
| 505  | `background: 'var(--color-accent)',`     | K     |
| 593  | `background: 'rgba(37, 99, 235, 0.10)',` | K     |
| 594  | `color: '#1d4ed8',`                      | K     |

### `apps/web/src/components/operations/ProcedureRevisionsTimeline.tsx`

| Line | Source quote                                             | Class |
| ---- | -------------------------------------------------------- | ----- |
| 37   | `color: '#1d4ed8',`                                      | K     |
| 38   | `bg: 'rgba(37, 99, 235, 0.14)',`                         | N     |
| 73   | `color: '#1d4ed8',`                                      | K     |
| 74   | `bg: 'rgba(37, 99, 235, 0.14)',`                         | N     |
| 214  | `className="mt-2 text-xs text-blue-600 hover:underline"` | N     |

### `apps/web/src/components/operations/ServiceOrderStatusBadge.tsx`

| Line | Source quote                                                                                            | Class |
| ---- | ------------------------------------------------------------------------------------------------------- | ----- |
| 28   | `RECIBIDA: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8', dot: 'var(--color-accent)' }, // blue — new` | N     |

### `apps/web/src/components/operations/VehicleFormModal.tsx`

| Line | Source quote                                                                                           | Class |
| ---- | ------------------------------------------------------------------------------------------------------ | ----- |
| 610  | `className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"` | K     |
| 617  | `className="hover:text-blue-900"`                                                                      | K     |

### `apps/web/src/components/operations/VehicleImportWizard.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 386  | `background: i <= idx ? 'var(--color-accent)' : 'var(--border-color)',`            | K     |
| 432  | `className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"` | K     |
| 454  | `borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-color)',`           | K     |
| 458  | `background: dragOver ? 'rgba(37, 99, 235, 0.04)' : 'var(--input-bg)',`            | K     |
| 464  | `<FileSpreadsheet size={28} style={{ color: 'var(--color-accent)' }} />`           | K     |

### `apps/web/src/components/operations/WorkPermitFormModal.tsx`

| Line | Source quote                                  | Class |
| ---- | --------------------------------------------- | ----- |
| 284  | `background: 'rgba(37, 99, 235, 0.06)',`      | K     |
| 285  | `border: '1px solid rgba(37, 99, 235, 0.2)',` | K     |
| 582  | `background: 'var(--color-accent)',`          | K     |

### `apps/web/src/components/operations/WorkPermitsTab.tsx`

| Line | Source quote                                                           | Class |
| ---- | ---------------------------------------------------------------------- | ----- |
| 106  | `AUTHORIZED: { bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },`        | N     |
| 299  | `background: 'var(--color-accent)',`                                   | K     |
| 442  | `className="font-mono text-blue-600 hover:underline"`                  | K     |
| 603  | `background: active ? 'var(--color-accent)' : 'transparent',`          | C-T   |
| 604  | `color: active ? '#fff' : 'var(--text-secondary)',`                    | C-T   |
| 605  | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',` | C-T   |
| 692  | `color: 'var(--color-accent)',`                                        | K     |

### `apps/web/src/components/operations/calendar/EventDetailModal.tsx`

| Line | Source quote                                                                                                                                  | Class |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 143  | `className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"` | N     |

### `apps/web/src/components/operations/calendar/ListView.tsx`

| Line | Source quote                                                                                                                               | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 58   | `isToday(day) ? 'text-blue-600' : 'text-[var(--text-primary)]'`                                                                            | N     |
| 64   | `<span className="rounded bg-blue-100 px-1 py-0 text-[8px] font-semibold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">` | N     |

### `apps/web/src/components/operations/calendar/types.ts`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 81   | `color: '#1d4ed8',`                                                      | N     |
| 82   | `bg: 'rgba(37,99,235,0.14)',`                                            | N     |
| 100  | `INFO: { label: 'Info', color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' },` | N     |

### `apps/web/src/components/operations/config/AlertsConfigTab.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 66   | `INFO: { label: 'Info', bg: 'rgba(37, 99, 235, 0.12)', fg: '#1d4ed8' },` | N     |
| 378  | `background: 'rgba(37, 99, 235, 0.08)',`                                 | K     |
| 379  | `color: '#1d4ed8',`                                                      | K     |
| 672  | `style={{ accentColor: 'var(--color-accent)', marginTop: 3 }}`           | K     |
| 985  | `background: active ? 'rgba(37, 99, 235, 0.12)' : 'transparent',`        | K     |
| 986  | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',`   | K     |
| 987  | `color: active ? '#1d4ed8' : 'var(--text-secondary)',`                   | K     |

### `apps/web/src/components/operations/config/ApprovalChainEditorModal.tsx`

| Line | Source quote                                                     | Class |
| ---- | ---------------------------------------------------------------- | ----- |
| 246  | `? 'rgba(37, 99, 235, 0.12)'`                                    | K     |
| 249  | `? '#1d4ed8'`                                                    | K     |
| 334  | `style={{ background: 'var(--color-accent)', fontWeight: 600 }}` | K     |

### `apps/web/src/components/operations/config/ApprovalChainsTab.tsx`

| Line | Source quote                             | Class |
| ---- | ---------------------------------------- | ----- |
| 315  | `background: 'rgba(37, 99, 235, 0.10)',` | K     |
| 316  | `color: '#1d4ed8',`                      | K     |

### `apps/web/src/components/operations/config/AssetSubtypeFormModal.tsx`

| Line | Source quote                                                                                    | Class |
| ---- | ----------------------------------------------------------------------------------------------- | ----- |
| 166  | `className="inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline"` | K     |

### `apps/web/src/components/operations/config/AssetTypeFormModal.tsx`

| Line | Source quote                                                                   | Class |
| ---- | ------------------------------------------------------------------------------ | ----- |
| 46   | `const DEFAULT_COLOR = 'var(--color-accent)';`                                 | N     |
| 130  | `background: 'rgba(37, 99, 235, 0.08)',`                                       | K     |
| 131  | `border: '1px solid rgba(37, 99, 235, 0.2)',`                                  | K     |
| 134  | `<Info size={16} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: 2 }} />` | K     |

### `apps/web/src/components/operations/config/AutoCommitmentsTab.tsx`

| Line | Source quote                                                                                                                                           | Class |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 274  | `typeOptions={modal.scope === 'document' ? docTypes : permitTypes}`                                                                                    | N     |
| 318  | `className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"` | K     |
| 335  | `{scope === 'document' ? 'Tipo de documento' : 'Tipo de permiso'}`                                                                                     | N     |

### `apps/web/src/components/operations/config/CommitmentTemplateFormModal.tsx`

| Line | Source quote                                                                                                          | Class |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ----- |
| 65   | `(scope === 'document' ? initial?.documentTypeId : initial?.permitTypeId) ?? '',`                                     | N     |
| 106  | `...(scope === 'document' ? { documentTypeId: typeId } : { permitTypeId: typeId }),`                                  | N     |
| 155  | `<Field label={scope === 'document' ? 'Tipo de documento' : 'Tipo de permiso'}>`                                      | N     |
| 246  | `className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"` | K     |

### `apps/web/src/components/operations/config/WorkPermitTypeFormModal.tsx`

| Line | Source quote                                                                    | Class |
| ---- | ------------------------------------------------------------------------------- | ----- |
| 235  | `? 'rgba(37, 99, 235, 0.12)'`                                                   | K     |
| 237  | `color: requiredRoles.includes(r.value) ? '#1d4ed8' : 'var(--text-secondary)',` | K     |
| 410  | `className="text-xs text-blue-600 hover:underline"`                             | K     |

### `apps/web/src/components/operations/dashboard/ActivityStreamItem.tsx`

| Line | Source quote                                                                  | Class |
| ---- | ----------------------------------------------------------------------------- | ----- |
| 21   | `document: { icon: FileText, color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' },` | N     |

### `apps/web/src/components/operations/dashboard/AssetRiskCard.tsx`

| Line | Source quote        | Class |
| ---- | ------------------- | ----- |
| 45   | `color: '#1d4ed8',` | N     |

### `apps/web/src/components/operations/dashboard/KpiCard.tsx`

| Line | Source quote                                                                       | Class |
| ---- | ---------------------------------------------------------------------------------- | ----- |
| 43   | `className="block focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-xl"` | K     |

### `apps/web/src/components/operations/dashboard/MyTasksWidget.tsx`

| Line | Source quote            | Class |
| ---- | ----------------------- | ----- |
| 49   | `iconColor: '#1d4ed8',` | N     |

### `apps/web/src/components/operations/dashboard/StatusDistributionDonut.tsx`

| Line | Source quote                                                       | Class |
| ---- | ------------------------------------------------------------------ | ----- |
| 15   | `IN_MAINTENANCE: { label: 'En mantenimiento', color: '#1d4ed8' },` | N     |

### `apps/web/src/components/operations/dashboard/UpcomingEventRow.tsx`

| Line | Source quote                                                                     | Class |
| ---- | -------------------------------------------------------------------------------- | ----- |
| 18   | `document: { icon: FileText, chip: '#1d4ed8', chipBg: 'rgba(37,99,235,0.12)' },` | N     |

### `apps/web/src/components/operations/reports/ReportFilterModal.tsx`

| Line | Source quote                                                                                                                                                      | Class |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 478  | `backgroundColor: active ? 'rgba(37,99,235,0.12)' : 'transparent',`                                                                                               | K     |
| 479  | `color: active ? '#1d4ed8' : 'var(--text-secondary)',`                                                                                                            | K     |
| 480  | `borderColor: active ? 'var(--color-accent)' : 'var(--border-color)',`                                                                                            | K     |
| 686  | `className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"` | K     |

### `apps/web/src/components/rrhh/EmployeeAbsencesTab.tsx`

| Line | Source quote                                                                    | Class |
| ---- | ------------------------------------------------------------------------------- | ----- |
| 15   | `const ACCENT = 'var(--color-accent)';`                                         | K     |
| 25   | `PENDIENTE: { label: 'Pendiente', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },` | N     |
| 227  | `style={{ background: ACCENT }}`                                                | K     |
| 262  | `background: filter === f ? ACCENT : 'transparent',`                            | K     |
| 315  | `style={{ color: ACCENT }}`                                                     | K     |
| 514  | `style={{ color: ACCENT }}`                                                     | K     |
| 663  | `style={{ background: ACCENT }}`                                                | K     |

### `apps/web/src/components/rrhh/EmployeeCertificationsTab.tsx`

| Line | Source quote                            | Class |
| ---- | --------------------------------------- | ----- |
| 16   | `const ACCENT = 'var(--color-accent)';` | K     |
| 259  | `style={{ background: ACCENT }}`        | K     |
| 300  | `style={{ color: ACCENT }}`             | K     |
| 460  | `style={{ color: ACCENT }}`             | K     |
| 557  | `style={{ background: ACCENT }}`        | K     |

### `apps/web/src/components/rrhh/EmployeeContractsTab.tsx`

| Line | Source quote                                                          | Class |
| ---- | --------------------------------------------------------------------- | ----- |
| 17   | `const ACCENT = 'var(--color-accent)';`                               | K     |
| 212  | `style={{ background: ACCENT }}`                                      | K     |
| 320  | `style={{ borderColor: highlight ? ACCENT : 'var(--border-color)' }}` | K     |
| 405  | `style={{ color: ACCENT }}`                                           | K     |
| 787  | `style={{ background: ACCENT }}`                                      | K     |

### `apps/web/src/components/rrhh/EmployeeDocumentsTab.tsx`

| Line | Source quote                                                                | Class |
| ---- | --------------------------------------------------------------------------- | ----- |
| 32   | `const ACCENT = 'var(--color-accent)';`                                     | K     |
| 315  | `style={{ background: ACCENT }}`                                            | K     |
| 326  | `<CountChip label="En revisión" value={c.pendingReview} color="#1d4ed8" />` | N     |
| 554  | `style={{ background: ACCENT }}`                                            | K     |
| 720  | `style={{ color: ACCENT }}`                                                 | K     |
| 792  | `style={{ background: ACCENT }}`                                            | K     |

### `apps/web/src/components/rrhh/EmployeeFiniquitoSection.tsx`

| Line | Source quote                                                         | Class |
| ---- | -------------------------------------------------------------------- | ----- |
| 15   | `const ACCENT = 'var(--color-accent)';`                              | K     |
| 123  | `style={{ background: ACCENT }}`                                     | K     |
| 372  | `style={{ background: ACCENT }}`                                     | K     |
| 402  | `<span className="text-lg font-semibold" style={{ color: ACCENT }}>` | N     |

### `apps/web/src/components/rrhh/EmployeeSettlementsSection.tsx`

| Line | Source quote                                                                | Class |
| ---- | --------------------------------------------------------------------------- | ----- |
| 14   | `const ACCENT = 'var(--color-accent)';`                                     | K     |
| 33   | `EMITIDA: { label: 'Emitida', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },` | N     |
| 130  | `style={{ background: ACCENT }}`                                            | K     |
| 186  | `style={{ color: ACCENT }}`                                                 | K     |
| 421  | `style={{ background: ACCENT }}`                                            | K     |
| 556  | `style={{ background: ACCENT }}`                                            | K     |

### `apps/web/src/components/rrhh/EmployeeVacationsTab.tsx`

| Line | Source quote                                                                         | Class |
| ---- | ------------------------------------------------------------------------------------ | ----- |
| 16   | `const ACCENT = 'var(--color-accent)';`                                              | K     |
| 19   | `PENDIENTE: { label: 'Pendiente', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },`      | N     |
| 207  | `style={{ background: ACCENT }}`                                                     | K     |
| 224  | `<Stat label="Pendientes" value={formatDias(balance.pendientes)} color="#1d4ed8" />` | N     |
| 481  | `style={{ background: ACCENT }}`                                                     | K     |
| 569  | `style={{ background: ACCENT }}`                                                     | K     |

### `apps/web/src/components/shared/OriginCard.tsx`

| Line | Source quote                               | Class |
| ---- | ------------------------------------------ | ----- |
| 62   | `style={{ color: 'var(--color-accent)' }}` | K     |

### `apps/web/src/components/shared/Toast.tsx`

| Line | Source quote                                        | Class |
| ---- | --------------------------------------------------- | ----- |
| 17   | `info: 'bg-blue-50 border-blue-200 text-blue-800',` | N     |

### `apps/web/src/components/sidebars/ActividadesSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 90   | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/sidebars/ComercialSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 80   | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/sidebars/FinanceSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 82   | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/sidebars/HsecSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 58   | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/sidebars/MarketingSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 47   | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/sidebars/OperationsSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 187  | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |
| 238  | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/sidebars/RrhhSidebar.tsx`

| Line | Source quote                                                             | Class |
| ---- | ------------------------------------------------------------------------ | ----- |
| 58   | ``className={`tn-nav__item${isActive ? ' tn-nav__item--active' : ''}`}`` | C-S   |

### `apps/web/src/components/tax/SiiConnectionModal.tsx`

| Line | Source quote                                    | Class |
| ---- | ----------------------------------------------- | ----- |
| 147  | `? 'border-blue-500 bg-blue-50'`                | K     |
| 279  | `border-color: #2563eb;`                        | K     |
| 280  | `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);` | K     |

### `apps/web/src/components/tax/TaxDocumentTypeBadge.tsx`

| Line | Source quote                        | Class |
| ---- | ----------------------------------- | ----- |
| 14   | `cls: 'bg-blue-100 text-blue-700',` | N     |

### `apps/web/src/lib/file-icons.tsx`

| Line | Source quote                                                                                       | Class |
| ---- | -------------------------------------------------------------------------------------------------- | ----- |
| 19   | `return <ImageIcon size={size} className={className} style={{ color: 'var(--color-accent)' }} />;` | K     |
| 25   | `return <FileText size={size} className={className} style={{ color: 'var(--color-accent)' }} />;`  | K     |

### `apps/web/src/styles/tokens.css`

| Line | Source quote                                     | Class |
| ---- | ------------------------------------------------ | ----- |
| 7    | `--color-accent: #2563eb;`                       | K     |
| 8    | `--color-accent-secondary: #1e3a5f;`             | K     |
| 9    | `--color-accent-light: #93c5fd;`                 | K     |
| 10   | `--color-accent-muted: #64748b;`                 | K     |
| 11   | `--color-accent-dim: rgba(37, 99, 235, 0.08);`   | K     |
| 12   | `--color-accent-surface: #f1f5f9;`               | K     |
| 38   | `--sidebar-active-bg: rgba(255, 255, 255, 0.1);` | N     |
| 39   | `--sidebar-active-border: #60a5fa;`              | N     |
