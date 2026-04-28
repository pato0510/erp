import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DocumentRecordSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DocumentRecordsService } from './document-records.service';
import { FilterDocumentRecordsDto } from './dto/filter-documents.dto';

@Controller('operations/documents')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class DocumentRecordsController {
  constructor(private readonly service: DocumentRecordsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', DocumentRecordSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterDocumentRecordsDto) {
    return this.service.findAll(companyId, filters);
  }

  /* `compliance` is declared before `:id` so the literal path matches first;
     otherwise NestJS would route /compliance to findOne. */
  @Get('compliance')
  @CheckPolicies((ability) => ability.can('read', DocumentRecordSubject))
  getCompliance(@CurrentCompany() companyId: string) {
    return this.service.getCompliance(companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', DocumentRecordSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }
}
