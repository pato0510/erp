import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AppAbility } from '../casl/casl-ability.factory';

/* Returns the CASL ability that PoliciesGuard built for the authenticated caller
   and attached to the request (policies.guard.ts sets `request.ability` from
   membership.role via the same CaslAbilityFactory the @CheckPolicies gate uses).
   Available on any handler that runs AFTER PoliciesGuard with a @CheckPolicies
   decorator. Use it for per-caller PAYLOAD SHAPING only — never for access
   control, which stays in @CheckPolicies. */
export const CurrentAbility = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { ability?: AppAbility }>();
  return request.ability;
});
