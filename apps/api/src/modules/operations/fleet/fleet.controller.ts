import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { VehicleSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { FleetService } from './fleet.service';

@Controller('operations/fleet/vehicles')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', VehicleSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.fleetService.findAll(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', VehicleSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.fleetService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', VehicleSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateVehicleDto,
  ) {
    return this.fleetService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', VehicleSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.fleetService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', VehicleSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.fleetService.remove(id, companyId, user.id);
  }
}
