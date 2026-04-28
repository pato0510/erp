import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProcedureSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateProcedureDto } from './dto/create-procedure.dto';
import { FilterProceduresDto } from './dto/filter-procedures.dto';
import { CreateNewVersionDto } from './dto/new-version-procedure.dto';
import { UpdateProcedureDto } from './dto/update-procedure.dto';
import {
  AddAttachmentDto,
  DeprecateProcedureDto,
  PublishProcedureDto,
  ReviewProcedureDto,
} from './dto/workflow.dto';
import { ProceduresService } from './procedures.service';

const MAIN_FILE_MAX_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

@Controller('operations/procedures')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class ProceduresController {
  constructor(private readonly service: ProceduresService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query() filters: FilterProceduresDto,
  ) {
    return this.service.findAll(companyId, user.id, filters);
  }

  /* Literal segments first to win the route match. */
  @Get('kpi')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  kpi(@CurrentCompany() companyId: string) {
    return this.service.getKpiCounts(companyId);
  }

  @Get('category-counts')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  categoryCounts(@CurrentCompany() companyId: string) {
    return this.service.getCategoryCounts(companyId);
  }

  @Get('applicable')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  applicable(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Query('assetId') assetId?: string,
  ) {
    return this.service.getApplicable(companyId, user.id, assetId);
  }

  @Get(':id/file')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  async downloadFile(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadFile(id, companyId);
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(file.buffer);
  }

  @Get(':id/attachments/:attachmentIndex')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentIndex', ParseIntPipe) attachmentIndex: number,
    @CurrentCompany() companyId: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadAttachment(id, companyId, attachmentIndex);
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(file.buffer);
  }

  @Get(':id/revisions')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  revisions(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.getRevisions(id, companyId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', ProcedureSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', ProcedureSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAIN_FILE_MAX_BYTES } }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateProcedureDto,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo principal.');
    return this.service.create(companyId, user.id, dto, file);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', ProcedureSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProcedureDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', ProcedureSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }

  @Post(':id/submit')
  @CheckPolicies((ability) => ability.can('update', ProcedureSubject))
  submit(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.submitForReview(id, companyId, user.id);
  }

  @Post(':id/review')
  @CheckPolicies((ability) => ability.can('review', ProcedureSubject))
  review(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ReviewProcedureDto,
  ) {
    return this.service.review(id, companyId, user.id, dto);
  }

  @Post(':id/publish')
  @CheckPolicies((ability) => ability.can('publish', ProcedureSubject))
  publish(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: PublishProcedureDto,
  ) {
    return this.service.publish(id, companyId, user.id, dto);
  }

  @Post(':id/new-version')
  @CheckPolicies((ability) => ability.can('create', ProcedureSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAIN_FILE_MAX_BYTES } }))
  newVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateNewVersionDto,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo principal de la nueva versión.');
    return this.service.createNewVersion(id, companyId, user.id, dto, file);
  }

  @Post(':id/deprecate')
  @CheckPolicies((ability) => ability.can('deprecate', ProcedureSubject))
  deprecate(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: DeprecateProcedureDto,
  ) {
    return this.service.deprecate(id, companyId, user.id, dto);
  }

  @Post(':id/attachments')
  @CheckPolicies((ability) => ability.can('update', ProcedureSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES } }))
  addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    return this.service.addAttachment(id, companyId, user.id, file, dto);
  }

  @Delete(':id/attachments/:attachmentIndex')
  @CheckPolicies((ability) => ability.can('update', ProcedureSubject))
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentIndex', ParseIntPipe) attachmentIndex: number,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.removeAttachment(id, companyId, user.id, attachmentIndex);
  }
}
