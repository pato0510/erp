-- GO-003 — PostgreSQL 18 permits ADD VALUE in a transaction; the new values
-- are not used as data until after commit. Existing rows remain untouched.
-- No new table: todos already has RLS, app_user GRANTs and audit_todos.
ALTER TYPE "TodoStatus" ADD VALUE 'IN_PROGRESS' AFTER 'PENDING';
ALTER TYPE "TodoStatus" ADD VALUE 'IN_REVIEW' AFTER 'IN_PROGRESS';
ALTER TYPE "TodoStatus" ADD VALUE 'BLOCKED' AFTER 'IN_REVIEW';
