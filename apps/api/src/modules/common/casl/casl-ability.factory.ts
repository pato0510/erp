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
    >
  | 'all';

// Subject classes for CASL type inference
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

export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage';
export type AppAbility = MongoAbility<[Action, Subjects]>;

export { UserSubject, CompanySubject, TenantSubject, MovementSubject, ReportSubject };

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
        // Cannot delete users or manage company settings
        break;

      case UserRole.ACCOUNTANT:
        can('read', 'all');
        can(['create', 'update'], MovementSubject);
        break;

      case UserRole.ANALYST:
        can('read', 'all');
        break;

      case UserRole.VIEWER:
        can('read', ReportSubject);
        can('read', MovementSubject);
        break;
    }

    return build();
  }
}
