import { ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  ALLOW_PENDING_PASSWORD_CHANGE_KEY,
  AllowPendingPasswordChange,
} from '../../common/decorators/allow-pending-password-change.decorator';
import { AuthController } from '../auth.controller';
import { NotificationController } from '../../operations/notifications/notification.controller';
import { OperationsHealthController } from '../../operations/health/operations-health.controller';
import { AssetQrController } from '../../operations/assets/asset-qr.controller';

class ProtectedController {
  action() {
    return true;
  }

  @AllowPendingPasswordChange()
  recovery() {
    return true;
  }
}

@AllowPendingPasswordChange()
class RecoveryController {
  action() {
    return true;
  }

  @SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, false)
  restricted() {
    return true;
  }
}

describe('JwtAuthGuard pending password change', () => {
  const secret = 'auth-001-a-test-only';
  const jwt = new JwtService({ secret });
  const prisma = { user: { findUnique: jest.fn() } };
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    try {
      new JwtStrategy(prisma as never);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      isActive: true,
      tokenVersion: 0,
      mustChangePassword: true,
    });
    const module = await Test.createTestingModule({
      providers: [JwtAuthGuard, Reflector],
    }).compile();
    guard = module.get(JwtAuthGuard);
  });

  function context(
    authenticated = true,
    controller: ReturnType<ExecutionContext['getClass']> = ProtectedController,
    handler: ReturnType<ExecutionContext['getHandler']> = ProtectedController.prototype.action,
  ) {
    const request = {
      cookies: authenticated
        ? { access_token: jwt.sign({ sub: 'u1', email: 'test@example.cl', tv: 0 }) }
        : {},
    };
    return {
      getClass: () => controller,
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
    } as ExecutionContext;
  }

  it('denies a flagged identity on an undecorated route after real Passport authentication', async () => {
    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: 403,
      response: {
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Debes cambiar tu contraseña para continuar.',
      },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('allows an unflagged authenticated identity', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      isActive: true,
      tokenVersion: 0,
      mustChangePassword: false,
    });
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('keeps unauthenticated requests at 401', async () => {
    await expect(guard.canActivate(context(false))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    [ProtectedController, ProtectedController.prototype.recovery],
    [RecoveryController, RecoveryController.prototype.action],
  ])('honours the method-level and class-level recovery opt-in', async (controller, handler) => {
    await expect(guard.canActivate(context(true, controller, handler))).resolves.toBe(true);
  });

  it('gives method metadata precedence over class metadata', async () => {
    await expect(
      guard.canActivate(context(true, RecoveryController, RecoveryController.prototype.restricted)),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }),
    });
  });

  it('does not let the recovery decorator bypass authentication', async () => {
    await expect(
      guard.canActivate(context(false, RecoveryController, RecoveryController.prototype.action)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['me', 'logout', 'changePassword'] as const)(
    'allows the actual auth %s recovery route',
    async (method) => {
      await expect(
        guard.canActivate(context(true, AuthController, AuthController.prototype[method])),
      ).resolves.toBe(true);
    },
  );

  it.each([
    [NotificationController, NotificationController.prototype.findAll],
    [NotificationController, NotificationController.prototype.unreadCount],
    [NotificationController, NotificationController.prototype.markAllRead],
    [NotificationController, NotificationController.prototype.markRead],
    [NotificationController, NotificationController.prototype.dismiss],
    [OperationsHealthController, OperationsHealthController.prototype.health],
    [OperationsHealthController, OperationsHealthController.prototype.listCrons],
    [AssetQrController, AssetQrController.prototype.authenticatedScan],
  ])(
    'blocks a flagged identity on the actual previously open handler %p %p',
    async (controller, handler) => {
      await expect(guard.canActivate(context(true, controller, handler))).rejects.toMatchObject({
        status: 403,
        response: {
          statusCode: 403,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Debes cambiar tu contraseña para continuar.',
        },
      });
    },
  );

  it('rejects a stale JWT even on a recovery route', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      isActive: true,
      tokenVersion: 1,
      mustChangePassword: true,
    });
    await expect(
      guard.canActivate(context(true, AuthController, AuthController.prototype.changePassword)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
