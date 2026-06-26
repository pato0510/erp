import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TerminationSimulationSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateTerminationDto } from './dto/create-termination.dto';
import { EstimateTerminationDto } from './dto/estimate-termination.dto';
import { TerminationsService } from './terminations.service';

/* HR-010 — finiquito estimación + registro. THE SALARY GUARD (finiquito amounts
 * are sensitive), mirroring HR-009: read-type endpoints (estimate, list, get)
 * gate on `read` AND `update` TerminationSimulation — MANAGER/ADMIN/SUPER_ADMIN
 * have both (manage all); ACCOUNTANT holds read-only on the compensation subjects
 * → fails the `update` check → 403; VIEWER/ANALYST have neither → 403. Write
 * endpoints gate on `update`. Every endpoint declares @CheckPolicies (PoliciesGuard
 * allows handler-less routes). Note: /estimate is gated read-side because it is a
 * CALCULATION over guarded data, but it is EPHEMERAL and persists nothing. */
@Controller('rrhh/terminations')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TerminationsController {
  constructor(private readonly service: TerminationsService) {}

  /* EPHEMERAL calculator — runs computeFiniquito and returns the breakdown +
     disclaimer. Does NOT write. Declared before `:id` (literal segment). */
  @Post('estimate')
  @CheckPolicies(
    (ability) => ability.can('read', TerminationSimulationSubject),
    (ability) => ability.can('update', TerminationSimulationSubject),
  )
  estimate(@CurrentCompany() companyId: string, @Body() dto: EstimateTerminationDto) {
    return this.service.estimate(companyId, dto);
  }

  @Get()
  @CheckPolicies(
    (ability) => ability.can('read', TerminationSimulationSubject),
    (ability) => ability.can('update', TerminationSimulationSubject),
  )
  findAll(@CurrentCompany() companyId: string, @Query('employeeId') employeeId: string) {
    return this.service.findAll(companyId, employeeId);
  }

  @Get(':id')
  @CheckPolicies(
    (ability) => ability.can('read', TerminationSimulationSubject),
    (ability) => ability.can('update', TerminationSimulationSubject),
  )
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  /* PERSIST the finiquito (the deliberate "registrar finiquito" action). */
  @Post()
  @CheckPolicies((ability) => ability.can('update', TerminationSimulationSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateTerminationDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Post(':id/anular')
  @CheckPolicies((ability) => ability.can('update', TerminationSimulationSubject))
  anular(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.anular(id, companyId, user.id);
  }
}
