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
import { HsecTrainingSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AddAttendeeDto } from './dto/add-attendee.dto';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { FILE_MAX_BYTES, TrainingsService } from './trainings.service';

/* HSEC-006 — trainings CRUD + attendees + the single planilla file. EVERY endpoint declares
 * @CheckPolicies on HsecTrainingSubject (PoliciesGuard fails OPEN) — attendees have NO
 * subject of their own: the founder-signed matrix has exactly FIVE subjects, and changing a
 * training's composition IS updating the training (see the service class comment). Uniform
 * matrix: MANAGER full CRUD, ADMIN/SUPER_ADMIN via `manage all`, everyone else floored. */
@Controller('hsec/trainings')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TrainingsController {
  constructor(private readonly service: TrainingsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', HsecTrainingSubject))
  findAll(
    @CurrentCompany() companyId: string,
    @Query('type') type?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.findAll(companyId, type, employeeId);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', HsecTrainingSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', HsecTrainingSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateTrainingDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', HsecTrainingSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateTrainingDto,
  ) {
    return this.service.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', HsecTrainingSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.remove(id, companyId, user.id);
  }

  /* Attendees — gate `update HsecTraining` (composition IS an update; no own subject). */
  @Post(':id/attendees')
  @CheckPolicies((ability) => ability.can('update', HsecTrainingSubject))
  addAttendee(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddAttendeeDto,
  ) {
    return this.service.addAttendee(id, companyId, user.id, dto);
  }

  @Delete(':id/attendees/:attendeeId')
  @CheckPolicies((ability) => ability.can('update', HsecTrainingSubject))
  removeAttendee(
    @Param('id') id: string,
    @Param('attendeeId') attendeeId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.removeAttendee(id, attendeeId, companyId, user.id);
  }

  /* The planilla file — single slot; POST replaces (recorded in the service). */
  @Post(':id/file')
  @CheckPolicies((ability) => ability.can('update', HsecTrainingSubject))
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
  @CheckPolicies((ability) => ability.can('read', HsecTrainingSubject))
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
  @CheckPolicies((ability) => ability.can('update', HsecTrainingSubject))
  deleteFile(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.deleteFile(id, companyId, user.id);
  }
}
