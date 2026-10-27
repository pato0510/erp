/* ACCESS-001 (A1) — the three Finanzas reports gate on `read Report && read Movement`;
 * the ten Operaciones reports keep `read Report`. A FINANZAS-restricted MANAGER fails the
 * Finanzas gates and passes every Operaciones gate; unrestricted roles keep today's results. */
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccessModule, UserRole } from '@prisma/client';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../common/decorators/check-policies.decorator';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { ReportsController } from './reports.controller';
import { OperationsReportsController } from '../operations/reports/operations-reports.controller';

const reflector = new Reflector();
const factory = new CaslAbilityFactory();
const finance = ReportsController.prototype;
const ops = OperationsReportsController.prototype;
const FINANCE_HANDLERS = [
  finance.exportMovements,
  finance.exportCashflow,
  finance.getExecutiveSummary,
];
const OPS_HANDLERS = [
  ops.exportAssetCompliance,
  ops.exportActivity,
  ops.exportAcknowledgmentCoverage,
  ops.exportAlertsHistory,
  ops.exportWorkPermits,
  ops.previewAssetCompliance,
  ops.previewActivity,
  ops.previewAcknowledgmentCoverage,
  ops.previewAlertsHistory,
  ops.previewWorkPermits,
];

function passes(handler: object, role: UserRole, modules: AccessModule[] = []) {
  const policies = reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, handler);
  expect(policies.length).toBeGreaterThan(0);
  const ability = factory.defineAbilityFor(role, modules);
  return policies.every((p) => p(ability));
}

describe('ACCESS-001 — Finanzas vs Operaciones report gates', () => {
  it('both controllers keep JWT + PoliciesGuard', () => {
    expect(reflector.get(GUARDS_METADATA, ReportsController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    expect(reflector.get(GUARDS_METADATA, OperationsReportsController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
  });

  it.each(Object.values(UserRole))('%s unrestricted: every report gate passes (today)', (role) => {
    for (const h of [...FINANCE_HANDLERS, ...OPS_HANDLERS]) expect(passes(h, role)).toBe(true);
  });

  it('a FINANZAS-restricted MANAGER fails the three Finanzas gates and passes all ten Operaciones gates', () => {
    for (const h of FINANCE_HANDLERS)
      expect(passes(h, UserRole.MANAGER, [AccessModule.FINANZAS])).toBe(false);
    for (const h of OPS_HANDLERS)
      expect(passes(h, UserRole.MANAGER, [AccessModule.FINANZAS])).toBe(true);
  });

  it('an RRHH-restricted MANAGER keeps every report gate', () => {
    for (const h of [...FINANCE_HANDLERS, ...OPS_HANDLERS])
      expect(passes(h, UserRole.MANAGER, [AccessModule.RRHH])).toBe(true);
  });
});
