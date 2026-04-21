import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = user;
    return result;
  }

  async login(user: { id: string; email: string }, response: Response) {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as StringValue,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), refreshTokenHash },
    });

    this.setAccessTokenCookie(response, accessToken);
    this.setRefreshTokenCookie(response, refreshToken);

    return { id: user.id, email: user.email };
  }

  async refresh(userId: string, refreshToken: string, response: Response) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException();
    }

    const isTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isTokenValid) {
      throw new UnauthorizedException();
    }

    const payload = { sub: user.id, email: user.email };
    const newAccessToken = this.jwtService.sign(payload);
    this.setAccessTokenCookie(response, newAccessToken);

    return { message: 'Token refreshed' };
  }

  async logout(userId: string, response: Response) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    const isProd = process.env.NODE_ENV === 'production';

    response.clearCookie('access_token', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: undefined,
      path: '/',
    });

    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: undefined,
      path: '/api/auth/refresh',
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        memberships: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            company: {
              select: {
                id: true,
                name: true,
                taxId: true,
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      companies: user.memberships.map((m) => ({
        companyId: m.company.id,
        companyName: m.company.name,
        taxId: m.company.taxId,
        role: m.role,
        membershipId: m.id,
      })),
    };
  }

  // Cross-domain cookies on Railway (web on one *.up.railway.app, API on another)
  // require SameSite=None + Secure. SameSite=None without Secure is rejected by
  // browsers, so on localhost HTTP we fall back to SameSite=Lax + Secure=false.
  // domain is left undefined on purpose so the browser scopes the cookie to the
  // API host that set it — a COOKIE_DOMAIN override would break cross-site auth.
  private setAccessTokenCookie(response: Response, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    response.cookie('access_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: undefined,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    });
  }

  private setRefreshTokenCookie(response: Response, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth/refresh',
    });
  }
}
