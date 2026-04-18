import 'multer';
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MovementImportService } from './movement-import.service';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { MovementSubject } from '../../common/casl/casl-ability.factory';

const ALLOWED_MIMETYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some systems send CSV as this
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@Controller('movements/import')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class MovementImportController {
  constructor(private readonly importService: MovementImportService) {}

  @Post('preview')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async preview(@UploadedFile() file: Express.Multer.File, @CurrentCompany() companyId: string) {
    this.validateFile(file);

    const rows = this.importService.parseFile(file.buffer, file.mimetype);
    const { validRows, errors } = await this.importService.validateRows(rows, companyId);

    return {
      validCount: validRows.length,
      errorCount: errors.length,
      errors,
      preview: validRows.slice(0, 10),
    };
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async importFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body('fiscalPeriodId') fiscalPeriodId: string,
  ) {
    this.validateFile(file);

    if (!fiscalPeriodId) {
      throw new BadRequestException('fiscalPeriodId is required');
    }

    const rows = this.importService.parseFile(file.buffer, file.mimetype);
    const { validRows, errors } = await this.importService.validateRows(rows, companyId);

    if (validRows.length === 0) {
      return { created: 0, skipped: rows.length, errors };
    }

    const result = await this.importService.importMovements(
      companyId,
      user.id,
      fiscalPeriodId,
      validRows,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    );

    return {
      created: result.created,
      skipped: errors.length,
      errors,
    };
  }

  @Get('template')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  downloadTemplate(@Res() res: Response) {
    const csv =
      'fecha,tipo,monto,descripcion,categoria,contraparte,referencia,notas\n' +
      '05/04/2026,INGRESO,5000000,Factura venta productos,Ventas,Cliente Demo,FAC-001,\n' +
      '10/04/2026,EGRESO,1200000,Arriendo oficina abril,Arriendo,Proveedor Demo,BOL-001,Pago mensual\n' +
      '15/04/2026,INGRESO,2500000,Servicios de consultoría,Servicios,,FAC-002,Consultoría TI\n';
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="movimientos_template.csv"',
    });
    res.send(csv);
  }

  private validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type: ${file.mimetype}. Allowed: CSV, XLS, XLSX`);
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xls', 'xlsx'].includes(ext)) {
      throw new BadRequestException(`Invalid file extension: .${ext}. Allowed: .csv, .xls, .xlsx`);
    }
  }
}
