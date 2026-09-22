import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../common/decorators/check-policies.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PASSWORD_POLICY_MESSAGE } from './password-policy';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../common/decorators/allow-pending-password-change.decorator';

describe('AUTH-002 backend contract', () => {
  const reflector = new Reflector();
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it.each(['me', 'logout', 'changePassword'] as const)(
    '%s remains an identity action without PoliciesGuard',
    (method) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, AuthController)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype[method])).toEqual([
        JwtAuthGuard,
      ]);
      expect(
        Reflect.getMetadata(CHECK_POLICIES_KEY, AuthController.prototype[method]),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, AuthController.prototype[method]),
      ).toBe(true);
    },
  );

  it('limits the pending-password exception to the three recovery actions', () => {
    expect(Reflect.getMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, AuthController)).toBeUndefined();
    for (const method of ['login', 'refresh', 'testPermissions'] as const) {
      expect(
        Reflect.getMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, AuthController.prototype[method]),
      ).toBeUndefined();
    }
  });

  it('throttles change-password exactly like login and returns 200', () => {
    for (const key of ['THROTTLER:LIMITdefault', 'THROTTLER:TTLdefault']) {
      expect(Reflect.getMetadata(key, AuthController.prototype.changePassword)).toEqual(
        Reflect.getMetadata(key, AuthController.prototype.login),
      );
    }
    expect(
      Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.changePassword),
    ).toBe(5);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.changePassword)).toBe(
      200,
    );
  });

  it('gates reset-access with manage User for all six roles and marks the response no-store', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController)).toEqual([
      JwtAuthGuard,
      PoliciesGuard,
    ]);
    const handler = UsersController.prototype.resetAccess;
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
    const policies = reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, handler);
    expect(policies).toHaveLength(1);
    for (const role of Object.values(UserRole)) {
      expect(policies[0](new CaslAbilityFactory().defineAbilityFor(role))).toBe(
        role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN,
      );
    }
  });

  it('forwards the verified refresh version and current actor to services', async () => {
    const service = { refresh: jest.fn(), changePassword: jest.fn() };
    const controller = new AuthController(service as never);
    const res = {} as Response;
    await controller.refresh(
      { user: { id: 'u1', refreshToken: 'token', tv: 7 } } as unknown as Request,
      res,
    );
    expect(service.refresh).toHaveBeenCalledWith('u1', 'token', res, 7);
    const dto = { currentPassword: 'OldPass1234', newPassword: 'NewPass5678' };
    await controller.changePassword({ id: 'u1' }, dto, res);
    expect(service.changePassword).toHaveBeenCalledWith('u1', dto, res);
    const users = { resetAccess: jest.fn() };
    new UsersController(users as never).resetAccess('target', 'company', { id: 'actor' });
    expect(users.resetAccess).toHaveBeenCalledWith('target', 'company', 'actor');
  });

  it.each(['Short1234', 'abcdefghij', '1234567890', 'x'.repeat(100) + '1', null, 123])(
    'rejects policy violations with 400 across all password-writing DTOs',
    async (password) => {
      for (const [metatype, body] of [
        [ChangePasswordDto, { currentPassword: 'old', newPassword: password }],
        [
          CreateUserDto,
          {
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.cl',
            role: 'VIEWER',
            password,
          },
        ],
        [UpdateUserDto, { password }],
      ] as const) {
        await expect(pipe.transform(body, { type: 'body', metatype })).rejects.toMatchObject({
          status: 400,
          response: expect.objectContaining({
            message: expect.arrayContaining([PASSWORD_POLICY_MESSAGE]),
          }),
        });
      }
    },
  );

  it.each(['a'.repeat(9) + '1', 'a'.repeat(99) + '1'])(
    'accepts the policy length boundaries',
    async (newPassword) => {
      await expect(
        pipe.transform(
          { currentPassword: 'old', newPassword },
          { type: 'body', metatype: ChangePasswordDto },
        ),
      ).resolves.toMatchObject({ newPassword });
    },
  );

  it('allows updates without password and keeps the legacy login minimum', async () => {
    await expect(pipe.transform({}, { type: 'body', metatype: UpdateUserDto })).resolves.toEqual(
      {},
    );
    for (const password of ['12345678', '123456789']) {
      await expect(
        pipe.transform(
          { email: 'test@example.cl', password },
          { type: 'body', metatype: LoginDto },
        ),
      ).resolves.toMatchObject({ password });
    }
  });

  it('rejects missing current password and unknown request fields', async () => {
    await expect(
      pipe.transform({ newPassword: 'NewPass1234' }, { type: 'body', metatype: ChangePasswordDto }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(
        { currentPassword: 'old', newPassword: 'NewPass1234', userId: 'other' },
        { type: 'body', metatype: ChangePasswordDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
