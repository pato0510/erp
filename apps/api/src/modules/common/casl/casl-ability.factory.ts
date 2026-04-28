import { AbilityBuilder, createMongoAbility, MongoAbility, InferSubjects } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

type Subjects =
  | InferSubjects<
      | typeof UserSubject
      | typeof CompanySubject
      | typeof TenantSubject
      | typeof MovementSubject
      | typeof ReportSubject
      | typeof CategorySubject
      | typeof CounterpartySubject
      | typeof CostCenterSubject
      | typeof FiscalPeriodSubject
      | typeof OperationalAssetSubject
      | typeof LocationSubject
      | typeof AssetTypeSubject
      | typeof VehicleSubject
      | typeof DocumentTypeSubject
      | typeof DocumentRequirementSubject
      | typeof DocumentRecordSubject
      | typeof AlertRuleSubject
      | typeof AlertSettingsSubject
      | typeof AssetExceptionSubject
      | typeof PermitTypeSubject
      | typeof PermitSubject
      | typeof WorkPermitTypeSubject
      | typeof WorkPermitSubject
      | typeof PermitApprovalStepSubject
      | typeof PermitApprovalSubject
      | typeof ProcedureSubject
      | typeof ProcedureAcknowledgmentSubject
    >
  | 'all';

class UserSubject {
  static readonly modelName = 'User' as const;
}
class CompanySubject {
  static readonly modelName = 'Company' as const;
}
class TenantSubject {
  static readonly modelName = 'Tenant' as const;
}
class MovementSubject {
  static readonly modelName = 'Movement' as const;
}
class ReportSubject {
  static readonly modelName = 'Report' as const;
}
class CategorySubject {
  static readonly modelName = 'Category' as const;
}
class CounterpartySubject {
  static readonly modelName = 'Counterparty' as const;
}
class CostCenterSubject {
  static readonly modelName = 'CostCenter' as const;
}
class FiscalPeriodSubject {
  static readonly modelName = 'FiscalPeriod' as const;
}
class OperationalAssetSubject {
  static readonly modelName = 'OperationalAsset' as const;
}
class LocationSubject {
  static readonly modelName = 'Location' as const;
}
class AssetTypeSubject {
  static readonly modelName = 'AssetType' as const;
}
class VehicleSubject {
  static readonly modelName = 'Vehicle' as const;
}
class DocumentTypeSubject {
  static readonly modelName = 'DocumentType' as const;
}
class DocumentRequirementSubject {
  static readonly modelName = 'DocumentRequirement' as const;
}
class DocumentRecordSubject {
  static readonly modelName = 'DocumentRecord' as const;
}
class AlertRuleSubject {
  static readonly modelName = 'AlertRule' as const;
}
class AlertSettingsSubject {
  static readonly modelName = 'AlertSettings' as const;
}
class AssetExceptionSubject {
  static readonly modelName = 'AssetException' as const;
}
class PermitTypeSubject {
  static readonly modelName = 'PermitType' as const;
}
class PermitSubject {
  static readonly modelName = 'Permit' as const;
}
class WorkPermitTypeSubject {
  static readonly modelName = 'WorkPermitType' as const;
}
class WorkPermitSubject {
  static readonly modelName = 'WorkPermit' as const;
}
class PermitApprovalStepSubject {
  static readonly modelName = 'PermitApprovalStep' as const;
}
class PermitApprovalSubject {
  static readonly modelName = 'PermitApproval' as const;
}
class ProcedureSubject {
  static readonly modelName = 'Procedure' as const;
}
class ProcedureAcknowledgmentSubject {
  static readonly modelName = 'ProcedureAcknowledgment' as const;
}

/* `approve`/`reject`/`resubmit`/`supersede` are document-workflow specific
   actions. They ride on the same CASL action union so the policy decorator
   stays uniform. `manage` continues to imply all of them
   (ADMIN/SUPER_ADMIN). `force-unblock` is OPS-020's ADMIN-only override
   for taking an asset out of BLOCKED_DOCUMENTAL when docs are still
   pending — only `manage` grants it, so the spec's "ADMIN only" holds. */
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'approve'
  | 'reject'
  | 'resubmit'
  | 'supersede'
  | 'force-unblock'
  /* OPS-023 — exception lifecycle. Approve/reject reuse the union
     names but the AssetExceptionSubject scoping makes them distinct
     from the DocumentRecord workflow. `revoke` is exception-only. */
  | 'revoke'
  /* OPS-025 — work permit lifecycle. authorize/reject reuse the verbs
     used by document workflow but the subject scoping isolates them.
     start/suspend/resume/close/cancel are work-permit-specific. */
  | 'authorize'
  | 'start'
  | 'suspend'
  | 'resume'
  | 'close'
  | 'cancel'
  /* OPS-026 — multi-step approval. `skip` is ADMIN-only override
     to bypass an optional/blocked step with prominent audit. */
  | 'skip'
  /* OPS-027 — procedures lifecycle. `publish` is gated to
     ADMIN/MANAGER, `deprecate` to ADMIN. `review` is the
     verb that gates the approve/reject sub-actions on a
     procedure in IN_REVIEW status. */
  | 'publish'
  | 'deprecate'
  | 'review'
  /* OPS-028 — procedure acknowledgments. Any authenticated user
     can acknowledge their own pending readings (the service still
     scopes to userId so they can't ack someone else's). `exempt`
     is ADMIN-only. */
  | 'acknowledge'
  | 'exempt';
export type AppAbility = MongoAbility<[Action, Subjects]>;

export {
  UserSubject,
  CompanySubject,
  TenantSubject,
  MovementSubject,
  ReportSubject,
  CategorySubject,
  CounterpartySubject,
  CostCenterSubject,
  FiscalPeriodSubject,
  OperationalAssetSubject,
  LocationSubject,
  AssetTypeSubject,
  VehicleSubject,
  DocumentTypeSubject,
  DocumentRequirementSubject,
  DocumentRecordSubject,
  AlertRuleSubject,
  AlertSettingsSubject,
  AssetExceptionSubject,
  PermitTypeSubject,
  PermitSubject,
  WorkPermitTypeSubject,
  WorkPermitSubject,
  PermitApprovalStepSubject,
  PermitApprovalSubject,
  ProcedureSubject,
  ProcedureAcknowledgmentSubject,
};

@Injectable()
export class CaslAbilityFactory {
  defineAbilityFor(role: UserRole): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    switch (role) {
      case UserRole.SUPER_ADMIN:
        can('manage', 'all');
        break;

      case UserRole.ADMIN:
        can('manage', 'all');
        break;

      case UserRole.MANAGER:
        can('read', 'all');
        can(['create', 'update'], MovementSubject);
        can(['create', 'update'], ReportSubject);
        can(['create', 'update'], CategorySubject);
        can(['create', 'update'], CounterpartySubject);
        can(['create', 'update'], CostCenterSubject);
        can(['create', 'update'], FiscalPeriodSubject);
        can(['create', 'update'], OperationalAssetSubject);
        can(['create', 'update'], LocationSubject);
        can(['create', 'update'], VehicleSubject);
        can(['create', 'update', 'delete'], DocumentTypeSubject);
        can(['create', 'update', 'delete'], DocumentRequirementSubject);
        /* DocumentRecord delete is ADMIN-only per OPS-014 — APPROVED records
           must be archived, not deleted, so MANAGER-driven workflows go
           through `update`/archive endpoints. Approval/rejection (OPS-015)
           is granted explicitly so MANAGER can clear the review queue. */
        can(
          ['create', 'update', 'approve', 'reject', 'resubmit', 'supersede'],
          DocumentRecordSubject,
        );
        /* OPS-018 — alert config: MANAGER + ADMIN can author rules and
           tweak the singleton settings row. Lower roles only read. */
        can(['create', 'update', 'delete'], AlertRuleSubject);
        can(['update'], AlertSettingsSubject);
        /* OPS-023 — MANAGER can request an exception but cannot
           approve/reject/revoke it. Only ADMIN (via `manage 'all'`)
           gets the lifecycle verbs. */
        can('create', AssetExceptionSubject);
        /* OPS-024 — same shape as documents: MANAGER manages the
           catalog and individual permit rows + workflow actions; only
           ADMIN can outright delete an APPROVED permit (must archive). */
        can(['create', 'update', 'delete'], PermitTypeSubject);
        can(['create', 'update', 'approve', 'reject', 'resubmit', 'supersede'], PermitSubject);
        /* OPS-025 — MANAGER manages the work-permit catalog, can author
           and edit permits, and runs the full lifecycle (authorize, start,
           suspend, resume, close, cancel). Required-role guards are
           layered on top of this in the service. */
        can(['create', 'update', 'delete'], WorkPermitTypeSubject);
        can(
          [
            'create',
            'update',
            'authorize',
            'reject',
            'start',
            'suspend',
            'resume',
            'close',
            'cancel',
          ],
          WorkPermitSubject,
        );
        /* OPS-026 — MANAGER can author approval-chain templates and
           record per-step approvals. `skip` stays ADMIN-only. */
        can(['create', 'update', 'delete'], PermitApprovalStepSubject);
        can(['read', 'approve', 'reject'], PermitApprovalSubject);
        /* OPS-027 — MANAGER authors and publishes procedures.
           `deprecate` stays ADMIN-only via `manage 'all'`. */
        can(['create', 'update', 'review', 'publish'], ProcedureSubject);
        /* OPS-028 — MANAGER reads global ack coverage and can
           acknowledge their own readings. `exempt` stays
           ADMIN-only via `manage 'all'`. */
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        break;

      case UserRole.ACCOUNTANT:
        can('read', 'all');
        can(['create', 'update'], MovementSubject);
        can(['create', 'update'], CategorySubject);
        can(['create', 'update'], CounterpartySubject);
        can(['create', 'update'], CostCenterSubject);
        /* Resubmit is open to any authenticated user — the service layer
           still enforces "only the original uploader". */
        can('resubmit', DocumentRecordSubject);
        /* OPS-023 — request-only exception flow. Approval still
           requires ADMIN. */
        can('create', AssetExceptionSubject);
        /* OPS-025 — anyone authenticated can request a work permit
           (typical workflow: a contractor's supervisor lodges the
           request and waits for MANAGER authorization). */
        can(['create', 'update'], WorkPermitSubject);
        /* OPS-028 — every authenticated user can acknowledge their
           own readings; the service still scopes to userId. */
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        break;

      case UserRole.ANALYST:
        can('read', 'all');
        can('resubmit', DocumentRecordSubject);
        can('create', AssetExceptionSubject);
        can(['create', 'update'], WorkPermitSubject);
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        break;

      case UserRole.VIEWER:
        can('read', ReportSubject);
        can('read', MovementSubject);
        can('read', CategorySubject);
        can('read', CounterpartySubject);
        can('read', CostCenterSubject);
        can('read', FiscalPeriodSubject);
        can('read', OperationalAssetSubject);
        can('read', LocationSubject);
        can('read', AssetTypeSubject);
        can('read', VehicleSubject);
        can('read', DocumentTypeSubject);
        can('read', DocumentRequirementSubject);
        can('read', DocumentRecordSubject);
        can('resubmit', DocumentRecordSubject);
        can('read', AlertRuleSubject);
        can('read', AlertSettingsSubject);
        /* OPS-023 — even VIEWER can request an exception (they often
           are the operator of the blocked asset). Approval gating
           still happens at the ADMIN level. */
        can('read', AssetExceptionSubject);
        can('create', AssetExceptionSubject);
        /* OPS-024 — read-only on permit catalog/rows for VIEWER. */
        can('read', PermitTypeSubject);
        can('read', PermitSubject);
        /* OPS-025 — VIEWER reads but cannot author or move work
           permits through the lifecycle. */
        can('read', WorkPermitTypeSubject);
        can('read', WorkPermitSubject);
        /* OPS-026 — VIEWER can read approval chains/audit but cannot
           record actions. */
        can('read', PermitApprovalStepSubject);
        can('read', PermitApprovalSubject);
        /* OPS-027 — VIEWER reads procedures (the whole point of the
           library) but cannot author/edit/publish. */
        can('read', ProcedureSubject);
        /* OPS-028 — VIEWER can acknowledge their own readings.
           Coverage dashboards stay gated by the service. */
        can(['read', 'acknowledge'], ProcedureAcknowledgmentSubject);
        break;
    }

    return build();
  }
}
