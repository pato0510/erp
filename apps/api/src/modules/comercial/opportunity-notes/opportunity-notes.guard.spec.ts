/* COM-016 — proves the OpportunityNote authorization matrix MIRRORS Activity one-to-one:
 * READ reaches MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE (create/update/delete)
 * is MANAGER/ADMIN/SUPER_ADMIN only. ANALYST/VIEWER stay floored (VIEWER has no grant
 * on Activity → none here — grant-by-enumeration). ACCOUNTANT write === false is pinned
 * explicitly. `manage` (the author-or-ADMIN delete escape hatch) is ADMIN/SUPER_ADMIN
 * only — pinned so MANAGER can never delete a colleague's note. Also proves every
 * controller endpoint carries @CheckPolicies with the right action. */
import { UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  ActivitySubject,
  CaslAbilityFactory,
  OpportunityNoteSubject,
} from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { OpportunityNotesController } from './opportunity-notes.controller';

const ROLES = Object.values(UserRole);
const ACTIONS = ['read', 'create', 'update', 'delete'] as const;

describe('COM-016 OpportunityNote authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: (typeof ACTIONS)[number] | 'manage') =>
    factory.defineAbilityFor(role).can(action, OpportunityNoteSubject);

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
      expect(can(UserRole.ACCOUNTANT, action)).toBe(false); // read-only thread — no write
      expect(can(UserRole.ANALYST, action)).toBe(false);
      expect(can(UserRole.VIEWER, action)).toBe(false);
    }
  });

  it('MIRRORS ActivitySubject for every role and action', () => {
    for (const role of ROLES) {
      const ability = factory.defineAbilityFor(role);
      for (const action of ACTIONS) {
        expect(ability.can(action, OpportunityNoteSubject)).toBe(
          ability.can(action, ActivitySubject),
        );
      }
    }
  });

  it('MANAGE (delete-any-note escape hatch): ADMIN/SUPER_ADMIN only', () => {
    expect(can(UserRole.SUPER_ADMIN, 'manage')).toBe(true);
    expect(can(UserRole.ADMIN, 'manage')).toBe(true);
    expect(can(UserRole.MANAGER, 'manage')).toBe(false);
    expect(can(UserRole.ACCOUNTANT, 'manage')).toBe(false);
    expect(can(UserRole.ANALYST, 'manage')).toBe(false);
    expect(can(UserRole.VIEWER, 'manage')).toBe(false);
  });
});

describe('COM-016 OpportunityNotesController — every endpoint is gated (PoliciesGuard fails open)', () => {
  const reflector = new Reflector();
  const proto = OpportunityNotesController.prototype;
  const handlersOf = (method: keyof OpportunityNotesController) =>
    reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, proto[method] as never) ?? [];
  const managerAbility = new CaslAbilityFactory().defineAbilityFor(UserRole.MANAGER);
  const accountantAbility = new CaslAbilityFactory().defineAbilityFor(UserRole.ACCOUNTANT);
  const viewerAbility = new CaslAbilityFactory().defineAbilityFor(UserRole.VIEWER);

  it.each([
    ['findAll', 'read'],
    ['create', 'create'],
    ['update', 'update'],
    ['remove', 'delete'],
  ] as const)('%s carries @CheckPolicies(%s OpportunityNote)', (method, action) => {
    const handlers = handlersOf(method);
    expect(handlers.length).toBeGreaterThan(0);
    // MANAGER passes every gate; VIEWER passes none.
    expect(handlers.every((h) => h(managerAbility))).toBe(true);
    expect(handlers.every((h) => h(viewerAbility))).toBe(false);
    // ACCOUNTANT passes ONLY the read gate — pins the action each handler checks.
    expect(handlers.every((h) => h(accountantAbility))).toBe(action === 'read');
  });
});
