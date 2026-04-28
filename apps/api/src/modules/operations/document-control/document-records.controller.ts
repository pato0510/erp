import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { DocumentRecordSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { DocumentRecordsService } from './document-records.service';
import { ArchiveDocumentDto } from './dto/archive-document.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { FilterDocumentRecordsDto } from './dto/filter-documents.dto';
import { FilterPendingReviewDto } from './dto/filter-pending-review.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { SupersedeDocumentDto } from './dto/supersede-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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

  /* `pending-review/count` declared before `pending-review` so the more
     specific path wins; both must come before `:id` for the same reason. */
  @Get('pending-review/count')
  @CheckPolicies((ability) => ability.can('approve', DocumentRecordSubject))
  getPendingReviewCount(@CurrentCompany() companyId: string) {
    return this.service.getPendingReviewCount(companyId);
  }

  @Get('pending-review')
  @CheckPolicies((ability) => ability.can('approve', DocumentRecordSubject))
  getPendingReview(@CurrentCompany() companyId: string, @Query() filters: FilterPendingReviewDto) {
    return this.service.getPendingReview(companyId, filters);
  }

  /* OPS-016 — version history for one (asset, documentType) pair. Declared
     before `:id` so the literal `/history` segment matches first. Both query
     params are required; we validate UUID shape here so the service can
     trust the inputs. */
  @Get('history')
  @CheckPolicies((ability) => ability.can('read', DocumentRecordSubject))
  getVersionHistory(
    @CurrentCompany() companyId: string,
    @Query('assetId') assetId: string,
    @Query('documentTypeId') documentTypeId: string,
  ) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!assetId || !uuidRegex.test(assetId)) {
      throw new BadRequestException('assetId es obligatorio y debe ser un UUID válido.');
    }
    if (!documentTypeId || !uuidRegex.test(documentTypeId)) {
      throw new BadRequestException('documentTypeId es obligatorio y debe ser un UUID válido.');
    }
    return this.service.getVersionHistory(companyId, assetId, documentTypeId);
  }

  /* File-stream endpoint declared before the catch-all `:id` finder so a path
     like /:id/file lands here, not on findOne with id="...file". */
  @Get(':id/file')
  @CheckPolicies((ability) => ability.can('read', DocumentRecordSubject))
  async downloadFile(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadFile(id, companyId);
    /* `?download=1` forces a download; default is inline so the preview modal
       can render PDFs/images directly via blob URL. */
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(file.buffer);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', DocumentRecordSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', DocumentRecordSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDocumentDto,
  ) {
    return this.service.create(companyId, user.id, dto, file);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', DocumentRecordSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  /* OPS-016 — replace an APPROVED document with a new version. The old row
     becomes REPLACED (immutable) and the new row inherits asset+type. CASL
     reuses the `supersede` action so MANAGER/ADMIN can do it; the service
     enforces "old must be APPROVED and not already superseded". */
  @Post(':id/supersede')
  @CheckPolicies((ability) => ability.can('supersede', DocumentRecordSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  supersede(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SupersedeDocumentDto,
  ) {
    return this.service.supersedeDocument(companyId, user.id, id, dto, file);
  }

  @Post(':id/archive')
  @CheckPolicies((ability) => ability.can('update', DocumentRecordSubject))
  archive(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ArchiveDocumentDto,
  ) {
    return this.service.archive(id, companyId, user.id, dto);
  }

  /* Workflow endpoints. CASL gates the role; the service enforces the
     uploader/approver identity rules so an admin acting on their own upload
     still gets a 403. */
  @Post(':id/approve')
  @CheckPolicies((ability) => ability.can('approve', DocumentRecordSubject))
  approve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.approve(id, companyId, user.id);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('reject', DocumentRecordSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectDocumentDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/resubmit')
  @CheckPolicies((ability) => ability.can('resubmit', DocumentRecordSubject))
  resubmit(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.resubmit(id, companyId, user.id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', DocumentRecordSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
