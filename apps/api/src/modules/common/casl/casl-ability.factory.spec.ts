/* HR-001 + financial-visibility policy — proves the RRHH authorization baseline
 * AND the ACCOUNTANT read-only financial-visibility grant.
 *
 * Business policy (Chile): the ACCOUNTANT handles payroll and company money, so
 * it gets full RRHH financial READ visibility (worker fichas + all compensation
 * subjects) while staying STRICTLY READ-ONLY — it never creates/updates/deletes
 * any RRHH subject. VIEWER/ANALYST remain fully blocked from financial-sensitive
 * RRHH data. Because the per-person sensitive read endpoints now gate on `read`
 * only, VIEWER/ANALYST exclusion hinges on them LACKING read — pinned below. */
import { UserRole } from '@prisma/client';
import {
  AccountSubject,
  ActivitySubject,
  CaslAbilityFactory,
  ContactSubject,
  EmployeeCompensationSubject,
  EmployeeSubject,
  JobPositionSubject,
  OpportunitySubject,
  QuoteSubject,
  SalaryRecordSubject,
  ServiceCatalogSubject,
  TerminationSimulationSubject,
} from './casl-ability.factory';

describe('CaslAbilityFactory — RRHH baseline (HR-001/HR-002)', () => {
  const factory = new CaslAbilityFactory();

  it('lets SUPER_ADMIN/ADMIN/MANAGER read Employee → /api/rrhh/health 200', () => {
    expect(factory.defineAbilityFor(UserRole.SUPER_ADMIN).can('read', EmployeeSubject)).toBe(true);
    expect(factory.defineAbilityFor(UserRole.ADMIN).can('read', EmployeeSubject)).toBe(true);
    expect(factory.defineAbilityFor(UserRole.MANAGER).can('read', EmployeeSubject)).toBe(true);
  });

  it('denies ANALYST/VIEWER read on Employee → 403', () => {
    expect(factory.defineAbilityFor(UserRole.ANALYST).can('read', EmployeeSubject)).toBe(false);
    expect(factory.defineAbilityFor(UserRole.VIEWER).can('read', EmployeeSubject)).toBe(false);
  });

  it('lets MANAGER fully manage RRHH subjects', () => {
    const m = factory.defineAbilityFor(UserRole.MANAGER);
    expect(m.can('create', EmployeeSubject)).toBe(true);
    expect(m.can('update', EmployeeSubject)).toBe(true);
    expect(m.can('delete', EmployeeSubject)).toBe(true);
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

describe('CaslAbilityFactory — ACCOUNTANT financial READ visibility (read-only)', () => {
  const factory = new CaslAbilityFactory();
  const a = factory.defineAbilityFor(UserRole.ACCOUNTANT);

  it('reads worker fichas (Employee) + all compensation subjects', () => {
    expect(a.can('read', EmployeeSubject)).toBe(true); // re-granted for financial visibility
    expect(a.can('read', EmployeeCompensationSubject)).toBe(true);
    expect(a.can('read', SalaryRecordSubject)).toBe(true);
    expect(a.can('read', TerminationSimulationSubject)).toBe(true);
  });

  it('is STRICTLY READ-ONLY — no create/update/delete on any RRHH subject', () => {
    for (const action of ['create', 'update', 'delete'] as const) {
      expect(a.can(action, EmployeeSubject)).toBe(false);
    }
    expect(a.can('update', EmployeeCompensationSubject)).toBe(false);
    expect(a.can('create', EmployeeCompensationSubject)).toBe(false);
    expect(a.can('delete', EmployeeCompensationSubject)).toBe(false);
    expect(a.can('update', TerminationSimulationSubject)).toBe(false);
    expect(a.can('create', TerminationSimulationSubject)).toBe(false);
    expect(a.can('delete', TerminationSimulationSubject)).toBe(false);
  });

  it('stays out of scope on Cargos — no read on JobPosition', () => {
    expect(a.can('read', JobPositionSubject)).toBe(false);
  });
});

describe('CaslAbilityFactory — VIEWER/ANALYST blocked from financial-sensitive RRHH', () => {
  const factory = new CaslAbilityFactory();
  // Per-person gates are now `read`-only, so exclusion hinges on lacking read.
  // Pin read===false on every sensitive subject — ESPECIALLY TerminationSimulation,
  // which previously had no read-isolating assertion (the old gate also required
  // update, masking whether read alone was denied).
  for (const role of [UserRole.VIEWER, UserRole.ANALYST]) {
    it(`${role} cannot read Employee / EmployeeCompensation / SalaryRecord / TerminationSimulation`, () => {
      const ab = factory.defineAbilityFor(role);
      expect(ab.can('read', EmployeeSubject)).toBe(false);
      expect(ab.can('read', EmployeeCompensationSubject)).toBe(false);
      expect(ab.can('read', SalaryRecordSubject)).toBe(false);
      expect(ab.can('read', TerminationSimulationSubject)).toBe(false);
    });
  }
});

describe('HR-003 compensation endpoint gates (post read-only relaxation)', () => {
  const factory = new CaslAbilityFactory();
  const can = (role: UserRole, action: 'read' | 'update') =>
    factory.defineAbilityFor(role).can(action, EmployeeCompensationSubject);
  // GET /:id/compensation now gates on `read` only; PUT /:id/compensation on `update`.
  const canGet = (role: UserRole) => can(role, 'read');
  const canPut = (role: UserRole) => can(role, 'update');

  it('GET (read) allows MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT, denies VIEWER/ANALYST', () => {
    expect(canGet(UserRole.MANAGER)).toBe(true);
    expect(canGet(UserRole.ADMIN)).toBe(true);
    expect(canGet(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canGet(UserRole.ACCOUNTANT)).toBe(true); // read-only financial visibility → 200
    expect(canGet(UserRole.ANALYST)).toBe(false);
    expect(canGet(UserRole.VIEWER)).toBe(false);
  });

  it('PUT (update) stays MANAGER/ADMIN/SUPER_ADMIN only — ACCOUNTANT 403', () => {
    expect(canPut(UserRole.MANAGER)).toBe(true);
    expect(canPut(UserRole.ADMIN)).toBe(true);
    expect(canPut(UserRole.SUPER_ADMIN)).toBe(true);
    expect(canPut(UserRole.ACCOUNTANT)).toBe(false); // read-only — never writes
    expect(canPut(UserRole.ANALYST)).toBe(false);
    expect(canPut(UserRole.VIEWER)).toBe(false);
  });
});

describe('CaslAbilityFactory — Comercial floor (COM-001) + COM-002 catalog + COM-003 accounts', () => {
  const factory = new CaslAbilityFactory();
  const ALL_COMERCIAL = [
    AccountSubject,
    ContactSubject,
    OpportunitySubject,
    ActivitySubject,
    ServiceCatalogSubject,
    QuoteSubject,
  ];
  /* COM-002 re-granted read on ServiceCatalog and COM-003 re-granted read on
     Account (to some roles), so both leave the floor. The remaining FOUR stay
     default-deny until their own tickets. */
  const STILL_FLOORED = [ContactSubject, OpportunitySubject, ActivitySubject, QuoteSubject];
  const nonAdmin = [UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.ANALYST, UserRole.VIEWER];

  it('SUPER_ADMIN and ADMIN read every Comercial subject (via manage all)', () => {
    for (const subject of ALL_COMERCIAL) {
      expect(factory.defineAbilityFor(UserRole.SUPER_ADMIN).can('read', subject)).toBe(true);
      expect(factory.defineAbilityFor(UserRole.ADMIN).can('read', subject)).toBe(true);
    }
  });

  it('MANAGER/ACCOUNTANT/ANALYST/VIEWER read NONE of the still-floored Comercial subjects (COM-002/003 widened only ServiceCatalog + Account)', () => {
    for (const subject of STILL_FLOORED) {
      for (const role of nonAdmin) {
        expect(factory.defineAbilityFor(role).can('read', subject)).toBe(false);
      }
    }
  });

  it('no non-admin role gains create/update/delete on any still-floored Comercial subject', () => {
    for (const subject of STILL_FLOORED) {
      for (const action of ['create', 'update', 'delete'] as const) {
        for (const role of nonAdmin) {
          expect(factory.defineAbilityFor(role).can(action, subject)).toBe(false);
        }
      }
    }
  });
});
