import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PASSWORD_POLICY_MESSAGE } from './password-policy';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { PrismaService } from '../common/prisma/prisma.service';

jest.mock('bcrypt');

type BcryptMock = {
  compare: jest.Mock;
  hash: jest.Mock;
};

const bcryptMock = bcrypt as unknown as BcryptMock;

describe('AuthService', () => {
  let service: AuthService;
  let strategy: LocalStrategy;
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    jwtService = { sign: jest.fn(() => 'signed.jwt.token') };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        LocalStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    strategy = moduleRef.get(LocalStrategy);

    bcryptMock.compare.mockReset();
    bcryptMock.hash.mockReset().mockResolvedValue('hashed-refresh');
  });

  // ───────────────────────── validateUser ─────────────────────────

  describe('validateUser', () => {
    const userRow = {
      id: 'u1',
      email: 'admin@excelsia.dev',
      passwordHash: 'stored-hash',
      refreshTokenHash: 'old-refresh-hash',
      firstName: 'Admin',
      lastName: 'Demo',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns the user (without sensitive fields) when credentials are valid', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow);
      bcryptMock.compare.mockResolvedValue(true);

      const result = await service.validateUser('admin@excelsia.dev', 'Admin1234!');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'admin@excelsia.dev', mode: 'insensitive' } },
      });
      expect(bcryptMock.compare).toHaveBeenCalledWith('Admin1234!', 'stored-hash');
      expect(result).toMatchObject({
        id: 'u1',
        email: 'admin@excelsia.dev',
        firstName: 'Admin',
        isActive: true,
      });
      // Secrets must never leak to the caller.
      expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((result as Record<string, unknown>).refreshTokenHash).toBeUndefined();
    });

    it('returns null when password does not match', async () => {
      prisma.user.findFirst.mockResolvedValue(userRow);
      bcryptMock.compare.mockResolvedValue(false);

      const result = await service.validateUser('admin@excelsia.dev', 'wrong');
      expect(result).toBeNull();
    });

    it('returns null when email does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.validateUser('ghost@nowhere.com', 'anything');
      expect(result).toBeNull();
      // Never compare a password against a non-user — avoids timing leaks.
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it('returns null when user exists but is inactive', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...userRow, isActive: false });

      const result = await service.validateUser('admin@excelsia.dev', 'Admin1234!');
      expect(result).toBeNull();
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── LocalStrategy flow ─────────────────────────

  describe('LocalStrategy (login guard)', () => {
    it('returns the user when validateUser accepts the credentials', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'admin@excelsia.dev',
        passwordHash: 'stored-hash',
        refreshTokenHash: null,
        isActive: true,
        firstName: 'Admin',
        lastName: 'Demo',
      });
      bcryptMock.compare.mockResolvedValue(true);

      const result = await strategy.validate('admin@excelsia.dev', 'Admin1234!');
      expect(result).toMatchObject({ id: 'u1', email: 'admin@excelsia.dev' });
    });

    it('throws UnauthorizedException when the password is invalid', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'admin@excelsia.dev',
        passwordHash: 'stored-hash',
        refreshTokenHash: null,
        isActive: true,
      });
      bcryptMock.compare.mockResolvedValue(false);

      await expect(strategy.validate('admin@excelsia.dev', 'bad')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the email does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(strategy.validate('ghost@nowhere.com', 'any')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  // ───────────────────────── logout ─────────────────────────

  describe('logout', () => {
    it('clears the refreshTokenHash in the DB and clears both auth cookies', async () => {
      prisma.user.update.mockResolvedValue({});
      const mockRes = { clearCookie: jest.fn() } as unknown as Response;

      await service.logout('u1', mockRes);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { refreshTokenHash: null },
      });
      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
    });
  });
  describe('credential state', () => {
    const row = {
      id: 'u1',
      email: 'Mixed@Example.cl',
      isActive: true,
      tokenVersion: 4,
      mustChangePassword: true,
      passwordHash: 'old-password',
      refreshTokenHash: 'old-refresh',
    };
    const dto = { currentPassword: 'OldPass1234', newPassword: 'NewPass5678' };
    let cookie: jest.Mock;
    let response: Response;

    beforeEach(() => {
      cookie = jest.fn();
      response = { cookie } as unknown as Response;
      prisma.user.findUnique.mockResolvedValue(row);
      prisma.user.update.mockResolvedValue({ ...row, tokenVersion: 5, mustChangePassword: false });
    });

    it('looks up a trimmed mixed-case email case-insensitively without rewriting the row', async () => {
      prisma.user.findFirst.mockResolvedValue(row);
      bcryptMock.compare.mockResolvedValue(true);
      await expect(
        service.validateUser('  mixed@EXAMPLE.cl  ', 'OldPass1234'),
      ).resolves.toMatchObject({ email: 'Mixed@Example.cl' });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: 'mixed@EXAMPLE.cl', mode: 'insensitive' } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('issues both login cookies with the database version', async () => {
      await expect(service.login(row, response)).resolves.toEqual({ id: 'u1', email: row.email });
      expect(jwtService.sign).toHaveBeenNthCalledWith(1, { sub: 'u1', email: row.email, tv: 4 });
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: 'u1', email: row.email, tv: 4 },
        expect.objectContaining({ expiresIn: '7d' }),
      );
      expect(cookie).toHaveBeenCalledTimes(2);
      expect(cookie).toHaveBeenCalledWith(
        'access_token',
        'signed.jwt.token',
        expect.objectContaining({ httpOnly: true, path: '/', maxAge: 28800000 }),
      );
      expect(cookie).toHaveBeenCalledWith(
        'refresh_token',
        'signed.jwt.token',
        expect.objectContaining({ httpOnly: true, path: '/api/auth/refresh', maxAge: 604800000 }),
      );
    });

    it('bumps tv, clears old refresh and forced flag, then reissues this session', async () => {
      bcryptMock.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      bcryptMock.hash
        .mockResolvedValueOnce('new-password-hash')
        .mockResolvedValueOnce('new-refresh-hash');
      await expect(service.changePassword('u1', dto, response)).resolves.toEqual({
        message: 'Contraseña actualizada correctamente.',
      });
      expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'u1', tokenVersion: 4, isActive: true },
        data: {
          passwordHash: 'new-password-hash',
          mustChangePassword: false,
          passwordChangedAt: expect.any(Date),
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        },
      });
      expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'u1', tokenVersion: 5, isActive: true },
        data: { refreshTokenHash: 'new-refresh-hash' },
      });
      expect(jwtService.sign).toHaveBeenNthCalledWith(1, { sub: 'u1', email: row.email, tv: 5 });
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: 'u1', email: row.email, tv: 5 },
        expect.any(Object),
      );
      expect(cookie).toHaveBeenCalledTimes(2);
    });

    it('returns 400 for the wrong current password without writing or issuing cookies', async () => {
      bcryptMock.compare.mockResolvedValue(false);
      await expect(service.changePassword('u1', dto, response)).rejects.toMatchObject({
        status: 400,
        message: 'La contraseña actual no es correcta.',
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(cookie).not.toHaveBeenCalled();
    });

    it('rejects a new password equivalent to the old bcrypt password', async () => {
      bcryptMock.compare.mockResolvedValue(true);
      await expect(service.changePassword('u1', dto, response)).rejects.toMatchObject({
        status: 400,
        message: 'La nueva contraseña debe ser distinta de la actual.',
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it.each(['Short1234', 'a'.repeat(10), '1'.repeat(10), 'a'.repeat(100) + '1'])(
      'rejects a password policy violation',
      async (newPassword) => {
        await expect(
          service.changePassword('u1', { ...dto, newPassword }, response),
        ).rejects.toEqual(new BadRequestException(PASSWORD_POLICY_MESSAGE));
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(cookie).not.toHaveBeenCalled();
      },
    );

    it.each([null, { ...row, isActive: false }])(
      'rejects missing/inactive users during change',
      async (user) => {
        prisma.user.findUnique.mockResolvedValue(user);
        await expect(service.changePassword('u1', dto, response)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
      },
    );

    it.each([
      null,
      { ...row, isActive: false },
      { ...row, tokenVersion: 5 },
      { ...row, refreshTokenHash: null },
    ])('rejects invalid refresh state before bcrypt', async (user) => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.refresh('u1', 'refresh-token', response, 4)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(bcryptMock.compare).not.toHaveBeenCalled();
      expect(cookie).not.toHaveBeenCalled();
    });

    it('rejects a bad refresh hash', async () => {
      bcryptMock.compare.mockResolvedValue(false);
      await expect(service.refresh('u1', 'wrong', response, 4)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(cookie).not.toHaveBeenCalled();
    });

    it('accepts legacy refresh without tv only at version zero', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...row, tokenVersion: 0 });
      bcryptMock.compare.mockResolvedValue(true);
      await expect(service.refresh('u1', 'legacy', response)).resolves.toEqual({
        message: 'Token refreshed',
      });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'u1', email: row.email, tv: 0 });
      prisma.user.findUnique.mockResolvedValue(row);
      await expect(service.refresh('u1', 'legacy', response)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('allows refresh while forced change is pending and signs the current tv', async () => {
      bcryptMock.compare.mockResolvedValue(true);
      await service.refresh('u1', 'refresh', response, 4);
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'u1', email: row.email, tv: 4 });
    });

    it('reports a concurrent credential update as 401 without cookies', async () => {
      bcryptMock.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record changed', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      await expect(service.changePassword('u1', dto, response)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(cookie).not.toHaveBeenCalled();
    });

    it('does not overwrite a newer refresh slot after concurrent reset at login', async () => {
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record changed', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      await expect(service.login(row, response)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(cookie).not.toHaveBeenCalled();
    });

    it('exposes mustChangePassword in me without exposing credential hashes or tv', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...row,
        firstName: 'Test',
        lastName: 'User',
        lastLoginAt: null,
        memberships: [
          { id: 'm1', role: 'ADMIN', company: { id: 'c1', name: 'Company', taxId: 'rut' } },
        ],
      });
      await expect(service.getMe('u1')).resolves.toEqual({
        id: 'u1',
        email: row.email,
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: null,
        companies: [
          {
            companyId: 'c1',
            companyName: 'Company',
            taxId: 'rut',
            role: 'ADMIN',
            membershipId: 'm1',
          },
        ],
      });
    });
  });
});
