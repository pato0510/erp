/* COM-004 — proves the Contact authorization matrix the controller relies on:
 * contacts share the account permission profile. READ reaches MANAGER/ADMIN/
 * SUPER_ADMIN + ACCOUNTANT (read-only portfolio); WRITE (create/update/delete) is
 * MANAGER/ADMIN/SUPER_ADMIN only. ANALYST/VIEWER stay on the COM-001 default-deny
 * floor. ACCOUNTANT write === false is pinned explicitly (read-only guard). */
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, ContactSubject } from '../../common/casl/casl-ability.factory';

describe('COM-004 Contact authorization matrix', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'create' | 'update' | 'delete') =>
    factory.defineAbilityFor(role).can(action, ContactSubject);

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
      expect(can(UserRole.ACCOUNTANT, action)).toBe(false); // read-only portfolio — no write
      expect(can(UserRole.ANALYST, action)).toBe(false);
      expect(can(UserRole.VIEWER, action)).toBe(false);
    }
  });
});
