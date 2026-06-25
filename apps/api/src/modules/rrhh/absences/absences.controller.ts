import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AbsenceCategory, AbsenceStatus } from '@prisma/client';
import { LeaveRequestSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AbsencesService } from './absences.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { RejectAbsenceDto } from './dto/reject-absence.dto';
import { UpdateAbsenceDto } from './dto/update-absence.dto';

/* HR-012 — ausencias (permisos + licencias, unified). Every endpoint declares
 * @CheckPolicies on LeaveRequestSubject (read⟺manage; ACCOUNTANT/ANALYST/VIEWER
 * get 403), so the frontend gates its actions on whether the list GET succeeds.
 * The availability endpoint is a SOFT read-only marker — it never touches
 * Operations. */
@Controller('rrhh/absences')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AbsencesController {
  constructor(private readonly service: AbsencesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', LeaveRequestSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('employeeId') employeeId: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(companyId, employeeId, {
      category: category ? (category as AbsenceCategory) : undefined,
      status: status ? (status as AbsenceStatus) : undefined,
    });
  }

  /* SOFT availability marker. Declared before `:id` so the literal segment wins. */
  @Get('availability/:employeeId')
  @CheckPolicies((ability) => ability.can('read', LeaveRequestSubject))
  getAvailability(
    @Param('employeeId') employeeId: string,
    @CurrentCompany() companyId: string,
    @Query('date') date?: string,
  ) {
    return this.service.getAvailability(companyId, employeeId, date);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', LeaveRequestSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', LeaveRequestSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAbsenceDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', LeaveRequestSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAbsenceDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Post(':id/approve')
  @CheckPolicies((ability) => ability.can('update', LeaveRequestSubject))
  approve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.approve(id, companyId, user.id);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('update', LeaveRequestSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectAbsenceDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/cancel')
  @CheckPolicies((ability) => ability.can('update', LeaveRequestSubject))
  cancel(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.cancel(id, companyId, user.id);
  }
}
