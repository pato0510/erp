import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LocationSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

@Controller('operations/locations')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', LocationSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.locationsService.findAll(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', LocationSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.locationsService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', LocationSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', LocationSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', LocationSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.locationsService.remove(id, companyId, user.id);
  }
}
