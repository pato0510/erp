import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { isObservable, lastValueFrom } from 'rxjs';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../../common/decorators/allow-pending-password-change.decorator';
import { passwordChangeRequiredException } from '../password-change-required.exception';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await super.canActivate(context);
    const authenticated = isObservable(result) ? await lastValueFrom(result) : result;
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { mustChangePassword?: boolean } | undefined;
    if (
      user?.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw passwordChangeRequiredException();
    }
    return authenticated;
  }
}
