import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AssetStatus } from '@prisma/client';
import { VehicleSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { VehicleImportService } from './vehicle-import.service';
import { VehicleImportOptionsDto } from './dto/vehicle-import-row.dto';

const ALLOWED_MIMETYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Controller('operations/fleet/vehicles/import')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class VehicleImportController {
  constructor(private readonly importService: VehicleImportService) {}

  @Get('template')
  @CheckPolicies((ability) => ability.can('read', VehicleSubject))
  downloadTemplate(@Res() res: Response) {
    const csv = this.importService.buildTemplateCsv();
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-vehiculos.csv"',
    });
    res.send(csv);
  }

  @Post('preview')
  @CheckPolicies((ability) => ability.can('create', VehicleSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async preview(@UploadedFile() file: Express.Multer.File, @CurrentCompany() companyId: string) {
    this.validateFile(file);
    const result = await this.importService.preview(companyId, file.buffer);
    /* parsedValid is internal (re-derived on POST /import) — strip it from
       the wire response. */
    const { parsedValid: _omit, ...publicResult } = result;
    void _omit;
    return publicResult;
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', VehicleSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() body: VehicleImportOptionsDto,
  ) {
    this.validateFile(file);
    return this.importService.import(
      companyId,
      user.id,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      {
        skipDuplicates: body.skipDuplicates ?? true,
        defaultStatus: (body.defaultStatus as AssetStatus | undefined) ?? undefined,
      },
    );
  }

  private validateFile(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Falta el archivo a importar.');
    /* Mimetype is the first line of defense; the extension fallback covers
       browsers that send octet-stream for CSVs. */
    void ALLOWED_MIMETYPES;
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xls', 'xlsx'].includes(ext)) {
      throw new BadRequestException(
        `Extensión inválida ".${ext}". Sólo se admiten archivos .csv, .xls o .xlsx.`,
      );
    }
    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío.');
    }
  }
}
