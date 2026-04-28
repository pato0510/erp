-- OPS-026 — Multi-step approval workflow for both external permits
-- (OPS-024) and internal work permits (OPS-025). Backwards-compatible
-- defaults preserve OPS-024/025 single-step behaviour for rows that
-- predate this migration: currentApprovalStep=0, totalApprovalSteps=1,
-- isFullyApproved=false.

CREATE TYPE "ApprovalActionStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SKIPPED'
);

-- Extend permits + work_permits with the chain-tracking columns.
ALTER TABLE "permits"
  ADD COLUMN "currentApprovalStep" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalApprovalSteps"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isFullyApproved"     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "work_permits"
  ADD COLUMN "currentApprovalStep" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalApprovalSteps"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isFullyApproved"     BOOLEAN NOT NULL DEFAULT false;

-- Approval-step templates per permit type.
CREATE TABLE "permit_approval_steps" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "workPermitTypeId" UUID,
    "permitTypeId" UUID,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "requiresSpecificUserId" UUID,
    "mustBeDifferentFromRequester" BOOLEAN NOT NULL DEFAULT true,
    "mustBeDifferentFromPreviousApprovers" BOOLEAN NOT NULL DEFAULT true,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "skipConditionsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,

    CONSTRAINT "permit_approval_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "permit_approval_steps_companyId_workPermitTypeId_stepOrder_idx"
  ON "permit_approval_steps"("companyId", "workPermitTypeId", "stepOrder");
CREATE INDEX "permit_approval_steps_companyId_permitTypeId_stepOrder_idx"
  ON "permit_approval_steps"("companyId", "permitTypeId", "stepOrder");

ALTER TABLE "permit_approval_steps"
  ADD CONSTRAINT "permit_approval_steps_workPermitTypeId_fkey"
  FOREIGN KEY ("workPermitTypeId") REFERENCES "work_permit_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permit_approval_steps"
  ADD CONSTRAINT "permit_approval_steps_permitTypeId_fkey"
  FOREIGN KEY ("permitTypeId") REFERENCES "permit_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one target type — guards against orphaned/ambiguous rows
-- regardless of how the row was inserted.
ALTER TABLE "permit_approval_steps"
  ADD CONSTRAINT "permit_approval_steps_target_one_only"
  CHECK (("workPermitTypeId" IS NOT NULL) <> ("permitTypeId" IS NOT NULL));

-- Per-permit recorded approvals.
CREATE TABLE "permit_approvals" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "workPermitId" UUID,
    "permitId" UUID,
    "approvalStepId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" UUID,
    "rejectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "signatureHash" TEXT,
    "userIp" TEXT,
    "userAgent" TEXT,
    "status" "ApprovalActionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permit_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "permit_approvals_companyId_workPermitId_stepOrder_idx"
  ON "permit_approvals"("companyId", "workPermitId", "stepOrder");
CREATE INDEX "permit_approvals_companyId_permitId_stepOrder_idx"
  ON "permit_approvals"("companyId", "permitId", "stepOrder");
CREATE INDEX "permit_approvals_companyId_status_createdAt_idx"
  ON "permit_approvals"("companyId", "status", "createdAt");

ALTER TABLE "permit_approvals"
  ADD CONSTRAINT "permit_approvals_workPermitId_fkey"
  FOREIGN KEY ("workPermitId") REFERENCES "work_permits"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permit_approvals"
  ADD CONSTRAINT "permit_approvals_permitId_fkey"
  FOREIGN KEY ("permitId") REFERENCES "permits"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "permit_approvals"
  ADD CONSTRAINT "permit_approvals_approvalStepId_fkey"
  FOREIGN KEY ("approvalStepId") REFERENCES "permit_approval_steps"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "permit_approvals"
  ADD CONSTRAINT "permit_approvals_target_one_only"
  CHECK (("workPermitId" IS NOT NULL) <> ("permitId" IS NOT NULL));

-- RLS
ALTER TABLE permit_approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY permit_approval_step_isolation ON permit_approval_steps
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

ALTER TABLE permit_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY permit_approval_isolation ON permit_approvals
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON permit_approval_steps TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON permit_approvals TO app_user;

-- Audit triggers
CREATE TRIGGER audit_permit_approval_steps
  AFTER INSERT OR UPDATE OR DELETE ON permit_approval_steps
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_permit_approvals
  AFTER INSERT OR UPDATE OR DELETE ON permit_approvals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
