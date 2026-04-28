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
import { PermitSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { ArchivePermitDto } from './dto/archive-permit.dto';
import { CreatePermitDto } from './dto/create-permit.dto';
import { FilterPermitsDto } from './dto/filter-permits.dto';
import { RejectPermitDto } from './dto/reject-permit.dto';
import { SupersedePermitDto } from './dto/supersede-permit.dto';
import { UpdatePermitDto } from './dto/update-permit.dto';
import { PermitsService } from './permits.service';

const FILE_MAX_BYTES = 10 * 1024 * 1024;

@Controller('operations/permits')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PermitsController {
  constructor(private readonly service: PermitsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', PermitSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterPermitsDto) {
    return this.service.findAll(companyId, filters);
  }

  @Get('compliance')
  @CheckPolicies((ability) => ability.can('read', PermitSubject))
  getCompliance(@CurrentCompany() companyId: string) {
    return this.service.getCompliance(companyId);
  }

  /* History endpoint declared before `:id` so the literal segment
     wins. Requires permitTypeId + exactly one of assetId/locationId. */
  @Get('history')
  @CheckPolicies((ability) => ability.can('read', PermitSubject))
  history(
    @CurrentCompany() companyId: string,
    @Query('permitTypeId') permitTypeId: string,
    @Query('assetId') assetId?: string,
    @Query('locationId') locationId?: string,
  ) {
    if (!permitTypeId) throw new BadRequestException('permitTypeId es obligatorio.');
    return this.service.getVersionHistory(companyId, permitTypeId, assetId, locationId);
  }

  @Get(':id/file')
  @CheckPolicies((ability) => ability.can('read', PermitSubject))
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
  @CheckPolicies((ability) => ability.can('read', PermitSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', PermitSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePermitDto,
  ) {
    return this.service.create(companyId, user.id, dto, file);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', PermitSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePermitDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Post(':id/supersede')
  @CheckPolicies((ability) => ability.can('supersede', PermitSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  supersede(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SupersedePermitDto,
  ) {
    return this.service.supersede(companyId, user.id, id, dto, file);
  }

  @Post(':id/archive')
  @CheckPolicies((ability) => ability.can('update', PermitSubject))
  archive(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ArchivePermitDto,
  ) {
    return this.service.archive(id, companyId, user.id, dto);
  }

  @Post(':id/approve')
  @CheckPolicies((ability) => ability.can('approve', PermitSubject))
  approve(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.approve(id, companyId, user.id);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) => ability.can('reject', PermitSubject))
  reject(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RejectPermitDto,
  ) {
    return this.service.reject(id, companyId, user.id, dto);
  }

  @Post(':id/resubmit')
  @CheckPolicies((ability) => ability.can('resubmit', PermitSubject))
  resubmit(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.resubmit(id, companyId, user.id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', PermitSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }
}
