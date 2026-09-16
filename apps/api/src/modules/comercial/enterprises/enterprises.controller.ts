import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EnterpriseSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { UpdateEnterpriseDto } from './dto/update-enterprise.dto';
import { EnterprisesService } from './enterprises.service';

/* COM-018 — enterprises (the client's parent company; Enterprise ≠ Company, the tenant).
 * EVERY endpoint declares @CheckPolicies on EnterpriseSubject (PoliciesGuard fails OPEN).
 * Grants mirror AccountSubject — READ: MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT; WRITE
 * (create/update): MANAGER/ADMIN/SUPER_ADMIN. NO DELETE: deactivation is PATCH
 * isActive=false and linked accounts keep their link. Reads are company-scoped; writes
 * run through executeWithRls. */
@Controller('comercial/enterprises')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EnterprisesController {
  constructor(private readonly service: EnterprisesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', EnterpriseSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.findAll(companyId, {
      q: q || undefined,
      includeInactive: includeInactive === 'true',
    });
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EnterpriseSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEnterpriseDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', EnterpriseSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEnterpriseDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }
}
