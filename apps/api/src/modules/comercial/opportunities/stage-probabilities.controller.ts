import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { OpportunitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { UpdateStageProbabilitiesDto } from './dto/stage-probabilities.dto';
import { StageProbabilitiesService } from './stage-probabilities.service';

@Controller('comercial/stage-probabilities')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class StageProbabilitiesController {
  constructor(private readonly service: StageProbabilitiesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', OpportunitySubject))
  findAll(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.findAll(companyId, user.id);
  }

  @Put()
  @CheckPolicies((ability) => ability.can('manage', OpportunitySubject))
  update(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateStageProbabilitiesDto,
  ) {
    return this.service.update(companyId, user.id, dto);
  }
}
