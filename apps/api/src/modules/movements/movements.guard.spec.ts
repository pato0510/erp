import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, MovementSubject } from '../common/casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../common/decorators/check-policies.decorator';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { MovementsController } from './movements.controller';
import { MovementRecategorizationService } from './movement-recategorization.service';
import { MovementsService } from './movements.service';

describe('FIN-B movements recategorize gate', () => {
  const reflector = new Reflector();
  const factory = new CaslAbilityFactory();
  const proto = MovementsController.prototype;
  it('registers JWT + PoliciesGuard and POST recategorize', () => {
    expect(reflector.get(GUARDS_METADATA, MovementsController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    expect(reflector.get(PATH_METADATA, proto.recategorize)).toBe('recategorize');
    expect(reflector.get(METHOD_METADATA, proto.recategorize)).toBe(RequestMethod.POST);
  });
  it.each(Object.values(UserRole))('matches the update Movement gate for %s', (role) => {
    const ability = factory.defineAbilityFor(role);
    const allowed = new Set<UserRole>([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ACCOUNTANT,
    ]).has(role);
    for (const handler of [proto.update, proto.recategorize]) {
      const policies = reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, handler);
      expect(policies.length).toBeGreaterThan(0);
      const can = jest.spyOn(ability, 'can');
      expect(policies.every((p) => p(ability))).toBe(allowed);
      expect(can).toHaveBeenCalledWith('update', MovementSubject);
    }
  });
  it('passes authenticated scope and the validated body to the service', async () => {
    const service = { recategorize: jest.fn().mockResolvedValue({ aplicados: 2 }) };
    const controller = new MovementsController(
      {} as MovementsService,
      service as unknown as MovementRecategorizationService,
    );
    await expect(
      controller.recategorize('company', { id: 'user' }, { dryRun: false }),
    ).resolves.toEqual({ aplicados: 2 });
    expect(service.recategorize).toHaveBeenCalledWith('company', 'user', { dryRun: false });
  });
});
