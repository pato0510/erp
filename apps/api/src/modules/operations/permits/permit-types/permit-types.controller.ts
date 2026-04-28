import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PermitTypeSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { CreatePermitTypeDto } from './dto/create-permit-type.dto';
import { UpdatePermitTypeDto } from './dto/update-permit-type.dto';
import { PermitTypesService } from './permit-types.service';

@Controller('operations/permit-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PermitTypesController {
  constructor(private readonly service: PermitTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', PermitTypeSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.service.findAll(companyId);
  }

  /* Helper kept on the same controller to avoid a route file split.
     Declared before `:id` so the literal segment matches first. */
  @Post('seed-defaults')
  @CheckPolicies((ability) => ability.can('create', PermitTypeSubject))
  seedDefaults(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedDefaults(companyId, user.id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', PermitTypeSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', PermitTypeSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePermitTypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', PermitTypeSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePermitTypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', PermitTypeSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
