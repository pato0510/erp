-- CAL-008 — extend ActivityStatus with EN_EJECUCION, positioned BETWEEN PENDIENTE and HECHA
-- (§2.1). PG16 permits ALTER TYPE ... ADD VALUE inside the migration transaction; the new
-- value is NOT used anywhere in this migration (no UPDATE/INSERT references it) — the migration
-- ADDS AND STOPS. No table changes, no RLS work (nothing new to protect). The Prisma enum is
-- updated to the SAME order so DB order and Prisma order match.
ALTER TYPE "ActivityStatus" ADD VALUE 'EN_EJECUCION' BEFORE 'HECHA';
