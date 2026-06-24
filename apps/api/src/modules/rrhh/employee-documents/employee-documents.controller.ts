import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { EmployeeDocumentSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEmployeeDocumentDto } from './dto/create-employee-document.dto';
import { RejectEmployeeDocumentDto } from './dto/reject-employee-document.dto';
import { SupersedeEmployeeDocumentDto } from './dto/supersede-employee-document.dto';
import { EmployeeDocumentsService } from './employee-documents.service';

const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/* HR-004a — employee document records. EVERY endpoint gates on
   EmployeeDocumentSubject (PoliciesGuard fails OPEN). CASL gates the role; the
   service enforces per-row identity (uploader≠approver) and the immutable
   supersession rules. Copy-adapted from the Operations DocumentRecordsController
   (assetId→employeeId, asset-blocking dropped). */
@Controller('rrhh/documents')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EmployeeDocumentsController {
  constructor(private readonly service: EmployeeDocumentsService) {}

  /* List by employee. employeeId is required so we never return a cross-employee
     dump. includeReplaced=true surfaces superseded versions for history views. */
  @Get()
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  list(
    @CurrentCompany() companyId: string,
    @Query('employeeId') employeeId: string,
    @Query('includeReplaced') includeReplaced?: string,
  ) {
    if (!employeeId) throw new BadRequestException('employeeId es obligatorio.');
    return this.service.list(companyId, employeeId, includeReplaced === 'true');
  }

  /* Per-employee compliance. Declared before `:id` so the literal `/compliance`
     segment matches first. */
  @Get('compliance/:employeeId')
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  compliance(@Param('employeeId') employeeId: string, @CurrentCompany() companyId: string) {
    return this.service.compliance(companyId, employeeId);
  }

  /* File-stream endpoint declared before the catch-all `:id` finder. */
  @Get(':id/file')
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
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

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', EmployeeDocumentSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', EmployeeDocumentSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEmployeeDocumentDto,
  ) {
    return this.service.create(companyId, user.id, dto, file);
  }

  /* Replace an APPROVED document with a new version. The old row becomes
     REPLACED (immutable); the new row inherits employee+type. */
  @Post(':id/supersede')
  @CheckPolicies((ability) => ability.can('supersede', EmployeeDocumentSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  supersede(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SupersedeEmployeeDocumentDto,
  ) {
    return this.service.supersedeDocument(companyId, user.id, id, dto, file);
  }

  /* Workflow endpoints. CASL gates the role; the service enforces uploader≠
     approver so an admin acting on their own upload still gets a 403. */
  @Post(':id/approve')
  @CheckPolicies((ability) => ability.can('approve', EmployeeDocumentSubject))
  approve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.approve(id, companyId, user.id);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('reject', EmployeeDocumentSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectEmployeeDocumentDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/resubmit')
  @CheckPolicies((ability) => ability.can('resubmit', EmployeeDocumentSubject))
  resubmit(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.resubmit(id, companyId, user.id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', EmployeeDocumentSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
