/* HR-010 — proves THE SALARY GUARD at the CASL level (finiquito amounts are
 * sensitive): read-type endpoints (estimate/list/get) require read AND update
 * TerminationSimulation (MANAGER/ADMIN/SUPER_ADMIN only); ACCOUNTANT (read-only)
 * and VIEWER/ANALYST are denied. */
import { UserRole } from '@prisma/client';
import {
  CaslAbilityFactory,
  TerminationSimulationSubject,
} from '../../common/casl/casl-ability.factory';

describe('HR-010 salary guard (TerminationSimulationSubject)', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'update') =>
    factory.defineAbilityFor(role).can(action, TerminationSimulationSubject);

  // estimate/list/get = read AND update; persist/anular = update
  const readSide = (r: UserRole) => can(r, 'read') && can(r, 'update');
  const writeSide = (r: UserRole) => can(r, 'update');

  it('MANAGER/ADMIN/SUPER_ADMIN: estimate + list + persist all allowed', () => {
    for (const r of [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(readSide(r)).toBe(true);
      expect(writeSide(r)).toBe(true);
    }
  });

  it('ACCOUNTANT: DENIED finiquito amounts (read-only, no update) — both read-side and write-side 403', () => {
    expect(can(UserRole.ACCOUNTANT, 'read')).toBe(true); // read-only on compensation subjects
    expect(can(UserRole.ACCOUNTANT, 'update')).toBe(false);
    expect(readSide(UserRole.ACCOUNTANT)).toBe(false); // estimate/list/get → 403
    expect(writeSide(UserRole.ACCOUNTANT)).toBe(false); // persist/anular → 403
  });

  it('VIEWER and ANALYST: no access at all', () => {
    for (const r of [UserRole.VIEWER, UserRole.ANALYST]) {
      expect(readSide(r)).toBe(false);
      expect(writeSide(r)).toBe(false);
    }
  });
});
