import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AppAbility, CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../common/decorators/check-policies.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { JwtStrategy } from '../iam/strategies/jwt.strategy';
import { HubController } from './hub.controller';

const reflector = new Reflector();
const factory = new CaslAbilityFactory();

function setup(
  request: { user?: { id: string }; headers: Record<string, string>; ability?: AppAbility },
  membership: { isActive: boolean; role: UserRole } | null = {
    isActive: true,
    role: UserRole.VIEWER,
  },
) {
  const prisma = { membership: { findUnique: jest.fn().mockResolvedValue(membership) } };
  const guard = new PoliciesGuard(reflector, factory, prisma as never);
  const context = {
    getHandler: () => HubController.prototype.status,
    getClass: () => HubController,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  } as ExecutionContext;
  return { prisma, guard, context };
}

describe('HUB-003a guard chain', () => {
  it('declares an explicit member policy, with JWT before PoliciesGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, HubController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    const handlers = reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      HubController.prototype.status,
    );
    expect(handlers).toHaveLength(1);
    for (const role of Object.values(UserRole))
      expect(handlers[0](factory.defineAbilityFor(role))).toBe(true);
  });

  it('rejects an unauthenticated request in the actual JWT guard before the membership guard runs', async () => {
    const previousSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'hub-guard-test-only';
      new JwtStrategy({ user: { findUnique: jest.fn() } } as never);
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
    const { guard, context, prisma } = setup({ headers: { 'x-company-id': 'company-a' } });
    const membershipCheck = jest.spyOn(guard, 'canActivate');
    const jwt = new JwtAuthGuard();
    const chain = async () => {
      await jwt.canActivate(context);
      return guard.canActivate(context);
    };
    await expect(chain()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(membershipCheck).not.toHaveBeenCalled();
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('does not fall open on a missing user despite the always-true policy', async () => {
    const { guard, context, prisma } = setup({ headers: { 'x-company-id': 'company-a' } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing company header', async () => {
    const { guard, context, prisma } = setup({ user: { id: 'user-a' }, headers: {} });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it.each([null, { isActive: false, role: UserRole.ADMIN }])(
    'rejects a missing or inactive membership (%p)',
    async (membership) => {
      const { guard, context } = setup(
        { user: { id: 'user-a' }, headers: { 'x-company-id': 'company-a' } },
        membership,
      );
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(Object.values(UserRole))(
    'accepts an active %s member and attaches that company ability',
    async (role) => {
      const request = {
        user: { id: 'user-a' },
        headers: { 'x-company-id': 'company-a' },
        ability: undefined as AppAbility | undefined,
      };
      const { guard, context, prisma } = setup(request, { isActive: true, role });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_companyId: { userId: 'user-a', companyId: 'company-a' } },
      });
      expect(request.ability?.rules).toEqual(factory.defineAbilityFor(role).rules);
    },
  );

  it('forwards the authenticated actor, company and policy ability to the service', async () => {
    const service = { getStatus: jest.fn().mockResolvedValue({ lines: [] }) };
    const controller = new HubController(service as never);
    const ability = factory.defineAbilityFor(UserRole.VIEWER);
    await expect(controller.status('company-a', { id: 'user-a' }, ability)).resolves.toEqual({
      lines: [],
    });
    expect(service.getStatus).toHaveBeenCalledWith('company-a', 'user-a', ability);
  });
});
