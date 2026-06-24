/* HR-001 — proves the RRHH authorization baseline that GET /api/rrhh/health
 * relies on. The health endpoint's @CheckPolicies handler evaluates exactly
 * `ability.can('read', EmployeeSubject)`, so these assertions are a 1:1 proof
 * of the 200-for-MANAGER/ADMIN, 403-for-VIEWER acceptance criterion. */
import { UserRole } from '@prisma/client';
import {
  CaslAbilityFactory,
  EmployeeSubject,
  JobPositionSubject,
  SalaryRecordSubject,
} from './casl-ability.factory';

describe('CaslAbilityFactory — RRHH baseline (HR-001)', () => {
  const factory = new CaslAbilityFactory();

  it('lets SUPER_ADMIN/ADMIN/MANAGER read Employee → /api/rrhh/health 200', () => {
    expect(factory.defineAbilityFor(UserRole.SUPER_ADMIN).can('read', EmployeeSubject)).toBe(true);
    expect(factory.defineAbilityFor(UserRole.ADMIN).can('read', EmployeeSubject)).toBe(true);
    expect(factory.defineAbilityFor(UserRole.MANAGER).can('read', EmployeeSubject)).toBe(true);
  });

  it('denies ACCOUNTANT/ANALYST/VIEWER read on Employee → /api/rrhh/health 403', () => {
    expect(factory.defineAbilityFor(UserRole.ACCOUNTANT).can('read', EmployeeSubject)).toBe(false);
    expect(factory.defineAbilityFor(UserRole.ANALYST).can('read', EmployeeSubject)).toBe(false);
    expect(factory.defineAbilityFor(UserRole.VIEWER).can('read', EmployeeSubject)).toBe(false);
  });

  it('lets MANAGER fully manage RRHH subjects', () => {
    const m = factory.defineAbilityFor(UserRole.MANAGER);
    expect(m.can('create', EmployeeSubject)).toBe(true);
    expect(m.can('update', EmployeeSubject)).toBe(true);
    expect(m.can('delete', EmployeeSubject)).toBe(true);
  });

  it('lets ACCOUNTANT read ONLY compensation subjects, not general RRHH data', () => {
    const a = factory.defineAbilityFor(UserRole.ACCOUNTANT);
    expect(a.can('read', SalaryRecordSubject)).toBe(true); // re-granted after revoke
    expect(a.can('read', EmployeeSubject)).toBe(false); // blanket read-all revoked
    expect(a.can('update', SalaryRecordSubject)).toBe(false); // read-only
  });

  it('HR-002 — MANAGER/ADMIN manage JobPosition; ACCOUNTANT/ANALYST/VIEWER get 403', () => {
    const m = factory.defineAbilityFor(UserRole.MANAGER);
    expect(m.can('read', JobPositionSubject)).toBe(true);
    expect(m.can('create', JobPositionSubject)).toBe(true);
    expect(m.can('update', JobPositionSubject)).toBe(true);
    expect(m.can('delete', JobPositionSubject)).toBe(true);
    expect(factory.defineAbilityFor(UserRole.ADMIN).can('manage', JobPositionSubject)).toBe(true);
    expect(factory.defineAbilityFor(UserRole.ACCOUNTANT).can('read', JobPositionSubject)).toBe(
      false,
    );
    expect(factory.defineAbilityFor(UserRole.ANALYST).can('read', JobPositionSubject)).toBe(false);
    expect(factory.defineAbilityFor(UserRole.VIEWER).can('read', JobPositionSubject)).toBe(false);
  });
});
