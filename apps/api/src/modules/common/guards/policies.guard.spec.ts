import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { PoliciesGuard } from './policies.guard';

describe('PoliciesGuard forced password change', () => {
  it.each(['normal', 'always true', 'no handlers'])(
    'blocks before %s policy evaluation',
    async (kind) => {
      const handler = jest.fn(() => true);
      const reflector = { get: jest.fn(() => (kind === 'no handlers' ? undefined : [handler])) };
      const factory = { defineAbilityFor: jest.fn() };
      const prisma = { membership: { findUnique: jest.fn() } };
      const context = {
        getHandler: () => handler,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u1', mustChangePassword: true }, headers: {} }),
        }),
      } as unknown as ExecutionContext;
      const guard = new PoliciesGuard(reflector as never, factory as never, prisma as never);
      await expect(guard.canActivate(context)).rejects.toEqual(
        new ForbiddenException({
          statusCode: 403,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Debes cambiar tu contraseña para continuar.',
        }),
      );
      expect(handler).not.toHaveBeenCalled();
      expect(reflector.get).not.toHaveBeenCalled();
      expect(factory.defineAbilityFor).not.toHaveBeenCalled();
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    },
  );

  it('retains the documented fail-open branch when no change is required', async () => {
    const context = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    const guard = new PoliciesGuard(new Reflector(), new CaslAbilityFactory(), {} as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('continues to enforce membership and policy after the flag is cleared', async () => {
    const handler = jest.fn(() => false);
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true, role: UserRole.VIEWER }),
      },
    };
    const context = {
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', mustChangePassword: false },
          headers: { 'x-company-id': 'c1' },
        }),
      }),
    } as unknown as ExecutionContext;
    const guard = new PoliciesGuard(
      { get: () => [handler] } as never,
      new CaslAbilityFactory(),
      prisma as never,
    );
    await expect(guard.canActivate(context)).rejects.toThrow('Insufficient permissions');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
