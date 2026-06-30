import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AreaRRHH, EmployeeStatus } from '@prisma/client';
import {
  EmployeeCompensationSubject,
  EmployeeSubject,
} from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpsertCompensationDto } from './dto/upsert-compensation.dto';
import { EmployeesService } from './employees.service';

/* HR-003 — employees + the guarded compensation sub-resource. EVERY endpoint
 * declares @CheckPolicies (PoliciesGuard fails OPEN). The employee list/ficha
 * payloads NEVER contain salary/bank (separate table + endpoint, see service).
 * Per-person compensation READ (the GET) gates on `read` EmployeeCompensation:
 * MANAGER/ADMIN/SUPER_ADMIN and the read-only ACCOUNTANT (full financial
 * visibility) get 200; VIEWER/ANALYST lack read → 403. Compensation WRITE (the
 * PUT) gates on `update`, so it stays MANAGER/ADMIN/SUPER_ADMIN only and the
 * ACCOUNTANT is 403 — settlements are loaded externally, never edited in-app. */
@Controller('rrhh/employees')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EmployeeSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('area') area?: string,
    @Query('status') status?: string,
    @Query('jobPositionId') jobPositionId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(companyId, {
      area: area ? (area as AreaRRHH) : undefined,
      status: status ? (status as EmployeeStatus) : undefined,
      jobPositionId,
      search,
    });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', EmployeeSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EmployeeSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', EmployeeSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }

  // ── Compensation: separate, role-restricted sub-resource ──
  @Get(':id/compensation')
  @CheckPolicies((ability) => ability.can('read', EmployeeCompensationSubject))
  getCompensation(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.getCompensation(id, companyId);
  }

  @Put(':id/compensation')
  @CheckPolicies((ability) => ability.can('update', EmployeeCompensationSubject))
  upsertCompensation(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpsertCompensationDto,
  ) {
    return this.service.upsertCompensation(id, companyId, user.id, dto);
  }
}
