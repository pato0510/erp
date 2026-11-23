-- FR-001A-B — PostgreSQL 16; UNA sentencia SELECT con CTEs de lectura, UN resultset CSV.
-- Revisión del director antes de ejecución productiva por Pato. No ejecutado en producción.
-- Sin BEGIN/ROLLBACK/SET, DML, DDL, cambios de rol ni funciones con efectos secundarios.
-- No muestra nombres, RUT, descripciones, folios, importes ni credenciales.
-- Tipos: nueve columnas text y filas bigint. NULL de fechas exporta celda vacía.
-- INVENTARIO: campo_fecha vacío = COUNT(*); con fecha = COUNT(fecha no NULL) + rango.
-- DIMENSIONES y diagnósticos: conteos de grupos existentes, sin detalle individual.
-- TOTAL se distingue de EMPRESA; <NULL> es valor nulo, <SIN_CONTEXTO> es audit sin companyId.
-- audit_logs.tenantId contiene companyId por doctrina/trigger. Nunca se leen oldData/newData.
-- USO cuenta eventos de escritura, NO usuarios, visitas ni transacciones financieras únicas.
-- Ventanas móviles UTC [ahora-N días, ahora]; última escritura usa todo el historial disponible.
-- Cuatro tablas no tienen audit trigger: bank_sync_runs, external_bank_movements,
-- tax_sync_runs, alert_thresholds. Cero audit no demuestra ausencia de uso.
-- import_logs incluye entidades Ops; entityType permite separarlas en DIMENSIONES.
-- No hay LIMIT ni muestreo: el límite orientativo de 1500 filas se valida localmente, no recorta datos.
-- RLS se conserva: un rol limitado puede obtener cifras parciales. No se cambia contexto de sesión.
WITH
finance_tables(tabla) AS (
    VALUES
        ('movements'::text),
        ('import_logs'::text),
        ('bank_accounts'::text),
        ('account_balances'::text),
        ('commitments'::text),
        ('commitment_templates'::text),
        ('categories'::text),
        ('counterparties'::text),
        ('cost_centers'::text),
        ('fiscal_periods'::text),
        ('bank_connections'::text),
        ('bank_sync_runs'::text),
        ('external_bank_movements'::text),
        ('tax_documents'::text),
        ('tax_sync_runs'::text),
        ('reconciliation_matches'::text),
        ('sii_connections'::text),
        ('category_rules'::text),
        ('company_goals'::text),
        ('alerts'::text),
        ('alert_thresholds'::text),
        ('company_settings'::text)
),
reloj AS (SELECT CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS referencia),
t0 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("date")::bigint AS "date_n",
           MIN("date")::text AS "date_min",
           MAX("date")::text AS "date_max",
           COUNT("confirmedAt")::bigint AS "confirmedAt_n",
           MIN("confirmedAt")::text AS "confirmedAt_min",
           MAX("confirmedAt")::text AS "confirmedAt_max",
           COUNT("cancelledAt")::bigint AS "cancelledAt_n",
           MIN("cancelledAt")::text AS "cancelledAt_min",
           MAX("cancelledAt")::text AS "cancelledAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."movements"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t1 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max"
    FROM public."import_logs"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t2 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."bank_accounts"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t3 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."account_balances"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t4 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("dueDate")::bigint AS "dueDate_n",
           MIN("dueDate")::text AS "dueDate_min",
           MAX("dueDate")::text AS "dueDate_max",
           COUNT("paidAt")::bigint AS "paidAt_n",
           MIN("paidAt")::text AS "paidAt_min",
           MAX("paidAt")::text AS "paidAt_max",
           COUNT("autoFulfilledAt")::bigint AS "autoFulfilledAt_n",
           MIN("autoFulfilledAt")::text AS "autoFulfilledAt_min",
           MAX("autoFulfilledAt")::text AS "autoFulfilledAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."commitments"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t5 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."commitment_templates"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t6 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."categories"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t7 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."counterparties"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t8 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."cost_centers"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t9 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("startDate")::bigint AS "startDate_n",
           MIN("startDate")::text AS "startDate_min",
           MAX("startDate")::text AS "startDate_max",
           COUNT("endDate")::bigint AS "endDate_n",
           MIN("endDate")::text AS "endDate_min",
           MAX("endDate")::text AS "endDate_max",
           COUNT("closedAt")::bigint AS "closedAt_n",
           MIN("closedAt")::text AS "closedAt_min",
           MAX("closedAt")::text AS "closedAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."fiscal_periods"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t10 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("lastSyncAt")::bigint AS "lastSyncAt_n",
           MIN("lastSyncAt")::text AS "lastSyncAt_min",
           MAX("lastSyncAt")::text AS "lastSyncAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."bank_connections"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t11 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("startedAt")::bigint AS "startedAt_n",
           MIN("startedAt")::text AS "startedAt_min",
           MAX("startedAt")::text AS "startedAt_max",
           COUNT("completedAt")::bigint AS "completedAt_n",
           MIN("completedAt")::text AS "completedAt_min",
           MAX("completedAt")::text AS "completedAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max"
    FROM public."bank_sync_runs"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t12 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("date")::bigint AS "date_n",
           MIN("date")::text AS "date_min",
           MAX("date")::text AS "date_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max"
    FROM public."external_bank_movements"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t13 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("issueDate")::bigint AS "issueDate_n",
           MIN("issueDate")::text AS "issueDate_min",
           MAX("issueDate")::text AS "issueDate_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."tax_documents"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t14 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("startedAt")::bigint AS "startedAt_n",
           MIN("startedAt")::text AS "startedAt_min",
           MAX("startedAt")::text AS "startedAt_max",
           COUNT("completedAt")::bigint AS "completedAt_n",
           MIN("completedAt")::text AS "completedAt_min",
           MAX("completedAt")::text AS "completedAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max"
    FROM public."tax_sync_runs"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t15 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("confirmedAt")::bigint AS "confirmedAt_n",
           MIN("confirmedAt")::text AS "confirmedAt_min",
           MAX("confirmedAt")::text AS "confirmedAt_max",
           COUNT("rejectedAt")::bigint AS "rejectedAt_n",
           MIN("rejectedAt")::text AS "rejectedAt_min",
           MAX("rejectedAt")::text AS "rejectedAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."reconciliation_matches"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t16 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("lastSyncAt")::bigint AS "lastSyncAt_n",
           MIN("lastSyncAt")::text AS "lastSyncAt_min",
           MAX("lastSyncAt")::text AS "lastSyncAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."sii_connections"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t17 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."category_rules"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t18 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."company_goals"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t19 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("dismissedAt")::bigint AS "dismissedAt_n",
           MIN("dismissedAt")::text AS "dismissedAt_min",
           MAX("dismissedAt")::text AS "dismissedAt_max",
           COUNT("resolvedAt")::bigint AS "resolvedAt_n",
           MIN("resolvedAt")::text AS "resolvedAt_min",
           MAX("resolvedAt")::text AS "resolvedAt_max",
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."alerts"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t20 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."alert_thresholds"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
t21 AS (
    SELECT CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
           CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
           COUNT(*)::bigint AS filas,
           COUNT("createdAt")::bigint AS "createdAt_n",
           MIN("createdAt")::text AS "createdAt_min",
           MAX("createdAt")::text AS "createdAt_max",
           COUNT("updatedAt")::bigint AS "updatedAt_n",
           MIN("updatedAt")::text AS "updatedAt_min",
           MAX("updatedAt")::text AS "updatedAt_max"
    FROM public."company_settings"
    GROUP BY GROUPING SETS ((), ("companyId"))
),
tax_anios AS (
    SELECT td."companyId" AS company_id, td.type::text AS tipo, td.direction::text AS direccion,
           td.status::text AS estado, EXTRACT(YEAR FROM td."issueDate")::integer AS anio_emision,
           fp.year AS anio_periodo,
           CASE WHEN td."totalAmount" < 0 THEN '<0' WHEN td."totalAmount" = 0 THEN '=0' ELSE '>0' END AS signo
    FROM public.tax_documents td
    LEFT JOIN public.fiscal_periods fp ON fp.id = td."fiscalPeriodId" AND fp."companyId" = td."companyId"
),
movement_anios AS (
    SELECT m."companyId" AS company_id, m.status::text AS estado, m.source::text AS fuente,
           EXTRACT(YEAR FROM m.date)::integer AS anio_movimiento, fp.year AS anio_periodo
    FROM public.movements m
    LEFT JOIN public.fiscal_periods fp ON fp.id = m."fiscalPeriodId" AND fp."companyId" = m."companyId"
),
periodos AS (
    SELECT "companyId" AS company_id, year AS anio, status::text AS estado
    FROM public.fiscal_periods
),
audit_finance AS (
    SELECT a."tableName"::text AS tabla, a."operation"::text AS accion,
           a."tenantId"::text AS company_id, a."createdAt" AS fecha
    FROM public.audit_logs a
    INNER JOIN finance_tables f ON f.tabla = a."tableName"
    WHERE a."operation" IN ('INSERT', 'UPDATE', 'DELETE')
),
ventanas(dias) AS (VALUES (90), (365)),
acciones(accion) AS (VALUES ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)),
audit_ventanas AS (
    SELECT a.*, v.dias
    FROM audit_finance a CROSS JOIN ventanas v CROSS JOIN reloj r
    WHERE a.fecha >= r.referencia - v.dias * INTERVAL '1 day'
      AND a.fecha <= r.referencia
)
SELECT 'INVENTARIO'::text AS seccion,
       'movements'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t0 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('date'::text, a."date_n", a."date_min", a."date_max"),
    ('confirmedAt'::text, a."confirmedAt_n", a."confirmedAt_min", a."confirmedAt_max"),
    ('cancelledAt'::text, a."cancelledAt_n", a."cancelledAt_min", a."cancelledAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."movements"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."movements"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'source'::text AS dimension,
       COALESCE("source"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."movements"
GROUP BY GROUPING SETS (("source"), ("companyId", "source"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."movements"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'import_logs'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t1 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'import_logs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'entityType'::text AS dimension,
       COALESCE("entityType"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."import_logs"
GROUP BY GROUPING SETS (("entityType"), ("companyId", "entityType"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'import_logs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."import_logs"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'bank_accounts'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t2 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_accounts'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_accounts"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_accounts'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_accounts"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_accounts'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_accounts"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'account_balances'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t3 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'account_balances'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."account_balances"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'commitments'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t4 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('dueDate'::text, a."dueDate_n", a."dueDate_min", a."dueDate_max"),
    ('paidAt'::text, a."paidAt_n", a."paidAt_min", a."paidAt_max"),
    ('autoFulfilledAt'::text, a."autoFulfilledAt_n", a."autoFulfilledAt_min", a."autoFulfilledAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitments'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitments"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitments'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitments"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitments'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitments"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitments'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'sourceType'::text AS dimension,
       COALESCE("sourceType"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitments"
GROUP BY GROUPING SETS (("sourceType"), ("companyId", "sourceType"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitments'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isAutoGenerated'::text AS dimension,
       COALESCE("isAutoGenerated"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitments"
GROUP BY GROUPING SETS (("isAutoGenerated"), ("companyId", "isAutoGenerated"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'commitment_templates'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t5 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitment_templates'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitment_templates"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'commitment_templates'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."commitment_templates"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'categories'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t6 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'categories'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."categories"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'categories'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."categories"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'counterparties'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t7 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'counterparties'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."counterparties"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'counterparties'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."counterparties"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'cost_centers'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t8 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'cost_centers'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."cost_centers"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'fiscal_periods'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t9 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('startDate'::text, a."startDate_n", a."startDate_min", a."startDate_max"),
    ('endDate'::text, a."endDate_n", a."endDate_min", a."endDate_max"),
    ('closedAt'::text, a."closedAt_n", a."closedAt_min", a."closedAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'fiscal_periods'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'year'::text AS dimension,
       COALESCE("year"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."fiscal_periods"
GROUP BY GROUPING SETS (("year"), ("companyId", "year"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'fiscal_periods'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."fiscal_periods"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'bank_connections'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t10 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('lastSyncAt'::text, a."lastSyncAt_n", a."lastSyncAt_min", a."lastSyncAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_connections'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'provider'::text AS dimension,
       COALESCE("provider"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_connections"
GROUP BY GROUPING SETS (("provider"), ("companyId", "provider"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_connections'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_connections"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_connections'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_connections"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'bank_sync_runs'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t11 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('startedAt'::text, a."startedAt_n", a."startedAt_min", a."startedAt_max"),
    ('completedAt'::text, a."completedAt_n", a."completedAt_min", a."completedAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_sync_runs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_sync_runs"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'bank_sync_runs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'provider'::text AS dimension,
       COALESCE("provider"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."bank_sync_runs"
GROUP BY GROUPING SETS (("provider"), ("companyId", "provider"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'external_bank_movements'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t12 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('date'::text, a."date_n", a."date_min", a."date_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'external_bank_movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."external_bank_movements"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'external_bank_movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."external_bank_movements"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'external_bank_movements'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isReconciled'::text AS dimension,
       COALESCE("isReconciled"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."external_bank_movements"
GROUP BY GROUPING SETS (("isReconciled"), ("companyId", "isReconciled"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'tax_documents'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t13 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('issueDate'::text, a."issueDate_n", a."issueDate_min", a."issueDate_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_documents"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'direction'::text AS dimension,
       COALESCE("direction"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_documents"
GROUP BY GROUPING SETS (("direction"), ("companyId", "direction"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'currency'::text AS dimension,
       COALESCE("currency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_documents"
GROUP BY GROUPING SETS (("currency"), ("companyId", "currency"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_documents"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isReconciled'::text AS dimension,
       COALESCE("isReconciled"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_documents"
GROUP BY GROUPING SETS (("isReconciled"), ("companyId", "isReconciled"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'tax_sync_runs'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t14 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('startedAt'::text, a."startedAt_n", a."startedAt_min", a."startedAt_max"),
    ('completedAt'::text, a."completedAt_n", a."completedAt_min", a."completedAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_sync_runs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_sync_runs"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_sync_runs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'provider'::text AS dimension,
       COALESCE("provider"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_sync_runs"
GROUP BY GROUPING SETS (("provider"), ("companyId", "provider"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'tax_sync_runs'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'direction'::text AS dimension,
       COALESCE("direction"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."tax_sync_runs"
GROUP BY GROUPING SETS (("direction"), ("companyId", "direction"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'reconciliation_matches'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t15 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('confirmedAt'::text, a."confirmedAt_n", a."confirmedAt_min", a."confirmedAt_max"),
    ('rejectedAt'::text, a."rejectedAt_n", a."rejectedAt_min", a."rejectedAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'CONCILIACION_ESTADO'::text AS seccion,
       'reconciliation_matches'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."reconciliation_matches"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'reconciliation_matches'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'matchType'::text AS dimension,
       COALESCE("matchType"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."reconciliation_matches"
GROUP BY GROUPING SETS (("matchType"), ("companyId", "matchType"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'sii_connections'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t16 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('lastSyncAt'::text, a."lastSyncAt_n", a."lastSyncAt_min", a."lastSyncAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'sii_connections'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."sii_connections"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'category_rules'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t17 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'category_rules'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'ruleType'::text AS dimension,
       COALESCE("ruleType"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."category_rules"
GROUP BY GROUPING SETS (("ruleType"), ("companyId", "ruleType"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'category_rules'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'movementType'::text AS dimension,
       COALESCE("movementType"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."category_rules"
GROUP BY GROUPING SETS (("movementType"), ("companyId", "movementType"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'category_rules'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'isActive'::text AS dimension,
       COALESCE("isActive"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."category_rules"
GROUP BY GROUPING SETS (("isActive"), ("companyId", "isActive"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'company_goals'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t18 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'company_goals'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'year'::text AS dimension,
       COALESCE("year"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."company_goals"
GROUP BY GROUPING SETS (("year"), ("companyId", "year"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'alerts'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t19 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('dismissedAt'::text, a."dismissedAt_n", a."dismissedAt_min", a."dismissedAt_max"),
    ('resolvedAt'::text, a."resolvedAt_n", a."resolvedAt_min", a."resolvedAt_max"),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'alerts'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'type'::text AS dimension,
       COALESCE("type"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."alerts"
GROUP BY GROUPING SETS (("type"), ("companyId", "type"))
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'alerts'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'status'::text AS dimension,
       COALESCE("status"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."alerts"
GROUP BY GROUPING SETS (("status"), ("companyId", "status"))
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'alert_thresholds'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t20 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'INVENTARIO'::text AS seccion,
       'company_settings'::text AS tabla,
       a.alcance AS alcance,
       a.company_id AS company_id,
       ''::text AS dimension,
       ''::text AS valor,
       f.campo_fecha AS campo_fecha,
       f.filas AS filas,
       f.fecha_min AS fecha_min,
       f.fecha_max AS fecha_max
FROM t21 a
CROSS JOIN LATERAL (VALUES
    (''::text, a.filas, NULL::text, NULL::text),
    ('createdAt'::text, a."createdAt_n", a."createdAt_min", a."createdAt_max"),
    ('updatedAt'::text, a."updatedAt_n", a."updatedAt_min", a."updatedAt_max")
) f(campo_fecha, filas, fecha_min, fecha_max)
UNION ALL
SELECT 'DIMENSIONES'::text AS seccion,
       'company_settings'::text AS tabla,
       CASE WHEN GROUPING("companyId") = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING("companyId") = 1 THEN '' ELSE COALESCE("companyId"::text, '<NULL>') END AS company_id,
       'defaultCurrency'::text AS dimension,
       COALESCE("defaultCurrency"::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM public."company_settings"
GROUP BY GROUPING SETS (("defaultCurrency"), ("companyId", "defaultCurrency"))
UNION ALL
SELECT 'TAX_ANIOS'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'anio_emision/direction/type/status'::text AS dimension,
       COALESCE(anio_emision::text, '<NULL>') || '/' || direccion || '/' || tipo || '/' || estado AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM tax_anios
GROUP BY GROUPING SETS ((anio_emision, direccion, tipo, estado), (company_id, anio_emision, direccion, tipo, estado))
UNION ALL
SELECT 'TAX_ANIOS'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'anio_periodo'::text AS dimension,
       COALESCE(anio_periodo::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM tax_anios
GROUP BY GROUPING SETS ((anio_periodo), (company_id, anio_periodo))
UNION ALL
SELECT 'MOVIMIENTOS_ESTADO_FUENTE'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'status/source'::text AS dimension,
       estado || '/' || fuente AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM movement_anios
GROUP BY GROUPING SETS ((estado, fuente), (company_id, estado, fuente))
UNION ALL
SELECT 'MOVIMIENTOS_CONCILIADOS_ANIO'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'anio_movimiento'::text AS dimension,
       COALESCE(anio_movimiento::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM movement_anios
WHERE estado = 'RECONCILED'
GROUP BY GROUPING SETS ((anio_movimiento), (company_id, anio_movimiento))
UNION ALL
SELECT 'MOVIMIENTOS_CONCILIADOS_ANIO'::text AS seccion,
       'movements'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'anio_periodo'::text AS dimension,
       COALESCE(anio_periodo::text, '<NULL>') AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM movement_anios
WHERE estado = 'RECONCILED'
GROUP BY GROUPING SETS ((anio_periodo), (company_id, anio_periodo))
UNION ALL
SELECT 'NOTAS_SIGNO'::text AS seccion,
       'tax_documents'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'type/direction/anio_emision/signo_totalAmount'::text AS dimension,
       tipo || '/' || direccion || '/' || COALESCE(anio_emision::text, '<NULL>') || '/' || signo AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM tax_anios
WHERE tipo IN ('NOTA_CREDITO', 'NOTA_DEBITO')
GROUP BY GROUPING SETS ((tipo, direccion, anio_emision, signo), (company_id, tipo, direccion, anio_emision, signo))
UNION ALL
SELECT 'PERIODOS_ANIO_ESTADO'::text AS seccion,
       'fiscal_periods'::text AS tabla,
       CASE WHEN GROUPING(company_id) = 1 THEN 'TOTAL' ELSE 'EMPRESA' END::text AS alcance,
       CASE WHEN GROUPING(company_id) = 1 THEN '' ELSE COALESCE(company_id::text, '<NULL>') END AS company_id,
       'year/status'::text AS dimension,
       anio::text || '/' || estado AS valor,
       ''::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       NULL::text AS fecha_max
FROM periodos
GROUP BY GROUPING SETS ((anio, estado), (company_id, anio, estado))
UNION ALL
SELECT 'USO'::text AS seccion,
       f.tabla AS tabla,
       'TOTAL'::text AS alcance,
       ''::text AS company_id,
       'ventana_dias/accion'::text AS dimension,
       v.dias::text || '/' || ac.accion AS valor,
       'createdAt'::text AS campo_fecha,
       COUNT(a.fecha)::bigint AS filas,
       MIN(a.fecha)::text AS fecha_min,
       MAX(a.fecha)::text AS fecha_max
FROM finance_tables f CROSS JOIN ventanas v CROSS JOIN acciones ac
LEFT JOIN audit_ventanas a ON a.tabla = f.tabla AND a.dias = v.dias AND a.accion = ac.accion
GROUP BY f.tabla, v.dias, ac.accion
UNION ALL
SELECT 'USO'::text AS seccion,
       a.tabla AS tabla,
       'EMPRESA'::text AS alcance,
       COALESCE(a.company_id, '<SIN_CONTEXTO>') AS company_id,
       'ventana_dias/accion'::text AS dimension,
       a.dias::text || '/' || a.accion AS valor,
       'createdAt'::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       MIN(a.fecha)::text AS fecha_min,
       MAX(a.fecha)::text AS fecha_max
FROM audit_ventanas a
GROUP BY a.tabla, a.company_id, a.dias, a.accion
UNION ALL
SELECT 'USO'::text AS seccion,
       f.tabla AS tabla,
       'TOTAL'::text AS alcance,
       ''::text AS company_id,
       'ultima_escritura'::text AS dimension,
       'historial_disponible'::text AS valor,
       'createdAt'::text AS campo_fecha,
       COUNT(a.fecha)::bigint AS filas,
       NULL::text AS fecha_min,
       MAX(a.fecha)::text AS fecha_max
FROM finance_tables f
LEFT JOIN audit_finance a ON a.tabla = f.tabla
GROUP BY f.tabla
UNION ALL
SELECT 'USO'::text AS seccion,
       a.tabla AS tabla,
       'EMPRESA'::text AS alcance,
       COALESCE(a.company_id, '<SIN_CONTEXTO>') AS company_id,
       'ultima_escritura'::text AS dimension,
       'historial_disponible'::text AS valor,
       'createdAt'::text AS campo_fecha,
       COUNT(*)::bigint AS filas,
       NULL::text AS fecha_min,
       MAX(a.fecha)::text AS fecha_max
FROM audit_finance a
GROUP BY a.tabla, a.company_id
ORDER BY seccion, tabla, alcance, company_id, dimension, valor, campo_fecha, filas, fecha_min, fecha_max;
