-- GO-001 — Organizational to-dos; actor UUIDs intentionally have no user FK.
CREATE TYPE "TodoStatus" AS ENUM ('PENDING', 'DONE');
CREATE TYPE "TodoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "todos" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TodoStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "TodoPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" DATE,
    "assigneeId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "todos_companyId_idx" ON "todos"("companyId");
CREATE INDEX "todos_companyId_assigneeId_status_idx" ON "todos"("companyId", "assigneeId", "status");
CREATE INDEX "todos_companyId_dueDate_idx" ON "todos"("companyId", "dueDate");

-- Same isolation expression as enterprise_isolation (COM-018).
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY todo_isolation ON todos
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON todos TO app_user;

CREATE TRIGGER audit_todos
  AFTER INSERT OR UPDATE OR DELETE ON todos
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
