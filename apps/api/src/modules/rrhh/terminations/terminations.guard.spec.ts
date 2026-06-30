/* HR-010 — proves THE SALARY GUARD for finiquitos at the CASL level after the
 * read-only relaxation (finiquito amounts are sensitive):
 *  - READ endpoints (estimate/list/get) require `read` TerminationSimulation →
 *    MANAGER/ADMIN/SUPER_ADMIN and the read-only ACCOUNTANT pass; VIEWER/ANALYST
 *    lack read → 403;
 *  - WRITE endpoints (create/anular) require `update` TerminationSimulation →
 *    MANAGER/ADMIN/SUPER_ADMIN only; ACCOUNTANT is 403 (strictly read-only).
 * /estimate is ephemeral (persists nothing) and is therefore gated as a read. */
import { UserRole } from '@prisma/client';
import {
  CaslAbilityFactory,
  TerminationSimulationSubject,
} from '../../common/casl/casl-ability.factory';

describe('HR-010 salary guard (TerminationSimulationSubject)', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'update') =>
    factory.defineAbilityFor(role).can(action, TerminationSimulationSubject);

  // post-relaxation: estimate/list/get = read; persist/anular = update
  const readSide = (r: UserRole) => can(r, 'read');
  const writeSide = (r: UserRole) => can(r, 'update');

  it('MANAGER/ADMIN/SUPER_ADMIN: estimate/list/get AND persist/anular all allowed', () => {
    for (const r of [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(readSide(r)).toBe(true);
      expect(writeSide(r)).toBe(true);
    }
  });

  it('ACCOUNTANT: read-side allowed (estimate/list/get → 200), write-side denied (persist/anular → 403)', () => {
    expect(can(UserRole.ACCOUNTANT, 'read')).toBe(true); // read-only on compensation subjects
    expect(can(UserRole.ACCOUNTANT, 'update')).toBe(false);
    expect(readSide(UserRole.ACCOUNTANT)).toBe(true); // estimate/list/get → 200
    expect(writeSide(UserRole.ACCOUNTANT)).toBe(false); // persist/anular → 403
  });

  it('VIEWER and ANALYST: no access at all (read-side and write-side 403)', () => {
    for (const r of [UserRole.VIEWER, UserRole.ANALYST]) {
      expect(readSide(r)).toBe(false); // → 403 even on the relaxed read endpoints
      expect(writeSide(r)).toBe(false);
    }
  });
});
