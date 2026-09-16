import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';
import { CaslAbilityFactory, MovementSubject } from '../common/casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../common/decorators/check-policies.decorator';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';

describe('FIN-A TaxController backfill authorization', () => {
  const reflector = new Reflector();
  const factory = new CaslAbilityFactory();
  const proto = TaxController.prototype;
  const handlersOf = (method: 'sync' | 'syncAll' | 'backfillCounterpartyGiro') =>
    reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, proto[method]) ?? [];

  it('registers JWT and policy guards and exposes the POST route', () => {
    expect(reflector.get(GUARDS_METADATA, TaxController)).toEqual([JwtAuthGuard, PoliciesGuard]);
    expect(reflector.get(PATH_METADATA, TaxController)).toBe('tax');
    expect(reflector.get(PATH_METADATA, proto.backfillCounterpartyGiro)).toBe(
      'counterparty-giro/backfill',
    );
    expect(reflector.get(METHOD_METADATA, proto.backfillCounterpartyGiro)).toBe(RequestMethod.POST);
  });

  it.each(['sync', 'syncAll', 'backfillCounterpartyGiro'] as const)(
    '%s carries the same update Movement gate for every role',
    (method) => {
      const handlers = handlersOf(method);
      expect(handlers.length).toBeGreaterThan(0);
      for (const role of Object.values(UserRole)) {
        const ability = factory.defineAbilityFor(role);
        const expected = ability.can('update', MovementSubject);
        const can = jest.spyOn(ability, 'can');
        expect(handlers.every((handler) => handler(ability))).toBe(expected);
        expect(can).toHaveBeenCalledWith('update', MovementSubject);
        expect(handlersOf('sync').every((handler) => handler(ability))).toBe(expected);
      }
    },
  );

  it('passes the authenticated company/user scope and returns the updated count', async () => {
    const tax = { backfillCounterpartyGiro: jest.fn().mockResolvedValue(3) };
    const controller = new TaxController(tax as unknown as TaxService);
    expect(await controller.backfillCounterpartyGiro('company', { id: 'user' })).toEqual({
      updated: 3,
    });
    expect(tax.backfillCounterpartyGiro).toHaveBeenCalledWith('company', 'user');
  });
});
