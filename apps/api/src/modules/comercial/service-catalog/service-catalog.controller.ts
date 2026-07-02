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
import { ServiceCategory } from '@prisma/client';
import { ServiceCatalogSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateServiceCatalogDto } from './dto/create-service-catalog.dto';
import { UpdateServiceCatalogDto } from './dto/update-service-catalog.dto';
import { ServiceCatalogService } from './service-catalog.service';

/* COM-002 — service_catalog CRUD. EVERY endpoint declares @CheckPolicies on
 * ServiceCatalogSubject (PoliciesGuard fails OPEN — a bare route would be
 * authorized-by-default). READ is open to every role (non-sensitive shared
 * catalog); WRITE (create/update/delete) is MANAGER/ADMIN/SUPER_ADMIN only. The
 * DELETE is a soft-deactivate (isActive=false) because later COM tickets FK
 * opportunity_services / quote_lines to these rows. Writes run through
 * executeWithRls; reads are company-scoped. */
@Controller('comercial/service-catalog')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ServiceCatalogController {
  constructor(private readonly service: ServiceCatalogService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', ServiceCatalogSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('category') category?: string,
    @Query('active') active?: string,
  ) {
    return this.service.findAll(companyId, {
      category: category ? (category as ServiceCategory) : undefined,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', ServiceCatalogSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', ServiceCatalogSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateServiceCatalogDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', ServiceCatalogSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateServiceCatalogDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', ServiceCatalogSubject))
  deactivate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deactivate(id, companyId, user.id);
  }
}
