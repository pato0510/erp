/* COM-019 — proves the dashboard handler is gated on BOTH `read Opportunity` AND `read
 * Account` (one @CheckPolicies lambda): MANAGER/ADMIN/SUPER_ADMIN/ACCOUNTANT pass,
 * ANALYST/VIEWER fail, and an ability with read on Opportunity but NOT on Account fails
 * (pins the conjunction). Reflector check like the other guard specs. */
import { UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { DashboardController } from './dashboard.controller';

describe('COM-019 DashboardController — gated on read Opportunity AND read Account', () => {
  const reflector = new Reflector();
  const handlers =
    reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      DashboardController.prototype.getDashboard as never,
    ) ?? [];
  const factory = new CaslAbilityFactory();
  const passes = (role: UserRole) => handlers.every((h) => h(factory.defineAbilityFor(role)));

  it('carries @CheckPolicies', () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  it('SUPER_ADMIN/ADMIN/MANAGER/ACCOUNTANT pass; ANALYST/VIEWER fail', () => {
    expect(passes(UserRole.SUPER_ADMIN)).toBe(true);
    expect(passes(UserRole.ADMIN)).toBe(true);
    expect(passes(UserRole.MANAGER)).toBe(true);
    expect(passes(UserRole.ACCOUNTANT)).toBe(true);
    expect(passes(UserRole.ANALYST)).toBe(false);
    expect(passes(UserRole.VIEWER)).toBe(false);
  });

  it('requires BOTH subjects: read on Opportunity alone (or Account alone) is not enough', () => {
    const only = (subject: string) =>
      ({
        can: (action: string, s: { modelName: string }) =>
          action === 'read' && s.modelName === subject,
      }) as never;
    expect(handlers.every((h) => h(only('Opportunity')))).toBe(false);
    expect(handlers.every((h) => h(only('Account')))).toBe(false);
    const both = {
      can: (action: string, s: { modelName: string }) =>
        action === 'read' && (s.modelName === 'Opportunity' || s.modelName === 'Account'),
    } as never;
    expect(handlers.every((h) => h(both))).toBe(true);
  });
});
