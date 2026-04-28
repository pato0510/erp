import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AssetExceptionSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ApproveExceptionDto } from './dto/approve-exception.dto';
import { FilterExceptionsDto } from './dto/filter-exceptions.dto';
import { RejectExceptionDto } from './dto/reject-exception.dto';
import { RequestExceptionDto } from './dto/request-exception.dto';
import { RevokeExceptionDto } from './dto/revoke-exception.dto';
import { ExceptionsService } from './exceptions.service';

@Controller('operations/exceptions')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ExceptionsController {
  constructor(private readonly service: ExceptionsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', AssetExceptionSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterExceptionsDto) {
    return this.service.findAll(companyId, filters);
  }

  /* Helper for the sidebar badge — declared before `:id`. */
  @Get('pending-count')
  @CheckPolicies((ability) => ability.can('read', AssetExceptionSubject))
  pendingCount(@CurrentCompany() companyId: string) {
    return this.service.getPendingCount(companyId);
  }

  @Get('active-for-asset/:assetId')
  @CheckPolicies((ability) => ability.can('read', AssetExceptionSubject))
  activeForAsset(@Param('assetId') assetId: string, @CurrentCompany() companyId: string) {
    return this.service.getActiveForAsset(companyId, assetId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', AssetExceptionSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', AssetExceptionSubject))
  request(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RequestExceptionDto,
  ) {
    return this.service.requestException(companyId, user.id, dto);
  }

  /* OPS-023 — approve/reject/revoke share the `manage` umbrella; the
     dedicated CASL actions exist so we can grant them to non-ADMIN
     roles in the future without widening `manage`. For now ADMIN is
     the only role with `manage 'all'` and therefore the only one that
     can pass these gates. */
  @Post(':id/approve')
  @CheckPolicies((ability) => ability.can('approve', AssetExceptionSubject))
  approve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ApproveExceptionDto,
  ) {
    return this.service.approve(id, companyId, user.id, dto);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('reject', AssetExceptionSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectExceptionDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/revoke')
  @CheckPolicies((ability) => ability.can('revoke', AssetExceptionSubject))
  revoke(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RevokeExceptionDto,
  ) {
    return this.service.revoke(id, companyId, user.id, dto);
  }
}
