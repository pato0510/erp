import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';
import { StorageService } from '../../common/storage/storage.service';

const MANUAL_PROVIDER_TAG = 'manual_import';
const MAX_ROWS = 5000;

export type CartolaFormat = 'bancochile_bci' | 'santander_itau' | 'generic';

export interface CartolaMovement {
  date: Date;
  description: string;
  amount: number; // DEBIT => negative, CREDIT => positive
  type: 'CREDIT' | 'DEBIT';
  balance?: number;
  reference?: string;
  idempotencyKey: string;
}

export interface CartolaError {
  row: number;
  field: string;
  message: string;
}

export interface CartolaParseResult {
  movements: CartolaMovement[];
  errors: CartolaError[];
  detectedFormat: CartolaFormat;
}

export interface CartolaImportResult {
  imported: number;
  skipped: number;
  errors: CartolaError[];
  syncRunId: string;
}

type NormalizedRow = Record<string, unknown>;

@Injectable()
export class CartolaImportService {
  private readonly logger = new Logger(CartolaImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storageService: StorageService,
  ) {}

  parseCartola(buffer: Buffer, _mimetype: string, bankName?: string): CartolaParseResult {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('Archivo sin hojas legibles');

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });

    if (raw.length === 0) throw new BadRequestException('El archivo está vacío');
    if (raw.length > MAX_ROWS) {
      throw new BadRequestException(`Máximo ${MAX_ROWS} filas por importación`);
    }

    const rows = raw.map((r) => this.normalizeKeys(r));
    const detectedFormat = this.detectFormat(rows[0] ?? {}, bankName);

    const movements: CartolaMovement[] = [];
    const errors: CartolaError[] = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +1 for header row, +1 for 0-index
      const parsed = this.parseRow(rows[i], rowNum, detectedFormat);
      if ('error' in parsed) {
        errors.push(parsed.error);
        continue;
      }
      if (seenKeys.has(parsed.movement.idempotencyKey)) {
        errors.push({
          row: rowNum,
          field: 'duplicado',
          message: 'Fila duplicada dentro del archivo (misma fecha, descripción y monto)',
        });
        continue;
      }
      seenKeys.add(parsed.movement.idempotencyKey);
      movements.push(parsed.movement);
    }

    return { movements, errors, detectedFormat };
  }

  async importCartola(
    companyId: string,
    userId: string,
    bankConnectionId: string,
    movements: CartolaMovement[],
    file?: { buffer: Buffer; originalname: string; mimetype: string },
    parseErrors: CartolaError[] = [],
  ): Promise<CartolaImportResult> {
    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: bankConnectionId, companyId },
    });
    if (!connection) throw new NotFoundException('Conexión bancaria no encontrada');

    const syncRun = await this.prisma.bankSyncRun.create({
      data: {
        companyId,
        bankConnectionId,
        provider: MANUAL_PROVIDER_TAG,
        status: 'RUNNING',
      },
    });

    let imported = 0;
    let skipped = 0;

    try {
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        for (const mov of movements) {
          const existing = await tx.externalBankMovement.findUnique({
            where: {
              bankConnectionId_externalId: {
                bankConnectionId,
                externalId: mov.idempotencyKey,
              },
            },
            select: { id: true },
          });

          if (existing) {
            skipped++;
            continue;
          }

          await tx.externalBankMovement.create({
            data: {
              companyId,
              bankConnectionId,
              externalId: mov.idempotencyKey,
              date: mov.date,
              description: mov.description,
              amount: mov.amount,
              currency: 'CLP',
              type: mov.type,
              balance: mov.balance,
              metadata: {
                source: MANUAL_PROVIDER_TAG,
                reference: mov.reference ?? null,
                filename: file?.originalname ?? null,
                importedBy: userId,
                importedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
          imported++;
        }
      });

      // Store original file in MinIO (best-effort — failure shouldn't roll back the import).
      let storagePath: string | null = null;
      if (file) {
        const timestamp = Date.now();
        storagePath = `cartolas/${companyId}/${timestamp}-${file.originalname}`;
        const bucket = process.env.MINIO_BUCKET || 'excelsia-documents';
        try {
          await this.storageService.uploadFile(bucket, storagePath, file.buffer, file.mimetype);
        } catch (err) {
          this.logger.warn(`No se pudo subir cartola a MinIO: ${err}`);
        }
      }

      await this.prisma.bankSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          movementsSynced: imported,
          rawResponse: {
            source: MANUAL_PROVIDER_TAG,
            filename: file?.originalname ?? null,
            storagePath,
            totalRows: movements.length + parseErrors.length,
            imported,
            skipped,
            errorRows: parseErrors.length,
          } as Prisma.InputJsonValue,
        },
      });

      await this.prisma.bankConnection.update({
        where: { id: bankConnectionId },
        data: { lastSyncAt: new Date() },
      });

      return { imported, skipped, errors: parseErrors, syncRunId: syncRun.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      await this.prisma.bankSyncRun.update({
        where: { id: syncRun.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      throw err;
    }
  }

  private detectFormat(sampleRow: NormalizedRow, bankName?: string): CartolaFormat {
    const keys = new Set(Object.keys(sampleRow));

    const hasCargoAbono = keys.has('cargo') || keys.has('abono');
    const hasDebitoCredito = keys.has('debito') || keys.has('credito');
    const hasDescripcion = keys.has('descripcion') || keys.has('description');
    const hasDetalle = keys.has('detalle') || keys.has('glosa');

    if (hasDebitoCredito || (hasDetalle && !hasCargoAbono)) return 'santander_itau';
    if (hasCargoAbono && hasDescripcion) return 'bancochile_bci';

    // Hint from the bank name if the columns were ambiguous.
    if (bankName) {
      const b = bankName.toLowerCase();
      if (b.includes('santander') || b.includes('itau')) return 'santander_itau';
      if (b.includes('chile') || b.includes('bci')) return 'bancochile_bci';
    }

    return 'generic';
  }

  private parseRow(
    row: NormalizedRow,
    rowNum: number,
    format: CartolaFormat,
  ): { movement: CartolaMovement } | { error: CartolaError } {
    const rawDate = row.fecha ?? row.date;
    const date = this.parseDate(rawDate);
    if (!date) {
      return { error: { row: rowNum, field: 'fecha', message: `Fecha inválida: "${rawDate}"` } };
    }

    const description = this.sanitize(
      ((row.descripcion ?? row.description ?? row.detalle ?? row.glosa ?? '') as string).toString(),
    );
    if (!description) {
      return { error: { row: rowNum, field: 'descripcion', message: 'Descripción requerida' } };
    }

    const signed = this.resolveAmount(row, format);
    if ('error' in signed) {
      return { error: { row: rowNum, field: 'monto', message: signed.error } };
    }

    const balance = this.parseNumber(row.saldo ?? row.balance);
    const reference = this.sanitize(
      ((row.referencia ?? row.reference ?? row.operacion ?? row.numero ?? '') as string).toString(),
    );

    return {
      movement: {
        date,
        description,
        amount: signed.amount,
        type: signed.type,
        balance: balance ?? undefined,
        reference: reference || undefined,
        idempotencyKey: this.buildIdempotencyKey(date, description, signed.amount),
      },
    };
  }

  private resolveAmount(
    row: NormalizedRow,
    format: CartolaFormat,
  ): { amount: number; type: 'CREDIT' | 'DEBIT' } | { error: string } {
    // Format A (Banco de Chile, BCI): Cargo / Abono
    // Format B (Santander, Itaú): Débito / Crédito
    const debit = this.parseNumber(row.cargo ?? row.debito);
    const credit = this.parseNumber(row.abono ?? row.credito);

    if ((debit && debit > 0) || (credit && credit > 0)) {
      if (debit && debit > 0 && credit && credit > 0) {
        return { error: 'Cargo/débito y abono/crédito no pueden coexistir en la misma fila' };
      }
      if (debit && debit > 0) return { amount: -Math.abs(debit), type: 'DEBIT' };
      return { amount: Math.abs(credit as number), type: 'CREDIT' };
    }

    // Format C (Generic): monto + tipo, or signed monto
    const monto = this.parseNumber(row.monto ?? row.amount);
    if (monto === null || monto === undefined) {
      const required = format === 'santander_itau' ? 'débito/crédito' : 'cargo/abono';
      return { error: `Monto requerido (columnas ${required} o monto)` };
    }

    const rawType = ((row.tipo ?? row.type ?? '') as string).toString().trim().toUpperCase();
    if (rawType) {
      if (['CREDIT', 'CREDITO', 'ABONO', 'INGRESO'].includes(rawType)) {
        return { amount: Math.abs(monto), type: 'CREDIT' };
      }
      if (['DEBIT', 'DEBITO', 'CARGO', 'EGRESO'].includes(rawType)) {
        return { amount: -Math.abs(monto), type: 'DEBIT' };
      }
      return { error: `Tipo inválido: "${rawType}"` };
    }

    if (monto === 0) return { error: 'Monto no puede ser cero' };
    return monto > 0 ? { amount: monto, type: 'CREDIT' } : { amount: monto, type: 'DEBIT' };
  }

  private normalizeKeys(row: Record<string, unknown>): NormalizedRow {
    const out: NormalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
      const normalized = key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/°/g, '')
        .replace(/\s+/g, '');
      out[normalized] = value;
    }
    return out;
  }

  private parseNumber(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return isNaN(raw) ? null : raw;
    const s = raw.toString().trim();
    if (!s) return null;
    // Chilean formats: "1.234.567,89" or "1234567.89" or "-1234"
    const hasComma = s.includes(',');
    const normalized = hasComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    const n = parseFloat(normalized);
    return isNaN(n) ? null : n;
  }

  private parseDate(raw: unknown): Date | null {
    if (raw === null || raw === undefined || raw === '') return null;

    if (typeof raw === 'number' && raw > 30000 && raw < 100000) {
      const epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + raw);
      return isNaN(epoch.getTime()) ? null : epoch;
    }

    const s = raw.toString().trim();
    if (!s) return null;

    const ddmmyyyy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      const y = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
      const d = new Date(y, parseInt(month) - 1, parseInt(day));
      return isNaN(d.getTime()) ? null : d;
    }

    const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }

    const serial = parseFloat(s);
    if (!isNaN(serial) && serial > 30000 && serial < 100000) {
      const epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + serial);
      return epoch;
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  private sanitize(value: string): string {
    return value.replace(/[<>]/g, '').trim().slice(0, 500);
  }

  private buildIdempotencyKey(date: Date, description: string, amount: number): string {
    // Spec: idempotency key is date + description + amount. Stable across re-imports.
    const iso = date.toISOString().slice(0, 10);
    const descNorm = description.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
    const amtNorm = amount.toFixed(2);
    return `MANUAL|${iso}|${descNorm}|${amtNorm}`;
  }
}
