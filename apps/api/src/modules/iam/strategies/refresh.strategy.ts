import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh') {
  constructor() {
    super({
      jwtFromRequest: (req: Request) => req?.cookies?.['refresh_token'] || null,
      ignoreExpiration: false,
      secretOrKey: process.env.REFRESH_TOKEN_SECRET,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string; email: string }) {
    const refreshToken = req.cookies['refresh_token'];
    return { id: payload.sub, email: payload.email, refreshToken };
  }
}
