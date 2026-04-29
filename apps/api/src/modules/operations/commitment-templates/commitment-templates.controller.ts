import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommitmentTemplateSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CommitmentTemplatesService } from './commitment-templates.service';
import {
  CreateCommitmentTemplateDto,
  FilterCommitmentTemplatesDto,
  UpdateCommitmentTemplateDto,
} from './dto/commitment-template.dto';

@Controller('operations/commitment-templates')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CommitmentTemplatesController {
  constructor(private readonly service: CommitmentTemplatesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', CommitmentTemplateSubject))
  list(
    @CurrentCompany() companyId: string,
    @Query('scope') scope?: string,
    @Query('isActive') isActive?: string,
  ) {
    const filters: FilterCommitmentTemplatesDto = {};
    if (scope === 'documents' || scope === 'permits' || scope === 'all') filters.scope = scope;
    if (isActive === 'true') filters.isActive = true;
    if (isActive === 'false') filters.isActive = false;
    return this.service.findAll(companyId, filters);
  }

  @Get('estimate/document/:documentTypeId')
  @CheckPolicies((ability) => ability.can('read', CommitmentTemplateSubject))
  async estimateDocument(
    @CurrentCompany() companyId: string,
    @Param('documentTypeId') documentTypeId: string,
  ) {
    const result = await this.service.estimateForDocument(companyId, documentTypeId);
    if (!result) throw new NotFoundException('No hay plantilla ni histórico para este tipo.');
    return result;
  }

  @Get('estimate/permit/:permitTypeId')
  @CheckPolicies((ability) => ability.can('read', CommitmentTemplateSubject))
  async estimatePermit(
    @CurrentCompany() companyId: string,
    @Param('permitTypeId') permitTypeId: string,
  ) {
    const result = await this.service.estimateForPermit(companyId, permitTypeId);
    if (!result) throw new NotFoundException('No hay plantilla ni histórico para este tipo.');
    return result;
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', CommitmentTemplateSubject))
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.service.findOne(companyId, id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', CommitmentTemplateSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateCommitmentTemplateDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', CommitmentTemplateSubject))
  update(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCommitmentTemplateDto,
  ) {
    return this.service.update(companyId, user.id, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', CommitmentTemplateSubject))
  remove(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.service.remove(companyId, user.id, id);
  }
}
