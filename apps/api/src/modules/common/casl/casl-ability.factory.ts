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

export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage';
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
        break;

      case UserRole.ACCOUNTANT:
        can('read', 'all');
        can(['create', 'update'], MovementSubject);
        can(['create', 'update'], CategorySubject);
        can(['create', 'update'], CounterpartySubject);
        can(['create', 'update'], CostCenterSubject);
        break;

      case UserRole.ANALYST:
        can('read', 'all');
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
        break;
    }

    return build();
  }
}
