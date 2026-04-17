import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../decorators/check-policies.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers = this.reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, context.getHandler());
    if (!handlers || handlers.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { id: string } | undefined;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const companyId = request.headers['x-company-id'] as string | undefined;
    if (!companyId) {
      throw new ForbiddenException('x-company-id header is required');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!membership || !membership.isActive) {
      throw new ForbiddenException('No active membership for this company');
    }

    const ability = this.caslAbilityFactory.defineAbilityFor(membership.role);

    // Attach ability to request for use in controllers
    (request as Request & { ability: typeof ability }).ability = ability;

    const allowed = handlers.every((handler) => handler(ability));
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
