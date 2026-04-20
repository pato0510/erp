import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshGuard } from './guards/refresh.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MovementSubject } from '../common/casl/casl-ability.factory';

// Auth endpoints get stricter per-IP rate limits than the global 100/min
// default — brute-force on login or token refresh is the most common attack
// path. See AppModule for the global ThrottlerGuard registration.
const LOGIN_LIMIT = { default: { limit: 5, ttl: 60000 } };
const REFRESH_LIMIT = { default: { limit: 10, ttl: 60000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle(LOGIN_LIMIT)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(req.user as { id: string; email: string }, res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as { id: string };
    await this.authService.logout(user.id, res);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  @Throttle(REFRESH_LIMIT)
  @UseGuards(RefreshGuard)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as { id: string; refreshToken: string };
    return this.authService.refresh(user.id, user.refreshToken, res);
  }

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  @Get('test-permissions')
  testPermissions() {
    return { canReadMovements: true };
  }
}
