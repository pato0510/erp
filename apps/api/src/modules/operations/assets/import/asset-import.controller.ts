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
import { OperationalAssetSubject } from '../../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../../iam/guards/jwt-auth.guard';
import { AssetImportService } from './asset-import.service';
import { AssetImportOptionsDto } from './dto/asset-import-row.dto';

const ALLOWED_MIMETYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  /* Some browsers/proxies normalize CSV to octet-stream; the extension check
     below catches mistypes. */
  'application/octet-stream',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Controller('operations/assets/import')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AssetImportController {
  constructor(private readonly importService: AssetImportService) {}

  @Get('template')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  downloadTemplate(@Res() res: Response) {
    const csv = this.importService.buildTemplateCsv();
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-equipos.csv"',
    });
    res.send(csv);
  }

  @Post('preview')
  @CheckPolicies((ability) => ability.can('create', OperationalAssetSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async preview(@UploadedFile() file: Express.Multer.File, @CurrentCompany() companyId: string) {
    this.validateFile(file);
    const result = await this.importService.preview(companyId, file.buffer);
    /* Internal `parsedValid` is reused on POST /import — strip it here so the
       wire payload stays compact and free of server internals. */
    const { parsedValid: _omit, ...publicResult } = result;
    void _omit;
    return publicResult;
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', OperationalAssetSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() body: AssetImportOptionsDto,
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
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      /* mimetype rejection is the first line of defense; the extension
         fallback below covers cases where the browser sends a generic
         octet-stream. */
    }
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
