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
import { EmployeeDocumentSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEmployeeDocumentRequirementDto } from './dto/create-employee-document-requirement.dto';
import { UpdateEmployeeDocumentRequirementDto } from './dto/update-employee-document-requirement.dto';
import { EmployeeDocumentRequirementsService } from './employee-document-requirements.service';

/* HR-004a — the documents-required matrix (employee > jobPosition). Every
   endpoint gates on EmployeeDocumentSubject. */
@Controller('rrhh/document-requirements')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EmployeeDocumentRequirementsController {
  constructor(private readonly service: EmployeeDocumentRequirementsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('employeeId') employeeId?: string,
    @Query('jobPositionId') jobPositionId?: string,
    @Query('documentTypeId') documentTypeId?: string,
  ) {
    return this.service.findAll(companyId, { employeeId, jobPositionId, documentTypeId });
  }

  /* Effective required documents for one employee (employee > jobPosition).
     Declared before `:id` so the literal `/resolve` segment matches first. */
  @Get('resolve/:employeeId')
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  resolve(@Param('employeeId') employeeId: string, @CurrentCompany() companyId: string) {
    return this.service.resolveRequirementsForEmployee(companyId, employeeId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EmployeeDocumentSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEmployeeDocumentRequirementDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EmployeeDocumentSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDocumentRequirementDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', EmployeeDocumentSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
