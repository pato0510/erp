import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  AssetTypeSubject,
  DocumentRequirementSubject,
} from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AssetTypesService } from './asset-types.service';
import { CreateAssetTypeDto } from './dto/create-asset-type.dto';
import { UpdateAssetTypeDto } from './dto/update-asset-type.dto';

@Controller('operations/asset-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AssetTypesController {
  constructor(private readonly assetTypesService: AssetTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AssetTypeSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.assetTypesService.findAll(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', AssetTypeSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.assetTypesService.findOne(id, companyId);
  }

  /* Idempotent — applies the 4 Chilean vehicle DocumentRequirements to an
     existing VEHICLE-category AssetType. Returns counts so the UI can show
     a "X creados / Y ya existían / Z faltan" summary. */
  /* Gated on `create` for DocumentRequirementSubject because the action
     materializes new requirements. ADMIN gets it via `manage all`; MANAGER
     gets it via the explicit grant in CASL. Read on AssetTypeSubject is
     implicit since the user must have already loaded the type to call this. */
  @Post(':id/apply-vehicle-defaults')
  @CheckPolicies((ability) => ability.can('create', DocumentRequirementSubject))
  applyVehicleDefaults(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assetTypesService.applyVehicleDefaultsByTypeId(companyId, id, user.id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', AssetTypeSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAssetTypeDto,
  ) {
    return this.assetTypesService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', AssetTypeSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAssetTypeDto,
  ) {
    return this.assetTypesService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', AssetTypeSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assetTypesService.remove(id, companyId, user.id);
  }
}
