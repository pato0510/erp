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
import { DocumentRequirementSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DocumentRequirementsService } from './document-requirements.service';
import { CreateDocumentRequirementDto } from './dto/create-document-requirement.dto';
import { FilterDocumentRequirementsDto } from './dto/filter-document-requirements.dto';
import { UpdateDocumentRequirementDto } from './dto/update-document-requirement.dto';

@Controller('operations/document-requirements')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DocumentRequirementsController {
  constructor(private readonly service: DocumentRequirementsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', DocumentRequirementSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterDocumentRequirementsDto) {
    return this.service.findAll(companyId, filters);
  }

  /* `resolve/:assetId` is declared before `:id` so the literal path matches
     first; otherwise NestJS would route /resolve/<uuid> to findOne. */
  @Get('resolve/:assetId')
  @CheckPolicies((ability) => ability.can('read', DocumentRequirementSubject))
  resolve(@Param('assetId') assetId: string, @CurrentCompany() companyId: string) {
    return this.service.resolveRequirementsForAsset(companyId, assetId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', DocumentRequirementSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', DocumentRequirementSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDocumentRequirementDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', DocumentRequirementSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateDocumentRequirementDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', DocumentRequirementSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
