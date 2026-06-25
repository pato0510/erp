import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PayrollParameterSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateAfpRateDto } from './dto/create-afp-rate.dto';
import { CreateParameterSetDto } from './dto/create-parameter-set.dto';
import { UpdateAfpRateDto } from './dto/update-afp-rate.dto';
import { UpdateParameterSetDto } from './dto/update-parameter-set.dto';
import { PayrollParametersService } from './payroll-parameters.service';

/* HR-008 — payroll parameter sets + AFP rates (company-level config). Every
 * endpoint declares @CheckPolicies on PayrollParameterSubject (PoliciesGuard
 * allows handler-less routes, so absence of the decorator would mean "open" —
 * hence every one declares it). read⟺manage in the current RBAC
 * (MANAGER/ADMIN/SUPER_ADMIN; ACCOUNTANT/ANALYST/VIEWER get 403). Literal
 * segments (current, seed-2026, afp/...) are declared before the `:id` routes. */
@Controller('rrhh/payroll-parameters')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PayrollParametersController {
  constructor(private readonly service: PayrollParametersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', PayrollParameterSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.service.findAll(companyId);
  }

  @Get('current')
  @CheckPolicies((ability) => ability.can('read', PayrollParameterSubject))
  getCurrent(@CurrentCompany() companyId: string) {
    return this.service.getCurrent(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', PayrollParameterSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', PayrollParameterSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateParameterSetDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Post('seed-2026')
  @CheckPolicies((ability) => ability.can('create', PayrollParameterSubject))
  seed2026(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seed2026(companyId, user.id);
  }

  @Post(':id/afp')
  @CheckPolicies((ability) => ability.can('update', PayrollParameterSubject))
  addAfp(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAfpRateDto,
  ) {
    return this.service.addAfp(id, companyId, user.id, dto);
  }

  @Patch('afp/:afpId')
  @CheckPolicies((ability) => ability.can('update', PayrollParameterSubject))
  updateAfp(
    @Param('afpId') afpId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAfpRateDto,
  ) {
    return this.service.updateAfp(afpId, companyId, user.id, dto);
  }

  @Delete('afp/:afpId')
  @CheckPolicies((ability) => ability.can('update', PayrollParameterSubject))
  removeAfp(
    @Param('afpId') afpId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.removeAfp(afpId, companyId, user.id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', PayrollParameterSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateParameterSetDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }
}
