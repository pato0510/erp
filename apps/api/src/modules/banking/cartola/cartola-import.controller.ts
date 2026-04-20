import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CartolaImportService } from './cartola-import.service';
import { BankingService } from '../banking.service';
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
  'application/octet-stream',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const TEMPLATES: Record<string, { filename: string; body: string }> = {
  generic: {
    filename: 'cartola_generica.csv',
    body:
      'fecha,descripcion,monto,tipo,saldo,referencia\n' +
      '01/04/2026,TRANSFERENCIA RECIBIDA CLIENTE,5000000,CREDIT,15000000,TEF-123\n' +
      '03/04/2026,PAGO ARRIENDO OFICINA,1200000,DEBIT,13800000,BOL-001\n' +
      '05/04/2026,COMISION MANTENIMIENTO,3500,DEBIT,13796500,\n' +
      '10/04/2026,ABONO FACTURA 482,2500000,CREDIT,16296500,FAC-482\n',
  },
  bancochile: {
    filename: 'cartola_bancochile.csv',
    body:
      'Fecha,Descripcion,Cargo,Abono,Saldo\n' +
      '01/04/2026,TRANSFERENCIA RECIBIDA CLIENTE,,5000000,15000000\n' +
      '03/04/2026,PAGO ARRIENDO OFICINA,1200000,,13800000\n' +
      '05/04/2026,COMISION MANTENIMIENTO,3500,,13796500\n' +
      '10/04/2026,ABONO FACTURA 482,,2500000,16296500\n',
  },
  bci: {
    filename: 'cartola_bci.csv',
    body:
      'Fecha,Descripcion,Cargo,Abono,Saldo\n' +
      '01/04/2026,TEF RECIBIDA CLIENTE,,5000000,15000000\n' +
      '03/04/2026,PAGO PROVEEDOR SERVICIOS,850000,,14150000\n' +
      '07/04/2026,COMISION TRANSFERENCIA,1200,,14148800\n' +
      '12/04/2026,ABONO FACTURA 301,,3200000,17348800\n',
  },
};

@Controller('banking/cartola')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CartolaImportController {
  constructor(
    private readonly cartolaService: CartolaImportService,
    private readonly bankingService: BankingService,
  ) {}

  @Post('preview')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async preview(
    @CurrentCompany() companyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('bankConnectionId') bankConnectionId: string,
    @Body('bankName') bankName?: string,
  ) {
    this.validateFile(file);
    if (!bankConnectionId) throw new BadRequestException('bankConnectionId es requerido');
    const connection = await this.bankingService.getConnection(bankConnectionId, companyId);

    const { movements, errors, detectedFormat } = this.cartolaService.parseCartola(
      file.buffer,
      file.mimetype,
      bankName ?? connection.provider,
    );

    return {
      detectedFormat,
      validCount: movements.length,
      errorCount: errors.length,
      preview: movements.slice(0, 10),
      errors,
    };
  }

  @Post('import')
  @CheckPolicies((ability) => ability.can('create', MovementSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async importCartola(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
    @Body('bankConnectionId') bankConnectionId: string,
    @Body('bankName') bankName?: string,
  ) {
    this.validateFile(file);
    if (!bankConnectionId) throw new BadRequestException('bankConnectionId es requerido');
    const connection = await this.bankingService.getConnection(bankConnectionId, companyId);

    const { movements, errors } = this.cartolaService.parseCartola(
      file.buffer,
      file.mimetype,
      bankName ?? connection.provider,
    );

    if (movements.length === 0) {
      return { imported: 0, skipped: 0, errors, syncRunId: null };
    }

    return this.cartolaService.importCartola(
      companyId,
      user.id,
      bankConnectionId,
      movements,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
      errors,
    );
  }

  @Get('template/:format')
  @CheckPolicies((ability) => ability.can('read', MovementSubject))
  downloadTemplate(@Param('format') format: string, @Res() res: Response) {
    const tpl = TEMPLATES[format];
    if (!tpl) {
      res
        .status(400)
        .json({ message: `Formato inválido: ${format}. Usa generic, bancochile o bci` });
      return;
    }
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${tpl.filename}"`,
    });
    res.send(tpl.body);
  }

  private validateFile(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Tipo no permitido: ${file.mimetype}. Usa CSV, XLS o XLSX`);
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xls', 'xlsx'].includes(ext)) {
      throw new BadRequestException(`Extensión inválida: .${ext}. Usa .csv, .xls o .xlsx`);
    }
  }
}
