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
import { AssetTypeSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { AssetSubtypesService } from './asset-subtypes.service';
import { CreateAssetSubtypeDto } from './dto/create-asset-subtype.dto';
import { FilterAssetSubtypesDto } from './dto/filter-asset-subtypes.dto';
import { UpdateAssetSubtypeDto } from './dto/update-asset-subtype.dto';

/* Subtypes are managed under the same CASL subject as their parent type
   (AssetTypeSubject) — they're a structural detail of the type, not an
   independently authorizable resource. */
@Controller('operations/asset-subtypes')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AssetSubtypesController {
  constructor(private readonly service: AssetSubtypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AssetTypeSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterAssetSubtypesDto) {
    return this.service.findAll(companyId, filters);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', AssetTypeSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', AssetTypeSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAssetSubtypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', AssetTypeSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAssetSubtypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', AssetTypeSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
