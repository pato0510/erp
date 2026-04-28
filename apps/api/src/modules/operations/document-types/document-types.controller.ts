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
import { DocumentTypeSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DocumentTypesService } from './document-types.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { FilterDocumentTypesDto } from './dto/filter-document-types.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

@Controller('operations/document-types')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DocumentTypesController {
  constructor(private readonly service: DocumentTypesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', DocumentTypeSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterDocumentTypesDto) {
    return this.service.findAll(companyId, filters);
  }

  /* `seed-defaults` is declared before `:id` so the literal path matches first.
     Restricted to admins via `manage` (only ADMIN/SUPER_ADMIN have it). */
  @Post('seed-defaults')
  @CheckPolicies((ability) => ability.can('manage', DocumentTypeSubject))
  seedDefaults(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.seedDefaults(companyId, user.id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', DocumentTypeSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', DocumentTypeSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDocumentTypeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', DocumentTypeSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', DocumentTypeSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
