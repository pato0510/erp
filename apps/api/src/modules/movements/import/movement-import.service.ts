import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';

interface RawRow {
  fecha?: string;
  date?: string;
  tipo?: string;
  type?: string;
  monto?: string | number;
  amount?: string | number;
  descripcion?: string;
  description?: string;
  categoria?: string;
  category?: string;
  contraparte?: string;
  counterparty?: string;
  referencia?: string;
  reference?: string;
  notas?: string;
  notes?: string;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ParsedRow {
  date: Date;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  description: string;
  categoryName?: string;
  counterpartyName?: string;
  reference?: string;
  notes?: string;
}

@Injectable()
export class MovementImportService {
  private readonly logger = new Logger(MovementImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storageService: StorageService,
  ) {}

  parseFile(buffer: Buffer, mimetype: string): RawRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: true });

    if (rows.length > 1000) {
      throw new BadRequestException('Maximum 1000 rows per import');
    }

    return rows;
  }

  async validateRows(
    rows: RawRow[],
    companyId: string,
  ): Promise<{ validRows: ParsedRow[]; errors: ImportError[] }> {
    const errors: ImportError[] = [];
    const validRows: ParsedRow[] = [];

    const categories = await this.prisma.category.findMany({
      where: { companyId, isActive: true },
    });
    const counterparties = await this.prisma.counterparty.findMany({
      where: { companyId, isActive: true },
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row + 0-index

      // Date
      const rawDate = (row.fecha || row.date || '').toString().trim();
      const date = this.parseDate(rawDate);
      if (!date) {
        errors.push({ row: rowNum, field: 'fecha', message: `Invalid date: "${rawDate}"` });
        continue;
      }

      // Type
      const rawType = (row.tipo || row.type || '').toString().trim().toUpperCase();
      let type: 'INCOME' | 'EXPENSE';
      if (['INGRESO', 'INCOME'].includes(rawType)) {
        type = 'INCOME';
      } else if (['EGRESO', 'EXPENSE', 'GASTO'].includes(rawType)) {
        type = 'EXPENSE';
      } else {
        errors.push({ row: rowNum, field: 'tipo', message: `Invalid type: "${rawType}"` });
        continue;
      }

      // Amount
      const rawAmount = (row.monto || row.amount || '')
        .toString()
        .trim()
        .replace(/\./g, '')
        .replace(',', '.');
      const amount = parseFloat(rawAmount);
      if (isNaN(amount) || amount <= 0) {
        errors.push({
          row: rowNum,
          field: 'monto',
          message: `Invalid amount: "${row.monto || row.amount}"`,
        });
        continue;
      }

      // Description
      const description = this.sanitize(row.descripcion || row.description || '');
      if (!description) {
        errors.push({ row: rowNum, field: 'descripcion', message: 'Description is required' });
        continue;
      }

      // Category (optional, match by name)
      const categoryName = this.sanitize(row.categoria || row.category || '');
      if (categoryName) {
        const found = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
        if (!found) {
          errors.push({
            row: rowNum,
            field: 'categoria',
            message: `Category not found: "${categoryName}"`,
          });
          continue;
        }
      }

      // Counterparty (optional, match by name)
      const counterpartyName = this.sanitize(row.contraparte || row.counterparty || '');
      if (counterpartyName) {
        const found = counterparties.find(
          (c) => c.name.toLowerCase() === counterpartyName.toLowerCase(),
        );
        if (!found) {
          errors.push({
            row: rowNum,
            field: 'contraparte',
            message: `Counterparty not found: "${counterpartyName}"`,
          });
          continue;
        }
      }

      validRows.push({
        date,
        type,
        amount,
        description,
        categoryName: categoryName || undefined,
        counterpartyName: counterpartyName || undefined,
        reference: this.sanitize(row.referencia || row.reference || '') || undefined,
        notes: this.sanitize(row.notas || row.notes || '') || undefined,
      });
    }

    return { validRows, errors };
  }

  async importMovements(
    companyId: string,
    userId: string,
    fiscalPeriodId: string,
    validRows: ParsedRow[],
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    // Lookup categories and counterparties for ID resolution
    const categories = await this.prisma.category.findMany({
      where: { companyId, isActive: true },
    });
    const counterparties = await this.prisma.counterparty.findMany({
      where: { companyId, isActive: true },
    });

    const created = await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
      const movements: Prisma.MovementCreateManyInput[] = validRows.map((row) => {
        const category = row.categoryName
          ? categories.find((c) => c.name.toLowerCase() === row.categoryName!.toLowerCase())
          : categories.find((c) =>
              row.type === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE',
            );

        const counterparty = row.counterpartyName
          ? counterparties.find((c) => c.name.toLowerCase() === row.counterpartyName!.toLowerCase())
          : undefined;

        return {
          companyId,
          fiscalPeriodId,
          categoryId: category!.id,
          counterpartyId: counterparty?.id,
          type: row.type,
          status: 'DRAFT' as const,
          source: 'IMPORT' as const,
          amount: row.amount,
          date: row.date,
          description: row.description,
          reference: row.reference,
          notes: row.notes,
          createdBy: userId,
        };
      });

      const result = await tx.movement.createMany({ data: movements });
      return result.count;
    });

    // Store file in MinIO
    const timestamp = Date.now();
    const storagePath = `imports/${companyId}/${timestamp}-${file.originalname}`;
    const bucket = process.env.MINIO_BUCKET || 'excelsia-documents';

    try {
      await this.storageService.uploadFile(bucket, storagePath, file.buffer, file.mimetype);
    } catch (err) {
      this.logger.warn(`Failed to upload import file to MinIO: ${err}`);
    }

    // Create ImportLog
    await this.prisma.importLog.create({
      data: {
        companyId,
        userId,
        filename: file.originalname,
        storagePath,
        totalRows: validRows.length,
        importedRows: created,
        errorRows: 0,
        status: 'SUCCESS',
      },
    });

    return { created };
  }

  private parseDate(raw: string): Date | null {
    if (!raw) return null;

    // Excel serial number (e.g. 46116 = some date)
    const serial = parseFloat(raw);
    if (
      !isNaN(serial) &&
      serial > 30000 &&
      serial < 100000 &&
      !raw.includes('/') &&
      !raw.includes('-')
    ) {
      const epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + serial);
      return epoch;
    }

    // DD/MM/YYYY
    const ddmmyyyy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return isNaN(d.getTime()) ? null : d;
    }

    // YYYY-MM-DD
    const yyyymmdd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }

    // Try native parse as fallback
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  private sanitize(value: string): string {
    return value.replace(/[<>]/g, '').trim().slice(0, 500);
  }
}
