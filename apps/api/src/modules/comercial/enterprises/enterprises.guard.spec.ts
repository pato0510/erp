/* COM-018 — proves the Enterprise authorization matrix MIRRORS Account role by role:
 * READ reaches MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE (create/update/delete) is
 * MANAGER/ADMIN/SUPER_ADMIN only; ANALYST/VIEWER stay floored (VIEWER has no grant on
 * Account → none here). Also proves every controller endpoint carries @CheckPolicies
 * with the right action. */
import { UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  AccountSubject,
  CaslAbilityFactory,
  EnterpriseSubject,
} from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { EnterprisesController } from './enterprises.controller';

const ROLES = Object.values(UserRole);
const ACTIONS = ['read', 'create', 'update', 'delete', 'manage'] as const;

describe('COM-018 Enterprise authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: (typeof ACTIONS)[number]) =>
    factory.defineAbilityFor(role).can(action, EnterpriseSubject);

  it('READ: SUPER_ADMIN/ADMIN/MANAGER/ACCOUNTANT allowed; ANALYST/VIEWER denied', () => {
    expect(can(UserRole.SUPER_ADMIN, 'read')).toBe(true);
    expect(can(UserRole.ADMIN, 'read')).toBe(true);
    expect(can(UserRole.MANAGER, 'read')).toBe(true);
    expect(can(UserRole.ACCOUNTANT, 'read')).toBe(true);
    expect(can(UserRole.ANALYST, 'read')).toBe(false);
    expect(can(UserRole.VIEWER, 'read')).toBe(false);
  });

  it('WRITE: SUPER_ADMIN/ADMIN/MANAGER allowed; ACCOUNTANT (read-only)/ANALYST/VIEWER denied', () => {
    for (const action of ['create', 'update', 'delete'] as const) {
      expect(can(UserRole.SUPER_ADMIN, action)).toBe(true);
      expect(can(UserRole.ADMIN, action)).toBe(true);
      expect(can(UserRole.MANAGER, action)).toBe(true);
      expect(can(UserRole.ACCOUNTANT, action)).toBe(false);
      expect(can(UserRole.ANALYST, action)).toBe(false);
      expect(can(UserRole.VIEWER, action)).toBe(false);
    }
  });

  it('MIRRORS AccountSubject for every role and action', () => {
    for (const role of ROLES) {
      const ability = factory.defineAbilityFor(role);
      for (const action of ACTIONS) {
        expect(ability.can(action, EnterpriseSubject)).toBe(ability.can(action, AccountSubject));
      }
    }
  });
});

describe('COM-018 EnterprisesController — every endpoint is gated (PoliciesGuard fails open)', () => {
  const reflector = new Reflector();
  const proto = EnterprisesController.prototype;
  const handlersOf = (method: keyof EnterprisesController) =>
    reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, proto[method] as never) ?? [];
  const factory = new CaslAbilityFactory();
  const managerAbility = factory.defineAbilityFor(UserRole.MANAGER);
  const accountantAbility = factory.defineAbilityFor(UserRole.ACCOUNTANT);
  const viewerAbility = factory.defineAbilityFor(UserRole.VIEWER);

  it.each([
    ['findAll', 'read'],
    ['create', 'create'],
    ['update', 'update'],
  ] as const)('%s carries @CheckPolicies(%s Enterprise)', (method, action) => {
    const handlers = handlersOf(method);
    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers.every((h) => h(managerAbility))).toBe(true);
    expect(handlers.every((h) => h(viewerAbility))).toBe(false);
    // ACCOUNTANT passes ONLY the read gate — pins the action each handler checks.
    expect(handlers.every((h) => h(accountantAbility))).toBe(action === 'read');
  });

  it('exposes no delete handler (deactivation is PATCH isActive=false)', () => {
    expect('remove' in proto).toBe(false);
    expect('deactivate' in proto).toBe(false);
  });
});
