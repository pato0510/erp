import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { CaslAbilityFactory, TodoSubject } from '../../common/casl/casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ActividadesController } from '../actividades.controller';
import { TodosController } from './todos.controller';

const factory = new CaslAbilityFactory();
const reflector = new Reflector();
const WRITERS: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
const endpoints = [
  ['findAll', 'read'],
  ['assignees', 'create'],
  ['create', 'create'],
  ['update', 'update'],
  ['complete', 'read'],
  ['reopen', 'update'],
  ['remove', 'delete'],
] as const;

describe('GO-001 Todo authorization', () => {
  it.each(Object.values(UserRole))('%s grants and area permission flags', (role) => {
    const ability = factory.defineAbilityFor(role);
    const flags = {
      read: true,
      create: WRITERS.includes(role),
      update: WRITERS.includes(role),
      delete: WRITERS.includes(role),
    };
    for (const action of ['read', 'create', 'update', 'delete'] as const)
      expect(ability.can(action, TodoSubject)).toBe(flags[action]);
    expect(ability.can('manage', TodoSubject)).toBe(
      role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN,
    );
    const area = Object.create(ActividadesController.prototype) as ActividadesController;
    expect(area.permissions(ability).todo).toEqual(flags);
  });

  it('installs both guards and gates every handler', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TodosController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    const methods = Object.getOwnPropertyNames(TodosController.prototype).filter(
      (key) => key !== 'constructor',
    );
    expect(methods.sort()).toEqual(endpoints.map(([method]) => method).sort());
  });

  it.each(endpoints)('%s checks exactly %s Todo', (method, action) => {
    const handlers = reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      TodosController.prototype[method],
    );
    expect(handlers).toHaveLength(1);
    const can = jest.fn(() => true);
    handlers[0]({ can } as never);
    expect(can).toHaveBeenCalledWith(action, TodoSubject);
    for (const role of Object.values(UserRole)) {
      expect(handlers.every((handler) => handler(factory.defineAbilityFor(role)))).toBe(
        action === 'read' || WRITERS.includes(role),
      );
    }
  });

  it.each([UserRole.VIEWER, UserRole.ACCOUNTANT, UserRole.ANALYST])(
    'assignees rejects %s with 403 in PoliciesGuard',
    async (role) => {
      const prisma = {
        membership: { findUnique: jest.fn().mockResolvedValue({ isActive: true, role }) },
      };
      const guard = new PoliciesGuard(reflector, factory, prisma as never);
      const request = { user: { id: 'u1' }, headers: { 'x-company-id': 'c1' } };
      const context = {
        getHandler: () => TodosController.prototype.assignees,
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
