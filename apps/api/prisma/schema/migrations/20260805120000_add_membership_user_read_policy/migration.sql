-- ─────────────────────────────────────────────────────────────────────────
-- HARDEN-004B1 (2026-08-05) — a SECOND, READ-ONLY policy on memberships,
-- keyed on the USER instead of the company. Founder decision, signed
-- 2026-08-05.
--
-- WHY IT EXISTS — the bootstrap question. GET /auth/me asks "which companies do
-- you belong to?" (AuthService.getMe, iam/auth.service.ts:94-118). That is a
-- question about a USER, and it is asked BEFORE any company has been selected,
-- so no rls.company_id can exist yet — TenantMiddleware is excluded from
-- api/auth/* (app.module.ts:110-115). Under the app_user runtime role the
-- existing company-keyed membership_isolation policy therefore matches nothing,
-- getMe returns `companies: []` with HTTP 200, and the user is stranded on a
-- blank company picker. An empty array, not an error — which is why it needs a
-- policy rather than a bug fix.
--
-- HOW IT WORKS. PostgreSQL ORs multiple PERMISSIVE policies for the same
-- command: a row passes when EITHER policy matches. membership_isolation keeps
-- serving every company-scoped query; this one serves the pre-company question.
-- NOTE: memberships and companies (HARDEN-004B2, below) become the first two
-- tables in this schema to carry two policies each — every other table is
-- exactly one policy to one table.
--
-- IT DOES NOT WEAKEN WRITES. membership_isolation is untouched here. It is FOR
-- ALL with no WITH CHECK clause, so its USING expression doubles as the write
-- check for INSERT/UPDATE, and it stays the ONLY policy that can permit a write.
-- A FOR SELECT policy contributes no WITH CHECK at all, so INSERT / UPDATE /
-- DELETE on memberships remain strictly company-scoped, exactly as before.
--
-- WHAT THIS EXPOSES THAT WAS NOT EXPOSED BEFORE — stated without minimising.
-- A caller whose rls.user_id is set can now SELECT their OWN membership rows
-- with no company context. A membership row reveals, to its own user: the row
-- id, userId, companyId, role, isActive and the timestamps — i.e. which
-- companies they belong to and with which role.
-- Another user's row can NEVER match: the predicate compares the row's "userId"
-- against the GUC, so a row is visible only to the user that owns it. There is
-- no wildcard, no join, and no company term to widen. rls.user_id is set by
-- RlsService from the JWT-validated user id (rls.service.ts:30) and never from a
-- client-supplied header (unlike x-company-id, which is raw client input).
--   * V1 — one tenant = one company; a user belongs to exactly one company.
--     Practical exposure is NIL: the single row a user can now read without a
--     company context is the same row they could already read with one, and it
--     is their own.
--   * V2 — a tenant may hold several companies (Chilean holdings); a user may
--     then hold several memberships, always within their own tenant, never
--     across tenants. The change becomes real but stays bounded: the user can
--     read the list of THEIR OWN memberships before selecting a company, which
--     is precisely what the company picker needs. Still only their own rows;
--     still nothing about any other user.
--   The same policy serves V1 and V2 unchanged, which is why this shape was
--   chosen over a SECURITY DEFINER bypass function — that would have added a
--   second privileged door to guard.
--
-- REVERT (this policy alone): DROP POLICY membership_self_read ON memberships;
--   (reverting the whole migration also drops company_self_read — see B2 below.)
--
-- Deliberately NOT in this migration, because memberships already has them:
--   * ALTER TABLE ... ENABLE ROW LEVEL SECURITY — enabled 20260417171836:19.
--   * GRANT ... TO app_user — covered by the 2026-04-17 ON ALL TABLES grant.
--   * audit trigger — audit_memberships exists (20260417172748:56-58).
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — user-scoped READ, ORed with the company-scoped membership_isolation.
CREATE POLICY membership_self_read ON memberships
  AS PERMISSIVE
  FOR SELECT
  USING ("userId" = current_setting('rls.user_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────────────────
-- HARDEN-004B2 (2026-08-06) — a SECOND, READ-ONLY policy on companies,
-- keyed on the CALLER'S MEMBERSHIPS instead of the selected company.
-- Three founder decisions, signed 2026-08-06, recorded below.
--
-- WHY IT EXISTS — the other half of the bootstrap question. B1-VERIFY
-- measured that Prisma (6.19.3; no previewFeatures in base.prisma, so no
-- relationJoins) answers GET /auth/me with THREE separate statements, not
-- a join: users, then memberships, then companies (WHERE "id" IN (...)).
-- Each statement meets RLS alone. With rls.user_id set and rls.company_id
-- unset, membership_self_read (above) admits the caller's membership rows
-- — but statement 3 then meets company_isolation
-- (20260417171836_add_rls_policies:15-16), whose predicate compares
-- against the absent company GUC, evaluates NULL, and returns ZERO rows.
-- getMe then dereferences m.company.id unconditionally
-- (iam/auth.service.ts:130). One policy is not enough; this is the second.
--
-- HOW IT WORKS — and why the two policies MUST ship together. The EXISTS
-- below reads memberships, and that read is itself subject to memberships'
-- own policies (policy expressions run as the querying role). In the
-- bootstrap context (rls.user_id set, rls.company_id unset),
-- membership_isolation evaluates NULL — the EXISTS sees the caller's rows
-- ONLY because membership_self_read (above) admits them. This policy is
-- inert without B1: one problem, one migration, two policies.
--
-- IT DOES NOT WEAKEN WRITES. company_isolation is untouched and remains
-- FOR ALL with no WITH CHECK clause, so its USING expression stays the
-- ONLY write check on companies. A FOR SELECT policy contributes no
-- WITH CHECK at all: INSERT / UPDATE / DELETE on companies remain strictly
-- company-scoped, exactly as before.
--
-- WHAT THIS EXPOSES — the three founder decisions, verbatim:
--   1. ROW-LEVEL, THEREFORE COLUMN-BLIND (signed 2026-08-06). The policy
--      admits the FULL companies row — all eleven columns, settings
--      included — to members of that company only, never to third parties.
--      What the user SEES stays whatever the application returns (getMe:
--      id, name, taxId). Marginal exposure versus today: TIMING, not
--      data — any company a member can select already exposes its full
--      row through company_isolation once rls.company_id is set.
--   2. IT WIDENS BEYOND getMe, AND THAT IS THE SIGNED MEANING
--      (2026-08-06): a user can read the row of every company they
--      BELONG TO (active membership), in any query, before and after
--      company selection. Bounded to the caller's own tenant by
--      construction — memberships never cross tenants (signed
--      2026-08-05). Membership governs, not the holding: belonging to 2
--      of a tenant's 3 companies shows 2. If a V2 surface must show
--      less, that is an application-layer WHERE on that surface; the
--      policy is the floor, the application narrows.
--   3. THE isActive CONDITION STAYS (signed 2026-08-06): deactivating a
--      membership revokes visibility of that company's row at the
--      database floor, instantly. Accepted, dated consequence: a future
--      historical view resolving a company name through a DEACTIVATED
--      membership renders blank. Deliberate asymmetry with
--      membership_self_read (which carries no isActive): the caller's
--      own membership rows are their history; the company's descriptive
--      row stops being theirs.
--
-- PERFORMANCE. The EXISTS is an index probe on the unique index
-- memberships_userId_companyId_key (@@unique([userId, companyId]),
-- iam.prisma:41), paid per candidate row on every SELECT on companies —
-- negligible at this table's scale. The planner may evaluate both
-- permissive arms rather than short-circuit.
--
-- REVERT (this policy alone): DROP POLICY company_self_read ON companies;
-- REVERT (whole migration): both DROP POLICY statements — this one and
--   membership_self_read's above — and nothing else.
--
-- Deliberately NOT in this migration, because companies already has them:
--   * ALTER TABLE ... ENABLE ROW LEVEL SECURITY — enabled 20260417171836:13.
--   * GRANT ... TO app_user — covered by the 2026-04-17 ON ALL TABLES
--     grant (20260417171836:33).
--   * audit trigger — audit_companies exists (20260417172748:52-54).
-- ─────────────────────────────────────────────────────────────────────────

-- RLS — user-scoped READ on the companies a caller actually belongs to.
CREATE POLICY company_self_read ON companies
  AS PERMISSIVE
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m."companyId" = companies.id
        AND m."userId" = current_setting('rls.user_id', true)::uuid
        AND m."isActive"
    )
  );
