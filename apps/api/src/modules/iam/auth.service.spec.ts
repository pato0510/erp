import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
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
      prisma.user.findUnique.mockResolvedValue(userRow);
      bcryptMock.compare.mockResolvedValue(true);

      const result = await service.validateUser('admin@excelsia.dev', 'Admin1234!');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@excelsia.dev' },
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
      prisma.user.findUnique.mockResolvedValue(userRow);
      bcryptMock.compare.mockResolvedValue(false);

      const result = await service.validateUser('admin@excelsia.dev', 'wrong');
      expect(result).toBeNull();
    });

    it('returns null when email does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('ghost@nowhere.com', 'anything');
      expect(result).toBeNull();
      // Never compare a password against a non-user — avoids timing leaks.
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it('returns null when user exists but is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...userRow, isActive: false });

      const result = await service.validateUser('admin@excelsia.dev', 'Admin1234!');
      expect(result).toBeNull();
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── LocalStrategy flow ─────────────────────────

  describe('LocalStrategy (login guard)', () => {
    it('returns the user when validateUser accepts the credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
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
      prisma.user.findUnique.mockResolvedValue({
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
      prisma.user.findUnique.mockResolvedValue(null);

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
});
