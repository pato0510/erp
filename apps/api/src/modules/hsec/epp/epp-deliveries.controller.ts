import {
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
import { HsecEppDeliverySubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateEppDeliveryDto } from './dto/create-epp-delivery.dto';
import { UpdateEppDeliveryDto } from './dto/update-epp-delivery.dto';
import { EppDeliveriesService, FILE_MAX_BYTES } from './epp-deliveries.service';

/* HSEC-008 — EPP deliveries. EVERY endpoint declares @CheckPolicies on
 * HsecEppDeliverySubject (PoliciesGuard fails OPEN); lines have NO subject of their own —
 * they are part of the delivery (the trainings attendee-gate rationale). Uniform matrix. */
@Controller('hsec/epp-deliveries')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class EppDeliveriesController {
  constructor(private readonly service: EppDeliveriesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', HsecEppDeliverySubject))
  findAll(@CurrentCompany() companyId: string, @Query('employeeId') employeeId?: string) {
    return this.service.findAll(companyId, employeeId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', HsecEppDeliverySubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', HsecEppDeliverySubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEppDeliveryDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', HsecEppDeliverySubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEppDeliveryDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', HsecEppDeliverySubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }

  /* The acuse file — single slot; POST replaces (recorded in the service). */
  @Post(':id/file')
  @CheckPolicies((ability) => ability.can('update', HsecEppDeliverySubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.uploadFile(id, companyId, user.id, file);
  }

  @Get(':id/file')
  @CheckPolicies((ability) => ability.can('read', HsecEppDeliverySubject))
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

  @Delete(':id/file')
  @CheckPolicies((ability) => ability.can('update', HsecEppDeliverySubject))
  deleteFile(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deleteFile(id, companyId, user.id);
  }
}
