/* COM-012 — proves the availability projection's gate is the EXISTING read
 * AvailabilitySubject ability (no new subject, no role strings). Audience = the RRHH
 * §1.2 availability matrix: MANAGER/ADMIN/SUPER_ADMIN allowed; ACCOUNTANT/ANALYST/VIEWER
 * denied. ACCOUNTANT false is pinned explicitly — a deliberate exclusion (unlike the
 * Comercial financial subjects, ACCOUNTANT does NOT get availability). */
import { UserRole } from '@prisma/client';
import { AvailabilitySubject, CaslAbilityFactory } from '../common/casl/casl-ability.factory';

describe('COM-012 available-staff gate — read AvailabilitySubject', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole) => factory.defineAbilityFor(role).can('read', AvailabilitySubject);

  it('MANAGER / ADMIN / SUPER_ADMIN are allowed', () => {
    expect(can(UserRole.SUPER_ADMIN)).toBe(true);
    expect(can(UserRole.ADMIN)).toBe(true);
    expect(can(UserRole.MANAGER)).toBe(true);
  });

  it('ACCOUNTANT / ANALYST / VIEWER are denied (ACCOUNTANT excluded deliberately)', () => {
    expect(can(UserRole.ACCOUNTANT)).toBe(false); // deliberate exclusion — health-adjacent audience
    expect(can(UserRole.ANALYST)).toBe(false);
    expect(can(UserRole.VIEWER)).toBe(false);
  });
});
