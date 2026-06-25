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
import { EmployeeContractSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEmployeeContractDto } from './dto/create-employee-contract.dto';
import { TerminateContractDto } from './dto/terminate-contract.dto';
import { UpdateEmployeeContractDto } from './dto/update-employee-contract.dto';
import { EmployeeContractsService } from './employee-contracts.service';

/* HR-007 — employee contracts + anexos. PoliciesGuard fails CLOSED when a
 * declared policy is unsatisfied (403), but ALLOWS a route that declares no
 * @CheckPolicies — so EVERY endpoint below declares one. In the current RBAC
 * read⟺manage for EmployeeContract (MANAGER/ADMIN/SUPER_ADMIN; ACCOUNTANT/
 * ANALYST/VIEWER get 403), so the frontend gates its actions on whether the
 * list GET succeeds. */
@Controller('rrhh/contracts')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EmployeeContractsController {
  constructor(private readonly service: EmployeeContractsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EmployeeContractSubject))
  findAll(@CurrentCompany() companyId: string, @Query('employeeId') employeeId: string) {
    return this.service.findAll(companyId, employeeId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', EmployeeContractSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EmployeeContractSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEmployeeContractDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeContractSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeContractDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Post(':id/terminate')
  @CheckPolicies((ability) => ability.can('update', EmployeeContractSubject))
  terminate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: TerminateContractDto,
  ) {
    return this.service.terminate(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', EmployeeContractSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
