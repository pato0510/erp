import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtStrategy } from './strategies/jwt.strategy';

// In-memory persistence, real bcrypt and signed JWTs: verify that credential
// transitions invalidate actual previously issued tokens across both services.
describe('AUTH-001 session lifecycle', () => {
  it('revokes pre-reset and temporary-password sessions while keeping the changed session signed in', async () => {
    const previousAccessSecret = process.env.JWT_SECRET;
    const previousRefreshSecret = process.env.REFRESH_TOKEN_SECRET;
    process.env.JWT_SECRET = 'auth-001-lifecycle-access-test';
    process.env.REFRESH_TOKEN_SECRET = 'auth-001-lifecycle-refresh-test';
    try {
      const row = {
        id: 'target',
        email: 'Legacy@Example.cl',
        tokenVersion: 0,
        isActive: true,
        mustChangePassword: false,
        passwordChangedAt: null as Date | null,
        passwordHash: await bcrypt.hash('Original123', 4),
        refreshTokenHash: null as string | null,
      };
      const prisma = {
        user: {
          findUnique: jest.fn(async () => ({ ...row })),
          findFirst: jest.fn(async () => ({ ...row })),
          update: jest.fn(async ({ data }) => {
            const { tokenVersion, ...fields } = data;
            Object.assign(row, fields);
            if (tokenVersion) row.tokenVersion += tokenVersion.increment;
            return { ...row };
          }),
        },
        membership: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'm1', isActive: true, role: UserRole.ADMIN }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const rls = {
        executeWithRls: async (
          _company: string,
          _actor: string,
          callback: (tx: typeof prisma) => unknown,
        ) => callback(prisma),
      };
      const jwt = new JwtService({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '8h' },
      });
      const auth = new AuthService(prisma as never, jwt);
      const users = new UsersService(prisma as never, rls as never);
      const strategy = new JwtStrategy(prisma as never);
      const cookies: Record<string, string> = {};
      const response = {
        cookie: (name: string, value: string) => {
          cookies[name] = value;
        },
      } as Response;
      const accessPayload = (token: string) =>
        jwt.verify<{ sub: string; email: string; tv?: number }>(token);
      const refreshVersion = (token: string) =>
        jwt.verify<{ tv?: number }>(token, {
          secret: process.env.REFRESH_TOKEN_SECRET,
        }).tv;

      await auth.login(row, response);
      const original = { ...cookies };
      await expect(strategy.validate(accessPayload(original.access_token))).resolves.toMatchObject({
        mustChangePassword: false,
      });

      const { temporaryPassword } = await users.resetAccess(row.id, 'company', 'admin');
      expect(row.tokenVersion).toBe(1);
      expect(row.refreshTokenHash).toBeNull();
      await expect(strategy.validate(accessPayload(original.access_token))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        auth.refresh(
          row.id,
          original.refresh_token,
          response,
          refreshVersion(original.refresh_token),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(auth.validateUser(row.email, 'Original123')).resolves.toBeNull();
      const temporaryUser = await auth.validateUser('  legacy@EXAMPLE.cl ', temporaryPassword);
      expect(temporaryUser).toMatchObject({ mustChangePassword: true });
      if (!temporaryUser) throw new Error('Temporary credential was rejected');
      await auth.login(temporaryUser, response);
      const temporarySession = { ...cookies };
      await expect(
        strategy.validate(accessPayload(temporarySession.access_token)),
      ).resolves.toMatchObject({ mustChangePassword: true });

      await auth.changePassword(
        row.id,
        { currentPassword: temporaryPassword, newPassword: 'Permanent1234' },
        response,
      );
      expect(row.tokenVersion).toBe(2);
      expect(row.mustChangePassword).toBe(false);
      expect(row.passwordChangedAt).toBeInstanceOf(Date);
      const permanentSession = { ...cookies };
      await expect(
        strategy.validate(accessPayload(temporarySession.access_token)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        auth.refresh(
          row.id,
          temporarySession.refresh_token,
          response,
          refreshVersion(temporarySession.refresh_token),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        strategy.validate(accessPayload(permanentSession.access_token)),
      ).resolves.toMatchObject({ mustChangePassword: false });
      await expect(
        auth.refresh(
          row.id,
          permanentSession.refresh_token,
          response,
          refreshVersion(permanentSession.refresh_token),
        ),
      ).resolves.toEqual({ message: 'Token refreshed' });
      await expect(auth.validateUser(row.email, temporaryPassword)).resolves.toBeNull();
      await expect(auth.validateUser(row.email, 'Permanent1234')).resolves.toMatchObject({
        id: row.id,
      });
    } finally {
      if (previousAccessSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousAccessSecret;
      if (previousRefreshSecret === undefined) delete process.env.REFRESH_TOKEN_SECRET;
      else process.env.REFRESH_TOKEN_SECRET = previousRefreshSecret;
    }
  });
});
