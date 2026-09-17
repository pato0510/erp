/* ALERT-001 — proves the alerts handler is gated on BOTH `read Opportunity` AND `read
 * Quote` (one @CheckPolicies lambda): MANAGER/ADMIN/SUPER_ADMIN/ACCOUNTANT pass,
 * ANALYST/VIEWER fail, and an ability with only one of the two subjects fails. */
import { UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { AlertsController } from './alerts.controller';

describe('ALERT-001 AlertsController — gated on read Opportunity AND read Quote', () => {
  const reflector = new Reflector();
  const handlers =
    reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      AlertsController.prototype.getAlerts as never,
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

  it('requires BOTH subjects', () => {
    const only = (subject: string) =>
      ({
        can: (action: string, s: { modelName: string }) =>
          action === 'read' && s.modelName === subject,
      }) as never;
    expect(handlers.every((h) => h(only('Opportunity')))).toBe(false);
    expect(handlers.every((h) => h(only('Quote')))).toBe(false);
  });
});
