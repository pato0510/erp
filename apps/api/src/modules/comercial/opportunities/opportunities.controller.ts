import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpportunityStage } from '@prisma/client';
import { OpportunitySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ChangeStageDto } from './dto/change-stage.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { OpportunitiesService } from './opportunities.service';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

/* COM-005 — opportunities CRUD + stage transitions (the pipeline). EVERY endpoint
 * declares @CheckPolicies on OpportunitySubject (PoliciesGuard fails OPEN). READ:
 * MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE (create/update/stage/reopen/resume/
 * delete): MANAGER/ADMIN/SUPER_ADMIN. Stage changes are the CANONICAL path
 * (PATCH /:id/stage); the general PATCH /:id REJECTS stage edits so the transition
 * rules cannot be bypassed. DELETE is allowed only for non-closed opportunities.
 * Writes run through executeWithRls. */
@Controller('comercial/opportunities')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', OpportunitySubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('stage') stage?: string,
    @Query('accountId') accountId?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.findAll(companyId, {
      stage: stage ? (stage as OpportunityStage) : undefined,
      accountId: accountId || undefined,
      ownerId: ownerId || undefined,
    });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', OpportunitySubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', OpportunitySubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOpportunityDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  /* Canonical stage-transition path — all pipeline rules enforced here. */
  @Patch(':id/stage')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  changeStage(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeStageDto,
  ) {
    return this.service.changeStage(id, companyId, user.id, dto);
  }

  /* Resume a paused opportunity to its previousStage. */
  @Post(':id/resume')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  resume(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.resume(id, companyId, user.id);
  }

  /* Reopen a closed (GANADA/PERDIDA) opportunity back to NEGOCIACION. */
  @Post(':id/reopen')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  reopen(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.reopen(id, companyId, user.id);
  }

  /* COM-013b — send a WON opportunity to Operaciones (validates the critical rule, emits
     the handoff event; the ServiceOrder is created ASYNCHRONOUSLY by the Operaciones
     listener). Writers only (update OpportunitySubject) — ACCOUNTANT cannot trigger. */
  @Post(':id/handoff')
  @CheckPolicies((ability) => ability.can('update', OpportunitySubject))
  handoff(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.sendToOperations(companyId, user.id, id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', OpportunitySubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
