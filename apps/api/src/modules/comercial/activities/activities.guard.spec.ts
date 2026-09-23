/* COM-008 — proves the Activity authorization matrix (same shape as Opportunity):
 * READ reaches MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE (create/update/delete)
 * is MANAGER/ADMIN/SUPER_ADMIN only. ANALYST/VIEWER stay floored. ACCOUNTANT
 * write === false is pinned explicitly (read-only timeline visibility). */
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, ActivitySubject } from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { ActivitiesController } from './activities.controller';

describe('COM-008 Activity authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'create' | 'update' | 'delete') =>
    factory.defineAbilityFor(role).can(action, ActivitySubject);

  it('COM-022 status endpoint declares the update Activity policy for every role', () => {
    const handlers = Reflect.getMetadata(
      CHECK_POLICIES_KEY,
      ActivitiesController.prototype.updateStatus,
    ) as PolicyHandler[];
    expect(handlers).toHaveLength(1);
    for (const role of Object.values(UserRole)) {
      expect(handlers[0](factory.defineAbilityFor(role))).toBe(can(role, 'update'));
    }
  });

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
      expect(can(UserRole.ACCOUNTANT, action)).toBe(false); // read-only timeline — no write
      expect(can(UserRole.ANALYST, action)).toBe(false);
      expect(can(UserRole.VIEWER, action)).toBe(false);
    }
  });
});
