import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

const VERSION = process.env.APP_VERSION || '1.0.0';

// Public, unauthenticated, unthrottled — monitoring tooling (uptime checks,
// k8s liveness/readiness probes) hits this frequently and must never be
// blocked by per-IP limits or token expiry.
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: VERSION,
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
