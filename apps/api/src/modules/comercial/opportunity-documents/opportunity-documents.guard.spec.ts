/* COM-017 — proves the OpportunityDocument authorization matrix MIRRORS OpportunityNote
 * line for line: READ reaches MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE
 * (create/update/delete) is MANAGER/ADMIN/SUPER_ADMIN only; ANALYST/VIEWER floored.
 * `manage` (the delete-any escape hatch) is ADMIN/SUPER_ADMIN only. Also proves every
 * controller endpoint carries @CheckPolicies with the right action. */
import { UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  CaslAbilityFactory,
  OpportunityDocumentSubject,
  OpportunityNoteSubject,
} from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { OpportunityDocumentsController } from './opportunity-documents.controller';

const ROLES = Object.values(UserRole);
const ACTIONS = ['read', 'create', 'update', 'delete', 'manage'] as const;

describe('COM-017 OpportunityDocument authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: (typeof ACTIONS)[number]) =>
    factory.defineAbilityFor(role).can(action, OpportunityDocumentSubject);

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

  it('MIRRORS OpportunityNoteSubject for every role and action (manage included)', () => {
    for (const role of ROLES) {
      const ability = factory.defineAbilityFor(role);
      for (const action of ACTIONS) {
        expect(ability.can(action, OpportunityDocumentSubject)).toBe(
          ability.can(action, OpportunityNoteSubject),
        );
      }
    }
  });

  it('MANAGE (delete-any escape hatch): ADMIN/SUPER_ADMIN only', () => {
    expect(can(UserRole.SUPER_ADMIN, 'manage')).toBe(true);
    expect(can(UserRole.ADMIN, 'manage')).toBe(true);
    expect(can(UserRole.MANAGER, 'manage')).toBe(false);
    expect(can(UserRole.ACCOUNTANT, 'manage')).toBe(false);
    expect(can(UserRole.ANALYST, 'manage')).toBe(false);
    expect(can(UserRole.VIEWER, 'manage')).toBe(false);
  });
});

describe('COM-017 OpportunityDocumentsController — every endpoint is gated (PoliciesGuard fails open)', () => {
  const reflector = new Reflector();
  const proto = OpportunityDocumentsController.prototype;
  const handlersOf = (method: keyof OpportunityDocumentsController) =>
    reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, proto[method] as never) ?? [];
  const factory = new CaslAbilityFactory();
  const managerAbility = factory.defineAbilityFor(UserRole.MANAGER);
  const accountantAbility = factory.defineAbilityFor(UserRole.ACCOUNTANT);
  const viewerAbility = factory.defineAbilityFor(UserRole.VIEWER);

  it.each([
    ['findAll', 'read'],
    ['create', 'create'],
    ['download', 'read'],
    ['remove', 'delete'],
  ] as const)('%s carries @CheckPolicies(%s OpportunityDocument)', (method, action) => {
    const handlers = handlersOf(method);
    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers.every((h) => h(managerAbility))).toBe(true);
    expect(handlers.every((h) => h(viewerAbility))).toBe(false);
    // ACCOUNTANT passes ONLY the read gates — pins the action each handler checks.
    expect(handlers.every((h) => h(accountantAbility))).toBe(action === 'read');
  });
});
