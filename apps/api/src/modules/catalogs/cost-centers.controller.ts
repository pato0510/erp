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
import { CostCentersService } from './cost-centers.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CostCenterSubject } from '../common/casl/casl-ability.factory';

@Controller('cost-centers')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CostCenterSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.costCentersService.findAll(companyId, search, isActive === 'false' ? false : true);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CostCenterSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.costCentersService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CostCenterSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCostCenterDto,
  ) {
    return this.costCentersService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CostCenterSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateCostCenterDto,
  ) {
    return this.costCentersService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CostCenterSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.costCentersService.deactivate(id, companyId, user.id);
  }
}
