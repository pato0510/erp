import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ActividadesController } from '../actividades/actividades.controller';
import { ActividadesModule } from '../actividades/actividades.module';
import { CaslAbilityFactory, CalendarActivitySubject } from '../common/casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../common/decorators/check-policies.decorator';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../common/decorators/allow-pending-password-change.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { MembersQueryDto } from './dto/members-query.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { IamModule } from './iam.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

const reflector = new Reflector();
const factory = new CaslAbilityFactory();

function setup(
  membership: { isActive: boolean; role: UserRole } | null,
  request = {
    user: { id: 'actor', mustChangePassword: false },
    headers: { 'x-company-id': 'company-a' },
  },
) {
  const prisma = { membership: { findUnique: jest.fn().mockResolvedValue(membership) } };
  const context = {
    getHandler: () => MembersController.prototype.list,
    getClass: () => MembersController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  return { guard: new PoliciesGuard(reflector, factory, prisma as never), context, prisma };
}

describe('MEM-001 members controller and authorization', () => {
  it('registers and exports the directory in IAM without coupling Actividades to IAM', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, IamModule)).toContain(
      MembersController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IamModule)).toContain(MembersService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, IamModule)).toContain(MembersService);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ActividadesModule)).not.toContain(
      IamModule,
    );
    expect(Reflect.getMetadata(PATH_METADATA, MembersController)).toBe('members');
  });

  it('declares both guards and an explicit all-role policy without a forced-change exemption', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MembersController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    const handlers = reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      MembersController.prototype.list,
    );
    expect(handlers).toHaveLength(1);
    for (const role of Object.values(UserRole))
      expect(handlers[0](factory.defineAbilityFor(role))).toBe(true);
    expect(
      reflector.getAllAndOverride(ALLOW_PENDING_PASSWORD_CHANGE_KEY, [
        MembersController.prototype.list,
        MembersController,
      ]),
    ).toBeUndefined();
  });

  it.each(Object.values(UserRole))(
    'admits an active %s member of the selected company',
    async (role) => {
      const { guard, context, prisma } = setup({ isActive: true, role });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(prisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_companyId: { userId: 'actor', companyId: 'company-a' } },
      });
    },
  );

  it.each([null, { isActive: false, role: UserRole.ADMIN }])(
    'rejects absent/inactive membership %p',
    async (membership) => {
      const { guard, context } = setup(membership);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('rejects a missing company header before querying memberships', async () => {
    const { guard, context, prisma } = setup(null, {
      user: { id: 'actor', mustChangePassword: false },
      headers: { 'x-company-id': '' },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('retains the coded forced-password gate', async () => {
    const { guard, context, prisma } = setup(null, {
      user: { id: 'actor', mustChangePassword: true },
      headers: { 'x-company-id': 'company-a' },
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Debes cambiar tu contraseña para continuar.',
      },
    });
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('keeps only the guarded calendar routes in the Actividades inventory', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ActividadesController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    const methods = Object.getOwnPropertyNames(ActividadesController.prototype).filter(
      (method) => method !== 'constructor',
    );
    expect(methods.sort()).toEqual(['calendar', 'permissions', 'ping']);
    for (const method of methods) {
      const handler = ActividadesController.prototype[method];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(method);
      const handlers = reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, handler);
      expect(handlers).toHaveLength(1);
      const can = jest.fn(() => true);
      handlers[0]({ can } as never);
      expect(can).toHaveBeenCalledWith('read', CalendarActivitySubject);
    }
  });

  it.each(['all', 'active'] as const)(
    'forwards the company, authenticated actor and %s scope',
    async (scope) => {
      const members = {
        listForCompany: jest.fn().mockResolvedValue([{ userId: 'u', displayName: 'Ana Díaz' }]),
      };
      const controller = new MembersController(members as never);
      await expect(controller.list('company-a', { id: 'actor' }, { scope })).resolves.toEqual([
        { userId: 'u', displayName: 'Ana Díaz' },
      ]);
      expect(members.listForCompany).toHaveBeenCalledWith('company-a', 'actor', scope);
    },
  );
});

describe('MEM-001 scope query validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metadata = { type: 'query' as const, metatype: MembersQueryDto };

  it('defaults to all', async () => {
    await expect(pipe.transform({}, metadata)).resolves.toEqual({ scope: 'all' });
  });

  it.each(['active', 'all'])('accepts %s', async (scope) => {
    await expect(pipe.transform({ scope }, metadata)).resolves.toEqual({ scope });
  });

  it.each(['invalid', '', 'ALL', ['active', 'all']])(
    'rejects invalid scope %p with 400',
    async (scope) => {
      await expect(pipe.transform({ scope }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
