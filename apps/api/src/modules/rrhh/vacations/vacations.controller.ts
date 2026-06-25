import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { VacationRequestSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateVacationRequestDto } from './dto/create-vacation-request.dto';
import { RejectVacationDto } from './dto/reject-vacation.dto';
import { UpdateVacationRequestDto } from './dto/update-vacation-request.dto';
import { VacationSettingsDto } from './dto/vacation-settings.dto';
import { VacationsService } from './vacations.service';

/* HR-011 — vacaciones / feriado legal. PoliciesGuard fails CLOSED when a declared
 * policy is unsatisfied (403), but allows a route with NO @CheckPolicies — so
 * EVERY endpoint declares one on VacationRequest. read⟺manage in the current RBAC
 * (MANAGER/ADMIN/SUPER_ADMIN; ACCOUNTANT/ANALYST/VIEWER get 403), so the frontend
 * gates its actions on whether the list/balance GET succeeds. */
@Controller('rrhh/vacations')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class VacationsController {
  constructor(private readonly service: VacationsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', VacationRequestSubject))
  findAll(@CurrentCompany() companyId: string, @Query('employeeId') employeeId: string) {
    return this.service.findAll(companyId, employeeId);
  }

  /* Literal segments declared before `:id` so they match first. */
  @Get('balance/:employeeId')
  @CheckPolicies((ability) => ability.can('read', VacationRequestSubject))
  getBalance(@Param('employeeId') employeeId: string, @CurrentCompany() companyId: string) {
    return this.service.getBalance(companyId, employeeId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', VacationRequestSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', VacationRequestSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateVacationRequestDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch('settings/:employeeId')
  @CheckPolicies((ability) => ability.can('update', VacationRequestSubject))
  setSettings(
    @Param('employeeId') employeeId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: VacationSettingsDto,
  ) {
    return this.service.setSettings(employeeId, companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', VacationRequestSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateVacationRequestDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Post(':id/approve')
  @CheckPolicies((ability) => ability.can('update', VacationRequestSubject))
  approve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.approve(id, companyId, user.id);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('update', VacationRequestSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectVacationDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/cancel')
  @CheckPolicies((ability) => ability.can('update', VacationRequestSubject))
  cancel(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.cancel(id, companyId, user.id);
  }

  @Post(':id/mark-taken')
  @CheckPolicies((ability) => ability.can('update', VacationRequestSubject))
  markTaken(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.markTaken(id, companyId, user.id);
  }
}
