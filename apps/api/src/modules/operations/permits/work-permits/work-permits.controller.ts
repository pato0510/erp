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
import { WorkPermitSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { CreateWorkPermitDto } from './dto/create-work-permit.dto';
import { FilterWorkPermitsDto } from './dto/filter-work-permits.dto';
import { UpdateWorkPermitDto } from './dto/update-work-permit.dto';
import {
  AuthorizeWorkPermitDto,
  CancelWorkPermitDto,
  CloseWorkPermitDto,
  GasMeasurementDto,
  RejectWorkPermitDto,
  SuspendWorkPermitDto,
} from './dto/workflow.dto';
import { WorkPermitsService } from './work-permits.service';

const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

@Controller('operations/work-permits')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class WorkPermitsController {
  constructor(private readonly service: WorkPermitsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', WorkPermitSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterWorkPermitsDto) {
    return this.service.findAll(companyId, filters);
  }

  /* Literal segments declared before `:id` so they win the route match. */
  @Get('active-count')
  @CheckPolicies((ability) => ability.can('read', WorkPermitSubject))
  activeCount(@CurrentCompany() companyId: string) {
    return this.service.getActiveCount(companyId);
  }

  @Get('in-execution')
  @CheckPolicies((ability) => ability.can('read', WorkPermitSubject))
  inExecution(@CurrentCompany() companyId: string) {
    return this.service.getInExecution(companyId);
  }

  @Get(':id/attachments/:attachmentIndex')
  @CheckPolicies((ability) => ability.can('read', WorkPermitSubject))
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentIndex', ParseIntPipe) attachmentIndex: number,
    @CurrentCompany() companyId: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.service.getAttachment(id, companyId, attachmentIndex);
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(file.buffer);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', WorkPermitSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', WorkPermitSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateWorkPermitDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', WorkPermitSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateWorkPermitDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Post(':id/submit')
  @CheckPolicies((ability) => ability.can('update', WorkPermitSubject))
  submit(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.submitForAuthorization(id, companyId, user.id);
  }

  @Post(':id/authorize')
  @CheckPolicies((ability) => ability.can('authorize', WorkPermitSubject))
  authorize(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AuthorizeWorkPermitDto,
  ) {
    return this.service.authorize(id, companyId, user.id, dto);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('reject', WorkPermitSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectWorkPermitDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/start')
  @CheckPolicies((ability) => ability.can('start', WorkPermitSubject))
  start(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.start(id, companyId, user.id);
  }

  @Post(':id/suspend')
  @CheckPolicies((ability) => ability.can('suspend', WorkPermitSubject))
  suspend(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SuspendWorkPermitDto,
  ) {
    return this.service.suspend(id, companyId, user.id, dto);
  }

  @Post(':id/resume')
  @CheckPolicies((ability) => ability.can('resume', WorkPermitSubject))
  resume(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.resume(id, companyId, user.id);
  }

  @Post(':id/close')
  @CheckPolicies((ability) => ability.can('close', WorkPermitSubject))
  close(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CloseWorkPermitDto,
  ) {
    return this.service.close(id, companyId, user.id, dto);
  }

  @Post(':id/cancel')
  @CheckPolicies((ability) => ability.can('cancel', WorkPermitSubject))
  cancel(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CancelWorkPermitDto,
  ) {
    return this.service.cancel(id, companyId, user.id, dto);
  }

  @Post(':id/gas-measurement')
  @CheckPolicies((ability) => ability.can('update', WorkPermitSubject))
  addGasMeasurement(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: GasMeasurementDto,
  ) {
    return this.service.addGasMeasurement(id, companyId, user.id, dto);
  }

  @Post(':id/attachments')
  @CheckPolicies((ability) => ability.can('update', WorkPermitSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES } }))
  addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Falta el archivo a cargar.');
    return this.service.addAttachment(id, companyId, user.id, file);
  }

  @Delete(':id/attachments/:attachmentIndex')
  @CheckPolicies((ability) => ability.can('update', WorkPermitSubject))
  deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentIndex', ParseIntPipe) attachmentIndex: number,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deleteAttachment(id, companyId, user.id, attachmentIndex);
  }
}
