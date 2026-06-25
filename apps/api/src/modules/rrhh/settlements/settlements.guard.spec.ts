/* HR-009 — proves THE SALARY GUARD at the CASL level (the rule the controller
 * relies on): per-person endpoints require read AND update EmployeeCompensation
 * (MANAGER/ADMIN/SUPER_ADMIN only); the aggregate requires read (ACCOUNTANT too,
 * NOT VIEWER/ANALYST). */
import { UserRole } from '@prisma/client';
import {
  CaslAbilityFactory,
  EmployeeCompensationSubject,
} from '../../common/casl/casl-ability.factory';

describe('HR-009 salary guard (EmployeeCompensationSubject)', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'update') =>
    factory.defineAbilityFor(role).can(action, EmployeeCompensationSubject);

  // per-person = read AND update; aggregate = read
  const perPerson = (r: UserRole) => can(r, 'read') && can(r, 'update');
  const aggregate = (r: UserRole) => can(r, 'read');

  it('MANAGER/ADMIN/SUPER_ADMIN: per-person AND aggregate allowed', () => {
    for (const r of [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(perPerson(r)).toBe(true);
      expect(aggregate(r)).toBe(true);
    }
  });

  it('ACCOUNTANT: aggregate allowed, per-person DENIED (read yes, update no)', () => {
    expect(can(UserRole.ACCOUNTANT, 'read')).toBe(true);
    expect(can(UserRole.ACCOUNTANT, 'update')).toBe(false);
    expect(perPerson(UserRole.ACCOUNTANT)).toBe(false); // → 403 on per-person
    expect(aggregate(UserRole.ACCOUNTANT)).toBe(true); // → 200 on aggregate
  });

  it('VIEWER and ANALYST: NEITHER per-person NOR aggregate', () => {
    for (const r of [UserRole.VIEWER, UserRole.ANALYST]) {
      expect(perPerson(r)).toBe(false);
      expect(aggregate(r)).toBe(false); // → 403 even on the aggregate
    }
  });
});
