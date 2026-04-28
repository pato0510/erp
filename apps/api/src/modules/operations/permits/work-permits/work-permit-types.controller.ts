import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { WorkPermitTypeSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { CreateWorkPermitTypeDto } from './dto/create-work-permit-type.dto';
import { UpdateWorkPermitTypeDto } from './dto/update-work-permit-type.dto';
import { WorkPermitTypesService } from './work-permit-types.service';

@Controller('operations/work-permit-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class WorkPermitTypesController {
  constructor(private readonly service: WorkPermitTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', WorkPermitTypeSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.service.findAll(companyId);
  }

  /* Literal segment declared first so it wins over `:id`. */
  @Post('seed-defaults')
  @CheckPolicies((ability) => ability.can('create', WorkPermitTypeSubject))
  seedDefaults(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedDefaults(companyId, user.id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', WorkPermitTypeSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', WorkPermitTypeSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateWorkPermitTypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', WorkPermitTypeSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateWorkPermitTypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', WorkPermitTypeSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
