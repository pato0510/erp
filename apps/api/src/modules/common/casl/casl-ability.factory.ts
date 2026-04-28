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
  | 'revoke';
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
        break;

      case UserRole.ANALYST:
        can('read', 'all');
        can('resubmit', DocumentRecordSubject);
        can('create', AssetExceptionSubject);
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
        break;
    }

    return build();
  }
}
