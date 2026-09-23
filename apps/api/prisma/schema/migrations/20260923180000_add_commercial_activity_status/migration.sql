-- COM-022 — actions extend activities; no new table, so activity_isolation,
-- the app_user GRANT and audit_activities are untouched.
-- CREATE TYPE and its use in the same migration are safe: the in-transaction
-- caveat only applies to ALTER TYPE ... ADD VALUE (CAL-014).
-- Backfill UPDATEs fire audit_activities with a NULL actor: the forensic trail.

CREATE TYPE "CommercialActivityStatus" AS ENUM ('PENDIENTE', 'HECHA');
CREATE TYPE "CommercialActivityEvent" AS ENUM (
  'CREACION', 'CAMBIO_ETAPA', 'PAUSA', 'REANUDACION', 'GANADA', 'PERDIDA',
  'REAPERTURA', 'VALOR_ESTIMADO', 'FECHA_CIERRE', 'PROBABILIDAD', 'LEAD',
  'ACCION_ELIMINADA'
);

ALTER TABLE "activities"
  ADD COLUMN "status" "CommercialActivityStatus",
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "systemEvent" "CommercialActivityEvent";

UPDATE "activities" SET "status" = 'HECHA' WHERE "isSystemGenerated" = false;

UPDATE "activities" SET "systemEvent" = (CASE
    WHEN "subject" = 'Oportunidad creada' THEN 'CREACION'
    WHEN "subject" LIKE 'Etapa: %' THEN 'CAMBIO_ETAPA'
    WHEN "subject" = 'Oportunidad en pausa' THEN 'PAUSA'
    WHEN "subject" LIKE 'Oportunidad reanudada%' THEN 'REANUDACION'
    WHEN "subject" = 'Oportunidad ganada' THEN 'GANADA'
    WHEN "subject" LIKE 'Oportunidad perdida%' THEN 'PERDIDA'
    WHEN "subject" = 'Oportunidad reabierta' THEN 'REAPERTURA'
  END)::"CommercialActivityEvent"
WHERE "isSystemGenerated" = true;

ALTER TABLE "activities" ADD CONSTRAINT "activities_status_origin_check" CHECK (
      ("isSystemGenerated" = true AND "status" IS NULL AND "statusChangedAt" IS NULL)
   OR ("isSystemGenerated" = false AND "status" IS NOT NULL AND "systemEvent" IS NULL)
);
