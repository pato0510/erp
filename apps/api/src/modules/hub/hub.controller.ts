import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppAbility } from '../common/casl/casl-ability.factory';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { HubService } from './hub.service';

@Controller('hub')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class HubController {
  constructor(private readonly service: HubService) {}

  @Get('status')
  // Any authenticated, active company member; each module is gated in HubService.
  // The explicit policy makes PoliciesGuard validate membership and attach ability.
  @CheckPolicies(() => true)
  status(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.service.getStatus(companyId, user.id, ability);
  }
}
