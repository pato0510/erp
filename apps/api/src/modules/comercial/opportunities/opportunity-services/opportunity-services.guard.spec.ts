/* COM-006 — the opportunity_services bundle reuses OpportunitySubject (NO new CASL
 * subject, per the RRHH settlements precedent). Proves the bundle authorization
 * matrix: READ (list lines) reaches MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; bundle
 * MUTATIONS (add/edit/remove) gate on `update OpportunitySubject` → MANAGER/ADMIN/
 * SUPER_ADMIN only. ACCOUNTANT reads the bundle but cannot mutate it (write === false);
 * ANALYST/VIEWER stay floored. */
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, OpportunitySubject } from '../../../common/casl/casl-ability.factory';

describe('COM-006 opportunity-services bundle authorization (reuses OpportunitySubject)', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'update') =>
    factory.defineAbilityFor(role).can(action, OpportunitySubject);

  it('READ bundle: SUPER_ADMIN/ADMIN/MANAGER/ACCOUNTANT allowed; ANALYST/VIEWER denied', () => {
    expect(can(UserRole.SUPER_ADMIN, 'read')).toBe(true);
    expect(can(UserRole.ADMIN, 'read')).toBe(true);
    expect(can(UserRole.MANAGER, 'read')).toBe(true);
    expect(can(UserRole.ACCOUNTANT, 'read')).toBe(true);
    expect(can(UserRole.ANALYST, 'read')).toBe(false);
    expect(can(UserRole.VIEWER, 'read')).toBe(false);
  });

  it('MUTATE bundle (add/edit/remove → update): SUPER_ADMIN/ADMIN/MANAGER allowed; ACCOUNTANT/ANALYST/VIEWER denied', () => {
    expect(can(UserRole.SUPER_ADMIN, 'update')).toBe(true);
    expect(can(UserRole.ADMIN, 'update')).toBe(true);
    expect(can(UserRole.MANAGER, 'update')).toBe(true);
    expect(can(UserRole.ACCOUNTANT, 'update')).toBe(false); // reads bundle, cannot mutate
    expect(can(UserRole.ANALYST, 'update')).toBe(false);
    expect(can(UserRole.VIEWER, 'update')).toBe(false);
  });
});
