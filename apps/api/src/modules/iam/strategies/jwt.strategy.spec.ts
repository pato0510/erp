import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtStrategy } from './jwt.strategy';
import { RefreshStrategy } from './refresh.strategy';

describe('JWT credential version validation', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  let strategy: JwtStrategy;
  const row = { id: 'u1', isActive: true, tokenVersion: 0, mustChangePassword: false };

  beforeEach(() => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'auth-001-test-only';
    try {
      strategy = new JwtStrategy(prisma as never);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
    prisma.user.findUnique.mockResolvedValue(row);
  });

  it('accepts a legacy token without tv at version zero using one PK lookup', async () => {
    await expect(strategy.validate({ sub: 'u1', email: 'test@example.cl' })).resolves.toEqual({
      id: 'u1',
      email: 'test@example.cl',
      mustChangePassword: false,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, isActive: true, tokenVersion: true, mustChangePassword: true },
    });
  });

  it.each([null, { ...row, isActive: false }, { ...row, tokenVersion: 1 }])(
    'rejects missing, inactive and stale-version identities',
    async (user) => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(
        strategy.validate({ sub: 'u1', email: 'test@example.cl', tv: 0 }),
      ).rejects.toEqual(new UnauthorizedException());
    },
  );

  it('rejects legacy tokens after credential revocation', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...row, tokenVersion: 1 });
    await expect(strategy.validate({ sub: 'u1', email: 'test@example.cl' })).rejects.toEqual(
      new UnauthorizedException(),
    );
  });

  it('takes the forced-change flag from the current database state', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...row, tokenVersion: 2, mustChangePassword: true });
    await expect(
      strategy.validate({ sub: 'u1', email: 'test@example.cl', tv: 2 }),
    ).resolves.toMatchObject({ mustChangePassword: true });
  });

  it.each([undefined, 3])('passes verified refresh tv through to the service (%s)', (tv) => {
    const previous = process.env.REFRESH_TOKEN_SECRET;
    process.env.REFRESH_TOKEN_SECRET = 'auth-001-refresh-test-only';
    try {
      const refresh = new RefreshStrategy();
      expect(
        refresh.validate({ cookies: { refresh_token: 'token' } } as Request, {
          sub: 'u1',
          email: 'test@example.cl',
          tv,
        }),
      ).toEqual({
        id: 'u1',
        email: 'test@example.cl',
        refreshToken: 'token',
        tv,
      });
    } finally {
      if (previous === undefined) delete process.env.REFRESH_TOKEN_SECRET;
      else process.env.REFRESH_TOKEN_SECRET = previous;
    }
  });
});
