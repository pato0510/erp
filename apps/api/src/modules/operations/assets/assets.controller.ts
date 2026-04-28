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
import { OperationalAssetSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { FilterAssetsDto } from './dto/filter-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Controller('operations/assets')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterAssetsDto) {
    return this.assetsService.findAll(companyId, filters);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.assetsService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', OperationalAssetSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetsService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', OperationalAssetSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', OperationalAssetSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assetsService.remove(id, companyId, user.id);
  }
}
