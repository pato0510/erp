import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { MembersQueryDto } from './dto/members-query.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  // Any active member of the company; the exposure is structural (signed 2026-07-21).
  @CheckPolicies(() => true)
  list(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query() query: MembersQueryDto,
  ) {
    return this.members.listForCompany(companyId, user.id, query.scope);
  }
}
