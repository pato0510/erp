/* HR-009 — proves THE SALARY GUARD at the CASL level after the read-only
 * relaxation (the rule the controller relies on):
 *  - per-person READ endpoints (list, get) now require `read` EmployeeCompensation
 *    → MANAGER/ADMIN/SUPER_ADMIN and the read-only ACCOUNTANT pass; VIEWER/ANALYST
 *    lack read → 403;
 *  - WRITE endpoints (create, status, patch, delete) require `update`
 *    EmployeeCompensation → MANAGER/ADMIN/SUPER_ADMIN only; ACCOUNTANT is 403
 *    (strictly read-only — settlements are loaded from an external portal);
 *  - the aggregate requires `read` (ACCOUNTANT too, NOT VIEWER/ANALYST). */
import { UserRole } from '@prisma/client';
import {
  CaslAbilityFactory,
  EmployeeCompensationSubject,
} from '../../common/casl/casl-ability.factory';

describe('HR-009 salary guard (EmployeeCompensationSubject)', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'update') =>
    factory.defineAbilityFor(role).can(action, EmployeeCompensationSubject);

  // post-relaxation: per-person read = read; write = update; aggregate = read
  const perPersonRead = (r: UserRole) => can(r, 'read');
  const write = (r: UserRole) => can(r, 'update');
  const aggregate = (r: UserRole) => can(r, 'read');

  it('MANAGER/ADMIN/SUPER_ADMIN: per-person read, write, and aggregate all allowed', () => {
    for (const r of [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(perPersonRead(r)).toBe(true);
      expect(write(r)).toBe(true);
      expect(aggregate(r)).toBe(true);
    }
  });

  it('ACCOUNTANT: per-person read + aggregate allowed, WRITE denied (read-only)', () => {
    expect(perPersonRead(UserRole.ACCOUNTANT)).toBe(true); // → 200 on relaxed per-person reads
    expect(aggregate(UserRole.ACCOUNTANT)).toBe(true); // → 200 on aggregate
    expect(write(UserRole.ACCOUNTANT)).toBe(false); // → 403 on every settlement write
  });

  it('VIEWER and ANALYST: NEITHER read NOR write (403 on every settlement route)', () => {
    for (const r of [UserRole.VIEWER, UserRole.ANALYST]) {
      expect(perPersonRead(r)).toBe(false); // → 403 even on the relaxed per-person reads
      expect(write(r)).toBe(false);
      expect(aggregate(r)).toBe(false);
    }
  });
});
