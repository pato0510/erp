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
import { EmployeeCompensationSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SettlementStatusDto } from './dto/settlement-status.dto';
import { UpdateSettlementDto } from './dto/update-settlement.dto';
import { SettlementsService } from './settlements.service';

/* HR-009 — registro de remuneraciones. THE SALARY GUARD, mirroring HR-003/HR-006:
 *  - PER-PERSON READ endpoints (list, get) gate on `read` EmployeeCompensation →
 *    MANAGER/ADMIN/SUPER_ADMIN and the read-only ACCOUNTANT (full financial
 *    visibility) get 200; VIEWER/ANALYST lack read → 403.
 *  - WRITE endpoints (create, status, patch, delete) gate on `update`
 *    EmployeeCompensation → MANAGER/ADMIN/SUPER_ADMIN only; ACCOUNTANT 403
 *    (strictly read-only — settlements are produced externally and only loaded
 *    into Excelsia); VIEWER/ANALYST 403.
 *  - The AGGREGATE endpoint gates on `read` only → ACCOUNTANT 200 (totals only,
 *    NEVER per-person rows), VIEWER/ANALYST 403.
 * Every endpoint declares @CheckPolicies (PoliciesGuard allows handler-less
 * routes). The literal `aggregate` segment is declared before `:id`. */
@Controller('rrhh/settlements')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EmployeeCompensationSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('employeeId') employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.service.findAll(companyId, employeeId, year ? Number(year) : undefined);
  }

  /* AGGREGATE — read-only guard (ACCOUNTANT allowed). Declared before `:id`. */
  @Get('aggregate')
  @CheckPolicies((ability) => ability.can('read', EmployeeCompensationSubject))
  aggregate(
    @CurrentCompany() companyId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = year ? Number(year) : now.getUTCFullYear();
    const m = month ? Number(month) : now.getUTCMonth() + 1;
    return this.service.aggregate(companyId, y, m);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', EmployeeCompensationSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('update', EmployeeCompensationSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSettlementDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Post(':id/status')
  @CheckPolicies((ability) => ability.can('update', EmployeeCompensationSubject))
  setStatus(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SettlementStatusDto,
  ) {
    return this.service.setStatus(id, companyId, user.id, dto.status);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeCompensationSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeCompensationSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
