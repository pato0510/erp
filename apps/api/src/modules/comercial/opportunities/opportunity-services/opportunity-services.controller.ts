import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpportunitySubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { AddOpportunityServiceDto } from './dto/add-opportunity-service.dto';
import { OpportunityServicesService } from './opportunity-services.service';
import { UpdateOpportunityServiceDto } from './dto/update-opportunity-service.dto';

/* COM-006 — the opportunity's service bundle, as a SUB-RESOURCE of opportunities
 * (…/opportunities/:opportunityId/services). It reuses OpportunitySubject (NO new
 * CASL subject — bundle lines are part of the opportunity, same precedent as RRHH
 * settlements reusing EmployeeCompensationSubject). READ (list) gates on
 * `read OpportunitySubject` → MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; every MUTATION
 * (add/edit/remove) gates on `update OpportunitySubject` (editing an opportunity's
 * bundle = updating the opportunity) → MANAGER/ADMIN/SUPER_ADMIN only, so ACCOUNTANT
 * reads the bundle but cannot mutate it and ANALYST/VIEWER stay floored. Every
 * endpoint declares @CheckPolicies (PoliciesGuard fails OPEN). */
@Controller('comercial/opportunities/:opportunityId/services')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OpportunityServicesController {
  constructor(private readonly service: OpportunityServicesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', OpportunitySubject))
  findAll(@Param('opportunityId') opportunityId: string, @CurrentCompany() companyId: string) {
    return this.service.findAll(companyId, opportunityId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  add(
    @Param('opportunityId') opportunityId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddOpportunityServiceDto,
  ) {
    return this.service.add(companyId, user.id, opportunityId, dto);
  }

  @Patch(':lineId')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  update(
    @Param('opportunityId') opportunityId: string,
    @Param('lineId') lineId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateOpportunityServiceDto,
  ) {
    return this.service.update(companyId, user.id, opportunityId, lineId, dto);
  }

  @Delete(':lineId')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  remove(
    @Param('opportunityId') opportunityId: string,
    @Param('lineId') lineId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(companyId, user.id, opportunityId, lineId);
  }
}
