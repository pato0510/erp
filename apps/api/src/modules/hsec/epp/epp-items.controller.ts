import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { HsecEppItemSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEppItemDto } from './dto/create-epp-item.dto';
import { UpdateEppItemDto } from './dto/update-epp-item.dto';
import { EppItemsService } from './epp-items.service';

/* HSEC-008 — the EPP catalog. EVERY endpoint declares @CheckPolicies on HsecEppItemSubject
 * (PoliciesGuard fails OPEN). Uniform founder-signed matrix: MANAGER full CRUD,
 * ADMIN/SUPER_ADMIN via `manage all`, everyone else floored. */
@Controller('hsec/epp-items')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EppItemsController {
  constructor(private readonly service: EppItemsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', HsecEppItemSubject))
  findAll(@CurrentCompany() companyId: string) {
    return this.service.findAll(companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', HsecEppItemSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEppItemDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  /* OPS-004 pattern — idempotent; safe to call repeatedly. */
  @Post('seed-defaults')
  @CheckPolicies((ability) => ability.can('create', HsecEppItemSubject))
  seedDefaults(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedDefaults(companyId, user.id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', HsecEppItemSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEppItemDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  /* PRISTINE ONLY — a referenced item 409s (inactivate instead). */
  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', HsecEppItemSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
