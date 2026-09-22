import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: (req: Request) => req?.cookies?.['access_token'] || null,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string; tv?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, tokenVersion: true, mustChangePassword: true },
    });
    if (!user || !user.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: payload.email, mustChangePassword: user.mustChangePassword };
  }
}
