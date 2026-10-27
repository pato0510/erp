/* ACCESS-001 (2026-10-27) — per-membership module access on top of the role.
 * Pins: [FINANZAS] denies every action on every Finanzas subject, [RRHH] the same on
 * every RRHH subject, both only for restrictable roles; every OTHER subject keeps the
 * role's answer; and an empty list is byte-identical to today's rules for all six roles. */
import { AccessModule, UserRole } from '@prisma/client';
import * as casl from './casl-ability.factory';
import {
  AppAbility,
  CaslAbilityFactory,
  CommitmentTemplateSubject,
  FINANZAS_SUBJECTS,
  MODULE_SUBJECTS,
  MovementSubject,
  OperationsDashboardSubject,
  OpportunitySubject,
  QuoteSubject,
  ReportSubject,
  ServiceOrderSubject,
} from './casl-ability.factory';

type SubjectType = Parameters<AppAbility['can']>[1];
const ACTIONS = ['read', 'create', 'update', 'delete', 'manage'] as const;
const RESTRICTABLE = [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.ANALYST, UserRole.VIEWER];
/* Every exported *Subject class (the factory exports them all by name). */
const ALL_SUBJECTS = Object.values(casl).filter(
  (v) => typeof v === 'function' && 'modelName' in v,
) as unknown as SubjectType[];

describe('ACCESS-001 — module blocks after the role rules', () => {
  const factory = new CaslAbilityFactory();

  it('declares the signed subject sets (Report stays OUT of Finanzas)', () => {
    expect(ALL_SUBJECTS.length).toBeGreaterThan(60);
    expect(FINANZAS_SUBJECTS.map((s) => s.modelName)).toEqual([
      'Movement',
      'Category',
      'Counterparty',
      'CostCenter',
      'FiscalPeriod',
    ]);
    expect(MODULE_SUBJECTS.FINANZAS).toBe(FINANZAS_SUBJECTS);
    expect(MODULE_SUBJECTS.RRHH.map((s) => s.modelName)).toEqual([
      'Employee',
      'EmployeeContract',
      'EmployeeDocument',
      'Certification',
      'Availability',
      'VacationRequest',
      'LeaveRequest',
      'MedicalLeave',
      'SalaryRecord',
      'TerminationSimulation',
      'PayrollParameter',
      'EmployeeCompensation',
      'JobPosition',
    ]);
    expect(FINANZAS_SUBJECTS).not.toContain(ReportSubject);
  });

  it.each(Object.values(UserRole))('%s: [] equals the role rules (default parameter)', (role) => {
    const plain = factory.defineAbilityFor(role);
    const empty = factory.defineAbilityFor(role, []);
    expect(empty.rules).toEqual(plain.rules);
  });

  describe.each(Object.values(AccessModule))('[%s]', (module) => {
    const blocked = MODULE_SUBJECTS[module] as readonly SubjectType[];
    const others = ALL_SUBJECTS.filter((s) => !blocked.includes(s));

    it.each(RESTRICTABLE)(
      '%s: denies read/create/update/delete on every blocked subject',
      (role) => {
        const ability = factory.defineAbilityFor(role, [module]);
        for (const subject of blocked)
          for (const action of ACTIONS) expect(ability.can(action, subject)).toBe(false);
      },
    );

    it.each(RESTRICTABLE)('%s: every other subject keeps the role answer', (role) => {
      const base = factory.defineAbilityFor(role);
      const ability = factory.defineAbilityFor(role, [module]);
      for (const subject of others)
        for (const action of ACTIONS)
          expect(ability.can(action, subject)).toBe(base.can(action, subject));
    });
  });

  it('[FINANZAS, RRHH] together block both sets and nothing else (MANAGER)', () => {
    const base = factory.defineAbilityFor(UserRole.MANAGER);
    const ability = factory.defineAbilityFor(UserRole.MANAGER, [
      AccessModule.FINANZAS,
      AccessModule.RRHH,
    ]);
    const blocked = [
      ...MODULE_SUBJECTS.FINANZAS,
      ...MODULE_SUBJECTS.RRHH,
    ] as readonly SubjectType[];
    for (const subject of ALL_SUBJECTS) {
      for (const action of ACTIONS) {
        const expected = blocked.includes(subject) ? false : base.can(action, subject);
        expect(ability.can(action, subject)).toBe(expected);
      }
    }
  });

  it('a FINANZAS-restricted MANAGER keeps the bridge subjects named in the ticket', () => {
    const ability = factory.defineAbilityFor(UserRole.MANAGER, [AccessModule.FINANZAS]);
    expect(ability.can('read', MovementSubject)).toBe(false);
    expect(ability.can('read', ReportSubject)).toBe(true);
    expect(ability.can('manage', CommitmentTemplateSubject)).toBe(true);
    expect(ability.can('update', ServiceOrderSubject)).toBe(true);
    expect(ability.can('read', QuoteSubject)).toBe(true);
    expect(ability.can('read', OpportunitySubject)).toBe(true);
    expect(ability.can('read', OperationsDashboardSubject)).toBe(true);
  });

  it('the factory applies the list even to admin roles (the service layer forbids storing it)', () => {
    const ability = factory.defineAbilityFor(UserRole.ADMIN, [AccessModule.FINANZAS]);
    expect(ability.can('manage', MovementSubject)).toBe(false);
    expect(ability.can('manage', 'all')).toBe(true);
  });
});
