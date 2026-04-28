import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AssetTypeSubject } from '../../common/casl/casl-ability.factory';
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
