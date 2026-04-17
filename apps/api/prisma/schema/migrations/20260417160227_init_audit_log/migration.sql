-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tableName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "oldData" JSONB,
    "newData" JSONB,
    "userId" UUID,
    "tenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
