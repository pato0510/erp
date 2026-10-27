import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessModule, UserRole } from '@prisma/client';
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

describe('ACCESS-001 — PoliciesGuard passes the membership module blocks to the factory', () => {
  const run = async (restrictedModules: AccessModule[]) => {
    const handler = jest.fn(() => true);
    const factory = { defineAbilityFor: jest.fn(() => ({ can: () => true })) };
    const prisma = {
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isActive: true, role: UserRole.MANAGER, restrictedModules }),
      },
    };
    const request: Record<string, unknown> = {
      user: { id: 'u1', mustChangePassword: false },
      headers: { 'x-company-id': 'c1' },
    };
    const context = {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const guard = new PoliciesGuard(
      { get: () => [handler] } as never,
      factory as never,
      prisma as never,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    return { factory, request };
  };

  it('forwards [FINANZAS] from the membership row', async () => {
    const { factory, request } = await run([AccessModule.FINANZAS]);
    expect(factory.defineAbilityFor).toHaveBeenCalledWith(UserRole.MANAGER, [
      AccessModule.FINANZAS,
    ]);
    expect(request.ability).toBe(factory.defineAbilityFor.mock.results[0].value);
  });

  it("forwards the empty list unchanged (today's access)", async () => {
    const { factory } = await run([]);
    expect(factory.defineAbilityFor).toHaveBeenCalledWith(UserRole.MANAGER, []);
  });

  it('a FINANZAS-restricted MANAGER is denied a read Movement gate end to end', async () => {
    const { MovementSubject } = await import('../casl/casl-ability.factory');
    const handler = (ability: { can: (a: string, s: unknown) => boolean }) =>
      ability.can('read', MovementSubject);
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          role: UserRole.MANAGER,
          restrictedModules: [AccessModule.FINANZAS],
        }),
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
  });
});
