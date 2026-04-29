-- OPS-034 — Materialized views that pre-compute the heaviest data
-- read by the Operations Dashboard. With auto-refresh on the page
-- (60s × N concurrent users) the live aggregations were costing
-- 200–500 ms per request; reading from these MVs drops that under
-- 20 ms. Refresh strategy lives in the application layer:
--   * BullMQ cron, fast (every 15 min) for status_distribution +
--     company_compliance_summary
--   * BullMQ cron, slow (hourly) for asset_compliance_snapshot +
--     compliance_by_category
--   * Domain-event listeners (debounced) trigger selective refreshes
--     when an asset blocks/unblocks, a document/permit is about to
--     expire, or a work permit closes
--
-- IMPORTANT: PostgreSQL DOES NOT apply RLS to materialized views.
-- Every read query MUST filter by company_id explicitly. The
-- application layer (operations-dashboard.service.ts) is responsible
-- for that — never expose these MVs through a generic finder.
--
-- All MVs have a UNIQUE index so REFRESH MATERIALIZED VIEW
-- CONCURRENTLY can run without taking an AccessExclusiveLock.

-- ════════════════════════════════════════════════════════════════
-- MV 1 — mv_asset_compliance_snapshot
-- One row per active asset with all compliance indicators
-- pre-calculated. Used by getTopAssetsAtRisk and feeds
-- mv_company_compliance_summary.
-- ════════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_asset_compliance_snapshot CASCADE;

CREATE MATERIALIZED VIEW mv_asset_compliance_snapshot AS
SELECT
  a.id                              AS asset_id,
  a."companyId"                     AS company_id,
  a.code                            AS code,
  a.name                            AS name,
  a.status                          AS status,
  a."assetTypeId"                   AS asset_type_id,
  at.name                           AS asset_type_name,
  at.category                       AS asset_type_category,
  a."locationId"                    AS location_id,
  l.name                            AS location_name,
  a."assignedToUserId"              AS assigned_to_user_id,

  -- Document compliance (only counts isActive=true, status != REPLACED)
  COALESCE(doc_stats.total_required, 0)        AS total_required_docs,
  COALESCE(doc_stats.valid_docs, 0)            AS valid_docs,
  COALESCE(doc_stats.expiring_soon_docs, 0)    AS expiring_soon_docs,
  COALESCE(doc_stats.expired_docs, 0)          AS expired_docs,
  COALESCE(doc_stats.missing_docs, 0)          AS missing_docs,
  COALESCE(doc_stats.critical_issues, 0)       AS critical_issues,
  COALESCE(doc_stats.blocking_issues, 0)       AS blocking_issues,

  -- Alert counts
  COALESCE(alert_stats.active_alerts, 0)       AS active_alerts,
  COALESCE(alert_stats.critical_alerts, 0)     AS critical_alerts,
  COALESCE(alert_stats.escalated_alerts, 0)    AS escalated_alerts,

  -- Active exception (boolean + expiry for UI)
  exc.id IS NOT NULL                           AS has_active_exception,
  exc."validUntil"                             AS exception_expires_at,

  -- Compliance percentage (0–100). 100 when nothing is required.
  CASE
    WHEN COALESCE(doc_stats.total_required, 0) = 0 THEN 100
    ELSE ROUND(
      (COALESCE(doc_stats.valid_docs, 0)::numeric / doc_stats.total_required) * 100,
      2
    )
  END                                          AS compliance_percentage,

  -- Risk score — same formula as getTopAssetsAtRisk (10/5/5/3/2)
  (
    (COALESCE(alert_stats.critical_alerts, 0) * 10) +
    (COALESCE(doc_stats.critical_missing, 0) * 5) +
    (COALESCE(doc_stats.critical_expired, 0) * 5) +
    (COALESCE(alert_stats.active_alerts, 0)  * 3) +
    (COALESCE(doc_stats.expiring_soon_docs, 0) * 2)
  )                                            AS risk_score,

  -- Most recent event involving this asset — useful for diagnostics
  GREATEST(
    a."updatedAt",
    COALESCE(doc_stats.last_doc_event_at, '1970-01-01'::timestamp),
    COALESCE(alert_stats.last_alert_at,  '1970-01-01'::timestamp)
  )                                            AS last_event_at,
  NOW()                                        AS refreshed_at

FROM operational_assets a
LEFT JOIN asset_types at ON at.id = a."assetTypeId"
LEFT JOIN locations  l   ON l.id  = a."locationId"

-- ── document compliance per asset ─────────────────────────────
LEFT JOIN LATERAL (
  WITH required AS (
    /* Resolve requirements via the matrix engine: most specific
       wins (asset > subtype > type). DISTINCT ON dedupes by
       documentTypeId, ordered by specificity. */
    SELECT DISTINCT ON (req."documentTypeId")
      req."documentTypeId",
      dt.criticality,
      dt."blocksOperation"
    FROM document_requirements req
    INNER JOIN document_types dt ON dt.id = req."documentTypeId"
    WHERE req."companyId"   = a."companyId"
      AND req."isMandatory" = true
      AND dt."isActive"     = true
      AND (
        req."assetId" = a.id
        OR (req."assetId" IS NULL AND req."assetSubtypeId" = a."assetSubtypeId")
        OR (req."assetId" IS NULL AND req."assetSubtypeId" IS NULL
            AND req."assetTypeId" = a."assetTypeId")
      )
    ORDER BY req."documentTypeId",
      CASE
        WHEN req."assetId"        IS NOT NULL THEN 1
        WHEN req."assetSubtypeId" IS NOT NULL THEN 2
        ELSE 3
      END
  ),
  latest_docs AS (
    /* Latest non-replaced record per (asset, documentType). */
    SELECT DISTINCT ON (dr."documentTypeId")
      dr."documentTypeId",
      dr.status,
      dr."expirationDate",
      dr."updatedAt",
      r.criticality,
      r."blocksOperation"
    FROM document_records dr
    INNER JOIN required r ON r."documentTypeId" = dr."documentTypeId"
    WHERE dr."assetId"   = a.id
      AND dr."companyId" = a."companyId"
      AND dr."isActive"  = true
      AND dr.status     != 'REPLACED'
    ORDER BY dr."documentTypeId", dr.version DESC, dr."createdAt" DESC
  )
  SELECT
    (SELECT COUNT(*) FROM required) AS total_required,

    -- Valid: APPROVED with no expiration OR more than 30 days out
    COUNT(*) FILTER (
      WHERE ld.status = 'APPROVED'
        AND (ld."expirationDate" IS NULL
             OR ld."expirationDate" > NOW() + INTERVAL '30 days')
    )                                AS valid_docs,

    -- Expiring soon: APPROVED, expires in (NOW, NOW+30d]
    COUNT(*) FILTER (
      WHERE ld.status = 'APPROVED'
        AND ld."expirationDate" IS NOT NULL
        AND ld."expirationDate" >  NOW()
        AND ld."expirationDate" <= NOW() + INTERVAL '30 days'
    )                                AS expiring_soon_docs,

    -- Expired: APPROVED with past expiration
    COUNT(*) FILTER (
      WHERE ld.status = 'APPROVED'
        AND ld."expirationDate" IS NOT NULL
        AND ld."expirationDate" < NOW()
    )                                AS expired_docs,

    -- Missing: required − any record exists
    (SELECT COUNT(*) FROM required) - COUNT(ld."documentTypeId") AS missing_docs,

    -- Critical issues = critical missing + critical expired
    (
      COUNT(*) FILTER (
        WHERE ld.criticality = 'CRITICAL'
          AND ld.status = 'APPROVED'
          AND ld."expirationDate" IS NOT NULL
          AND ld."expirationDate" < NOW()
      )
      +
      (SELECT COUNT(*) FROM required r2
        WHERE r2.criticality = 'CRITICAL'
          AND r2."documentTypeId" NOT IN (SELECT "documentTypeId" FROM latest_docs))
    )                                AS critical_issues,

    -- Blocking issues = blockers missing + blockers expired
    (
      COUNT(*) FILTER (
        WHERE ld."blocksOperation" = true
          AND ld.status = 'APPROVED'
          AND ld."expirationDate" IS NOT NULL
          AND ld."expirationDate" < NOW()
      )
      +
      (SELECT COUNT(*) FROM required r2
        WHERE r2."blocksOperation" = true
          AND r2."documentTypeId" NOT IN (SELECT "documentTypeId" FROM latest_docs))
    )                                AS blocking_issues,

    -- Critical missing alone (for the risk-score formula)
    (SELECT COUNT(*) FROM required r2
      WHERE r2.criticality = 'CRITICAL'
        AND r2."documentTypeId" NOT IN (SELECT "documentTypeId" FROM latest_docs)
    )                                AS critical_missing,

    -- Critical expired alone (for the risk-score formula)
    COUNT(*) FILTER (
      WHERE ld.criticality = 'CRITICAL'
        AND ld.status = 'APPROVED'
        AND ld."expirationDate" IS NOT NULL
        AND ld."expirationDate" < NOW()
    )                                AS critical_expired,

    MAX(ld."updatedAt")              AS last_doc_event_at
  FROM latest_docs ld
) AS doc_stats ON true

-- ── alert counts per asset ────────────────────────────────────
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE ai.status = 'ACTIVE')                                                  AS active_alerts,
    COUNT(*) FILTER (WHERE ai.status = 'ACTIVE' AND ai.severity IN ('CRITICAL', 'BLOCKING'))      AS critical_alerts,
    COUNT(*) FILTER (WHERE ai.status = 'ESCALATED')                                               AS escalated_alerts,
    MAX(ai."triggeredAt")                                                                          AS last_alert_at
  FROM alert_instances ai
  WHERE ai."assetId"   = a.id
    AND ai."companyId" = a."companyId"
) AS alert_stats ON true

-- ── active exception (if any) ─────────────────────────────────
LEFT JOIN asset_exceptions exc
  ON exc."assetId"     = a.id
  AND exc."companyId"  = a."companyId"
  AND exc.status       = 'APPROVED'
  AND exc."validUntil" > NOW()

WHERE a.status NOT IN ('DECOMMISSIONED');

-- UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_asset_compliance_snapshot_pk
  ON mv_asset_compliance_snapshot (company_id, asset_id);

-- Order by risk score for getTopAssetsAtRisk
CREATE INDEX idx_mv_asset_compliance_snapshot_risk
  ON mv_asset_compliance_snapshot (company_id, risk_score DESC);

-- Filter by status (used by status-distribution and overview KPIs)
CREATE INDEX idx_mv_asset_compliance_snapshot_status
  ON mv_asset_compliance_snapshot (company_id, status);


-- ════════════════════════════════════════════════════════════════
-- MV 2 — mv_company_compliance_summary
-- One row per active company with the headline KPIs that drive
-- getOverview. Built on top of mv_asset_compliance_snapshot so the
-- doc/asset rollups stay consistent across endpoints.
-- ════════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_company_compliance_summary CASCADE;

CREATE MATERIALIZED VIEW mv_company_compliance_summary AS
SELECT
  c.id                                                  AS company_id,

  -- Operational health (rolled up from the asset snapshot MV)
  COALESCE(asset_kpi.total_active_assets, 0)            AS total_active_assets,
  COALESCE(asset_kpi.operational_assets, 0)             AS operational_assets,
  COALESCE(asset_kpi.blocked_assets, 0)                 AS blocked_assets,
  COALESCE(asset_kpi.with_observations, 0)              AS with_observations,
  COALESCE(asset_kpi.in_maintenance, 0)                 AS in_maintenance,
  COALESCE(asset_kpi.out_of_service, 0)                 AS out_of_service,
  CASE
    WHEN COALESCE(asset_kpi.total_active_assets, 0) = 0 THEN 100
    ELSE ROUND(
      (asset_kpi.operational_assets::numeric / asset_kpi.total_active_assets) * 100,
      2
    )
  END                                                   AS operational_percentage,

  -- Document compliance, aggregated from the snapshot MV
  COALESCE(asset_kpi.total_required_docs, 0)            AS total_required_docs,
  COALESCE(asset_kpi.total_valid_docs, 0)               AS total_valid_docs,
  COALESCE(asset_kpi.total_expiring_soon, 0)            AS total_expiring_soon_docs,
  COALESCE(asset_kpi.total_expired_docs, 0)             AS total_expired_docs,
  COALESCE(asset_kpi.total_missing_docs, 0)             AS total_missing_docs,
  COALESCE(asset_kpi.total_critical_issues, 0)          AS total_critical_issues,
  CASE
    WHEN COALESCE(asset_kpi.total_required_docs, 0) = 0 THEN 100
    ELSE ROUND(
      (asset_kpi.total_valid_docs::numeric / asset_kpi.total_required_docs) * 100,
      2
    )
  END                                                   AS document_compliance_percentage,

  -- External permit compliance (live from `permits`)
  COALESCE(permit_kpi.active_external_permits, 0)       AS active_external_permits,
  COALESCE(permit_kpi.valid_external_permits, 0)        AS valid_external_permits,
  COALESCE(permit_kpi.expiring_external_permits, 0)     AS expiring_external_permits,
  COALESCE(permit_kpi.expired_external_permits, 0)      AS expired_external_permits,
  CASE
    WHEN COALESCE(permit_kpi.active_external_permits, 0) = 0 THEN 100
    ELSE ROUND(
      (permit_kpi.valid_external_permits::numeric / permit_kpi.active_external_permits) * 100,
      2
    )
  END                                                   AS permit_compliance_percentage,

  -- Work permit activity
  COALESCE(wp_kpi.in_execution, 0)                      AS work_permits_in_execution,
  COALESCE(wp_kpi.pending_authorization, 0)             AS work_permits_pending_authorization,
  COALESCE(wp_kpi.authorized_today, 0)                  AS work_permits_authorized_today,
  COALESCE(wp_kpi.closed_today, 0)                      AS work_permits_closed_today,

  -- Alert KPIs
  COALESCE(alert_kpi.total, 0)                          AS total_alerts,
  COALESCE(alert_kpi.critical, 0)                       AS critical_alerts,
  COALESCE(alert_kpi.blocking, 0)                       AS blocking_alerts,
  COALESCE(alert_kpi.unattended, 0)                     AS unattended_alerts,
  COALESCE(alert_kpi.escalated, 0)                      AS escalated_alerts,

  -- Exception KPIs
  COALESCE(exc_kpi.active_count, 0)                     AS active_exceptions,
  COALESCE(exc_kpi.pending_approval, 0)                 AS pending_approval_exceptions,
  COALESCE(exc_kpi.expiring_soon, 0)                    AS expiring_exceptions,

  -- Procedure KPIs
  COALESCE(proc_kpi.published, 0)                       AS published_procedures,

  NOW()                                                 AS refreshed_at
FROM companies c

-- ── asset rollup (from snapshot MV) ───────────────────────────
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                                                                         AS total_active_assets,
    COUNT(*) FILTER (WHERE status = 'OPERATIONAL')                                                   AS operational_assets,
    COUNT(*) FILTER (WHERE status IN ('BLOCKED_DOCUMENTAL', 'BLOCKED_PERMIT'))                       AS blocked_assets,
    COUNT(*) FILTER (WHERE status = 'WITH_OBSERVATIONS')                                             AS with_observations,
    COUNT(*) FILTER (WHERE status = 'IN_MAINTENANCE')                                                AS in_maintenance,
    COUNT(*) FILTER (WHERE status IN ('NON_OPERATIONAL', 'OUT_OF_SERVICE'))                          AS out_of_service,
    SUM(total_required_docs)                                                                          AS total_required_docs,
    SUM(valid_docs)                                                                                   AS total_valid_docs,
    SUM(expiring_soon_docs)                                                                           AS total_expiring_soon,
    SUM(expired_docs)                                                                                 AS total_expired_docs,
    SUM(missing_docs)                                                                                 AS total_missing_docs,
    SUM(critical_issues)                                                                              AS total_critical_issues
  FROM mv_asset_compliance_snapshot
  WHERE company_id = c.id
) AS asset_kpi ON true

-- ── external permits rollup ───────────────────────────────────
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE p.status = 'APPROVED' AND p."isActive" = true)                            AS active_external_permits,
    COUNT(*) FILTER (
      WHERE p.status = 'APPROVED'
        AND p."isActive" = true
        AND (p."expirationDate" IS NULL OR p."expirationDate" > NOW() + INTERVAL '30 days')
    )                                                                                                AS valid_external_permits,
    COUNT(*) FILTER (
      WHERE p.status = 'APPROVED'
        AND p."isActive" = true
        AND p."expirationDate" IS NOT NULL
        AND p."expirationDate" >  NOW()
        AND p."expirationDate" <= NOW() + INTERVAL '30 days'
    )                                                                                                AS expiring_external_permits,
    COUNT(*) FILTER (
      WHERE p.status = 'APPROVED'
        AND p."isActive" = true
        AND p."expirationDate" IS NOT NULL
        AND p."expirationDate" < NOW()
    )                                                                                                AS expired_external_permits
  FROM permits p
  WHERE p."companyId" = c.id
) AS permit_kpi ON true

-- ── work permits rollup ───────────────────────────────────────
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE status = 'IN_EXECUTION')                                                  AS in_execution,
    COUNT(*) FILTER (WHERE status = 'PENDING_AUTHORIZATION')                                         AS pending_authorization,
    COUNT(*) FILTER (
      WHERE status IN ('AUTHORIZED', 'IN_EXECUTION', 'CLOSED')
        AND DATE("authorizedAt" AT TIME ZONE 'America/Santiago') = CURRENT_DATE
    )                                                                                                AS authorized_today,
    COUNT(*) FILTER (
      WHERE status = 'CLOSED'
        AND DATE("actualEnd" AT TIME ZONE 'America/Santiago') = CURRENT_DATE
    )                                                                                                AS closed_today
  FROM work_permits
  WHERE "companyId" = c.id
) AS wp_kpi ON true

-- ── alert rollup ──────────────────────────────────────────────
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE status = 'ACTIVE')                                                        AS total,
    COUNT(*) FILTER (WHERE status = 'ACTIVE' AND severity = 'CRITICAL')                              AS critical,
    COUNT(*) FILTER (WHERE status = 'ACTIVE' AND severity = 'BLOCKING')                              AS blocking,
    COUNT(*) FILTER (
      WHERE status = 'ACTIVE'
        AND "triggeredAt" < NOW() - INTERVAL '24 hours'
    )                                                                                                AS unattended,
    COUNT(*) FILTER (WHERE status = 'ESCALATED')                                                     AS escalated
  FROM alert_instances
  WHERE "companyId" = c.id
) AS alert_kpi ON true

-- ── exception rollup ──────────────────────────────────────────
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE status = 'APPROVED' AND "validUntil" > NOW())                             AS active_count,
    COUNT(*) FILTER (WHERE status = 'PENDING')                                                       AS pending_approval,
    COUNT(*) FILTER (
      WHERE status = 'APPROVED'
        AND "validUntil" BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    )                                                                                                AS expiring_soon
  FROM asset_exceptions
  WHERE "companyId" = c.id
) AS exc_kpi ON true

-- ── procedures rollup ─────────────────────────────────────────
LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER (WHERE status = 'PUBLISHED') AS published
  FROM procedures
  WHERE "companyId" = c.id
) AS proc_kpi ON true

WHERE c."isActive" = true;

CREATE UNIQUE INDEX idx_mv_company_compliance_summary_pk
  ON mv_company_compliance_summary (company_id);


-- ════════════════════════════════════════════════════════════════
-- MV 3 — mv_compliance_by_category
-- One row per (company, document category) for the dashboard's
-- compliance bar chart. Counts (asset, documentType) tuples once
-- regardless of how many requirement rows match.
-- ════════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_compliance_by_category CASCADE;

CREATE MATERIALIZED VIEW mv_compliance_by_category AS
SELECT
  a."companyId"                               AS company_id,
  dt.category                                 AS category,
  COUNT(DISTINCT (a.id, dt.id))               AS total_required,
  COUNT(DISTINCT (a.id, dt.id)) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM document_records dr
      WHERE dr."assetId"        = a.id
        AND dr."documentTypeId" = dt.id
        AND dr.status           = 'APPROVED'
        AND dr."isActive"       = true
        AND (dr."expirationDate" IS NULL OR dr."expirationDate" > NOW())
    )
  )                                           AS valid,
  CASE
    WHEN COUNT(DISTINCT (a.id, dt.id)) = 0 THEN 100
    ELSE ROUND(
      (COUNT(DISTINCT (a.id, dt.id)) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM document_records dr
          WHERE dr."assetId"        = a.id
            AND dr."documentTypeId" = dt.id
            AND dr.status           = 'APPROVED'
            AND dr."isActive"       = true
            AND (dr."expirationDate" IS NULL OR dr."expirationDate" > NOW())
        )
      ))::numeric / COUNT(DISTINCT (a.id, dt.id)) * 100,
      2
    )
  END                                         AS percentage,
  NOW()                                       AS refreshed_at
FROM operational_assets a
INNER JOIN document_requirements req ON (
      (req."assetId" = a.id)
   OR (req."assetSubtypeId" = a."assetSubtypeId" AND req."assetId" IS NULL)
   OR (req."assetTypeId"    = a."assetTypeId"    AND req."assetId" IS NULL AND req."assetSubtypeId" IS NULL)
)
INNER JOIN document_types dt ON dt.id = req."documentTypeId"
WHERE a.status NOT IN ('DECOMMISSIONED')
  AND req."isMandatory" = true
  AND dt."isActive"     = true
GROUP BY a."companyId", dt.category;

CREATE UNIQUE INDEX idx_mv_compliance_by_category_pk
  ON mv_compliance_by_category (company_id, category);


-- ════════════════════════════════════════════════════════════════
-- MV 4 — mv_asset_status_distribution
-- Donut-chart counts per (company, status). Cheap to compute, but
-- recomputed on every dashboard load × every user — the savings
-- come from avoiding the GROUP BY scan, not from any single query.
-- ════════════════════════════════════════════════════════════════
DROP MATERIALIZED VIEW IF EXISTS mv_asset_status_distribution CASCADE;

CREATE MATERIALIZED VIEW mv_asset_status_distribution AS
SELECT
  "companyId"  AS company_id,
  status       AS status,
  COUNT(*)     AS count,
  NOW()        AS refreshed_at
FROM operational_assets
GROUP BY "companyId", status;

CREATE UNIQUE INDEX idx_mv_asset_status_distribution_pk
  ON mv_asset_status_distribution (company_id, status);


-- ════════════════════════════════════════════════════════════════
-- Initial population — order matters: company_summary reads from
-- asset_compliance_snapshot.
-- ════════════════════════════════════════════════════════════════
REFRESH MATERIALIZED VIEW mv_asset_compliance_snapshot;
REFRESH MATERIALIZED VIEW mv_compliance_by_category;
REFRESH MATERIALIZED VIEW mv_asset_status_distribution;
REFRESH MATERIALIZED VIEW mv_company_compliance_summary;


-- ════════════════════════════════════════════════════════════════
-- Grants — match the rest of the operations schema (app_user is
-- the runtime role used by the API). RLS does not apply to MVs;
-- the application enforces company isolation via WHERE clauses.
-- ════════════════════════════════════════════════════════════════
GRANT SELECT ON mv_asset_compliance_snapshot   TO app_user;
GRANT SELECT ON mv_company_compliance_summary  TO app_user;
GRANT SELECT ON mv_compliance_by_category      TO app_user;
GRANT SELECT ON mv_asset_status_distribution   TO app_user;
