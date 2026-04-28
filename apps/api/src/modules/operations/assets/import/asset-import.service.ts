import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AssetStatus, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { StorageService } from '../../../common/storage/storage.service';
import {
  AssetImportPreviewRow,
  AssetImportRowError,
  ParsedAssetRow,
} from './dto/asset-import-row.dto';

const MAX_ROWS = 1000;
const VALID_STATUSES: AssetStatus[] = [
  'OPERATIONAL',
  'WITH_OBSERVATIONS',
  'NON_OPERATIONAL',
  'IN_MAINTENANCE',
  'BLOCKED_DOCUMENTAL',
  'BLOCKED_PERMIT',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED',
];

interface RawRow {
  [key: string]: unknown;
}

interface ResolveCtx {
  typesByName: Map<string, { id: string; name: string }>;
  subtypesByCompound: Map<string, { id: string; name: string; assetTypeId: string }>;
  locationsByName: Map<string, { id: string; name: string }>;
  existingCodes: Set<string>;
}

interface PreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: AssetImportPreviewRow[];
  /* Internal payload reused by the import endpoint — not part of the public
     contract but we expose it here so callers don't have to re-parse. */
  parsedValid: ParsedAssetRow[];
}

@Injectable()
export class AssetImportService {
  private readonly logger = new Logger(AssetImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
  ) {}

  /* Reuses the xlsx package — handles both CSV and XLSX uniformly so we don't
     have to ship two parsers. `raw: true` keeps numbers as numbers and
     dates as Excel serials, which we re-parse below. */
  parseFile(buffer: Buffer): RawRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('El archivo no contiene hojas legibles.');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: true });
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`Máximo ${MAX_ROWS} filas por importación.`);
    }
    return rows;
  }

  async preview(companyId: string, buffer: Buffer): Promise<PreviewResult> {
    const raw = this.parseFile(buffer);
    if (raw.length === 0) {
      return {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        rows: [],
        parsedValid: [],
      };
    }

    const ctx = await this.buildResolveContext(companyId);

    const seenCodes = new Map<string, number>();
    const previews: AssetImportPreviewRow[] = [];
    const parsedValid: ParsedAssetRow[] = [];
    let validCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const rowNumber = i + 2; // +1 for header, +1 for 1-indexing
      const errors: AssetImportRowError[] = [];

      const code = pickString(row, ['codigo', 'código', 'code']).toUpperCase();
      const name = pickString(row, ['nombre', 'name']);
      const description = pickString(row, ['descripcion', 'descripción', 'description']);
      const typeName = pickString(row, ['tipo_activo', 'tipo', 'asset_type', 'type']);
      const subtypeName = pickString(row, ['subtipo', 'subtype']);
      const locationName = pickString(row, ['ubicacion', 'ubicación', 'location']);
      const serialNumber = pickString(row, [
        'numero_serie',
        'número_serie',
        'serial_number',
        'serial',
      ]);
      const manufacturer = pickString(row, ['fabricante', 'manufacturer']);
      const model = pickString(row, ['modelo', 'model']);
      const acquisitionDateRaw = pickString(row, [
        'fecha_adquisicion',
        'fecha_adquisición',
        'acquisition_date',
      ]);
      const acquisitionCostRaw = pickString(row, [
        'costo_adquisicion',
        'costo_adquisición',
        'acquisition_cost',
        'cost',
      ]);
      const statusRaw = pickString(row, ['estado', 'status']).toUpperCase();
      const tagsRaw = pickString(row, ['tags', 'etiquetas']);
      const attrsRaw = pickString(row, ['atributos', 'attributes', 'specs']);

      if (!code) errors.push({ field: 'codigo', message: 'El código es obligatorio.' });
      if (!name) errors.push({ field: 'nombre', message: 'El nombre es obligatorio.' });
      if (!typeName) {
        errors.push({ field: 'tipo_activo', message: 'El tipo de activo es obligatorio.' });
      }

      const type = typeName ? ctx.typesByName.get(typeName.toLowerCase()) : undefined;
      if (typeName && !type) {
        errors.push({
          field: 'tipo_activo',
          message: `Tipo de activo "${typeName}" no existe. Crea el tipo en Configuración antes de importar.`,
        });
      }

      let subtype: { id: string; name: string; assetTypeId: string } | undefined;
      if (subtypeName && type) {
        subtype = ctx.subtypesByCompound.get(`${type.id}::${subtypeName.toLowerCase()}`);
        if (!subtype) {
          errors.push({
            field: 'subtipo',
            message: `Subtipo "${subtypeName}" no existe dentro del tipo "${type.name}".`,
          });
        }
      }

      let location: { id: string; name: string } | undefined;
      if (locationName) {
        location = ctx.locationsByName.get(locationName.toLowerCase());
        if (!location) {
          errors.push({
            field: 'ubicacion',
            message: `Ubicación "${locationName}" no existe. Créala en Configuración antes de importar.`,
          });
        }
      }

      let acquisitionDate: Date | undefined;
      if (acquisitionDateRaw) {
        const parsed = parseDate(acquisitionDateRaw);
        if (!parsed) {
          errors.push({
            field: 'fecha_adquisicion',
            message: `Fecha inválida "${acquisitionDateRaw}". Usa formato DD/MM/YYYY.`,
          });
        } else {
          acquisitionDate = parsed;
        }
      }

      let acquisitionCost: number | undefined;
      if (acquisitionCostRaw) {
        const cleaned = String(acquisitionCostRaw).replace(/\./g, '').replace(',', '.');
        const n = Number(cleaned);
        if (Number.isNaN(n) || n < 0) {
          errors.push({
            field: 'costo_adquisicion',
            message: `Costo inválido "${acquisitionCostRaw}". Debe ser un número positivo.`,
          });
        } else {
          acquisitionCost = n;
        }
      }

      let status: AssetStatus | undefined;
      if (statusRaw) {
        if (!VALID_STATUSES.includes(statusRaw as AssetStatus)) {
          errors.push({
            field: 'estado',
            message: `Estado inválido "${statusRaw}". Valores permitidos: ${VALID_STATUSES.join(', ')}.`,
          });
        } else {
          status = statusRaw as AssetStatus;
        }
      }

      const tags = tagsRaw
        ? tagsRaw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      const dynamicAttributes = parseAttributes(attrsRaw);
      if (attrsRaw && dynamicAttributes === null) {
        errors.push({
          field: 'atributos',
          message: 'Formato inválido. Usa "clave1:valor1,clave2:valor2".',
        });
      }

      /* Duplicates: check both within the file and against existing DB rows.
         Within-file duplicates are surfaced as errors so the user knows the
         file itself is inconsistent — DB duplicates are flagged so the wizard
         can offer "skip duplicates". */
      let isDuplicate = false;
      if (code) {
        const seenAt = seenCodes.get(code);
        if (seenAt !== undefined) {
          errors.push({
            field: 'codigo',
            message: `Código "${code}" duplicado en este archivo (también en fila ${seenAt}).`,
          });
        } else {
          seenCodes.set(code, rowNumber);
        }
        if (ctx.existingCodes.has(code)) {
          isDuplicate = true;
        }
      }

      const isValid = errors.length === 0 && !!code && !!name && !!type;
      if (isValid) validCount++;
      if (isDuplicate && isValid) duplicateCount++;

      previews.push({
        rowNumber,
        data: {
          code,
          name,
          assetTypeName: typeName || undefined,
          subtypeName: subtypeName || undefined,
          locationName: locationName || undefined,
          status: statusRaw || undefined,
        },
        errors,
        isDuplicate,
        isValid,
      });

      if (isValid && type) {
        parsedValid.push({
          rowNumber,
          code,
          name,
          description: description || undefined,
          assetTypeId: type.id,
          assetSubtypeId: subtype?.id,
          locationId: location?.id,
          serialNumber: serialNumber || undefined,
          manufacturer: manufacturer || undefined,
          model: model || undefined,
          acquisitionDate,
          acquisitionCost,
          status,
          tags,
          dynamicAttributes: dynamicAttributes ?? {},
          isDuplicate,
        });
      }
    }

    return {
      totalRows: raw.length,
      validRows: validCount,
      invalidRows: raw.length - validCount,
      duplicateRows: duplicateCount,
      rows: previews,
      parsedValid,
    };
  }

  async import(
    companyId: string,
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    options: { skipDuplicates: boolean; defaultStatus?: AssetStatus },
  ) {
    const preview = await this.preview(companyId, file.buffer);

    /* Filter rows we'll actually act on. Duplicates are either skipped or
       updated, depending on the flag. */
    const toProcess = options.skipDuplicates
      ? preview.parsedValid.filter((r) => !r.isDuplicate)
      : preview.parsedValid;
    const skippedDuplicates = options.skipDuplicates
      ? preview.parsedValid.filter((r) => r.isDuplicate).length
      : 0;

    let imported = 0;
    let updated = 0;
    const importedAssets: Array<{ id: string; code: string; name: string }> = [];

    if (toProcess.length > 0) {
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        /* Process row-by-row to allow upserts on duplicates. We avoid
           createMany because we need the row-by-row upsert semantics for
           skipDuplicates=false. */
        for (const row of toProcess) {
          const status: AssetStatus =
            (row.status as AssetStatus | undefined) ?? options.defaultStatus ?? 'OPERATIONAL';
          const data: Prisma.OperationalAssetUncheckedCreateInput = {
            companyId,
            createdBy: userId,
            assetTypeId: row.assetTypeId,
            assetSubtypeId: row.assetSubtypeId ?? null,
            locationId: row.locationId ?? null,
            code: row.code,
            name: row.name,
            description: row.description,
            serialNumber: row.serialNumber,
            manufacturer: row.manufacturer,
            model: row.model,
            acquisitionDate: row.acquisitionDate ?? null,
            acquisitionCost: row.acquisitionCost ?? null,
            status,
            dynamicAttributes: (row.dynamicAttributes as Prisma.InputJsonValue | undefined) ?? {},
            tags: row.tags,
          };

          if (row.isDuplicate) {
            const updatedAsset = await tx.operationalAsset.update({
              where: { companyId_code: { companyId, code: row.code } },
              data: {
                /* Don't overwrite createdBy on updates — preserve the original
                   creator. Same for companyId. */
                assetTypeId: data.assetTypeId,
                assetSubtypeId: data.assetSubtypeId,
                locationId: data.locationId,
                name: data.name,
                description: data.description,
                serialNumber: data.serialNumber,
                manufacturer: data.manufacturer,
                model: data.model,
                acquisitionDate: data.acquisitionDate,
                acquisitionCost: data.acquisitionCost,
                status: data.status,
                dynamicAttributes: data.dynamicAttributes,
                tags: data.tags,
              },
              select: { id: true, code: true, name: true },
            });
            updated++;
            importedAssets.push(updatedAsset);
          } else {
            const created = await tx.operationalAsset.create({
              data,
              select: { id: true, code: true, name: true },
            });
            imported++;
            importedAssets.push(created);
          }
        }
      });
    }

    /* Persist the upload to MinIO when configured (best-effort — failures
       fall back to no-op so the import still succeeds). */
    const timestamp = Date.now();
    const storagePath = `imports/operations/assets/${companyId}/${timestamp}-${file.originalname}`;
    const bucket = process.env.MINIO_BUCKET || 'excelsia-documents';
    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(bucket, storagePath, file.buffer, file.mimetype);
      } catch (err) {
        this.logger.warn(`Failed to upload import file to storage: ${err}`);
      }
    }

    const errorsForLog = preview.rows
      .filter((r) => !r.isValid)
      .map((r) => ({
        row: r.rowNumber,
        errors: r.errors,
      }));

    const log = await this.prisma.importLog.create({
      data: {
        companyId,
        userId,
        entityType: 'ASSET',
        filename: file.originalname,
        storagePath,
        totalRows: preview.totalRows,
        importedRows: imported + updated,
        errorRows: preview.invalidRows,
        status:
          preview.invalidRows === 0 && skippedDuplicates === 0
            ? 'SUCCESS'
            : preview.invalidRows === preview.totalRows
              ? 'FAILED'
              : 'PARTIAL',
        errors:
          errorsForLog.length > 0
            ? (errorsForLog as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
      select: { id: true },
    });

    return {
      imported,
      updated,
      skipped: skippedDuplicates + preview.invalidRows,
      errors: preview.invalidRows,
      importLogId: log.id,
      assets: importedAssets,
    };
  }

  buildTemplateCsv(): string {
    /* Two example rows showing the supported columns. Quoted values cover
       commas inside descriptions, tags, and atributos. */
    return (
      [
        'codigo',
        'nombre',
        'descripcion',
        'tipo_activo',
        'subtipo',
        'ubicacion',
        'numero_serie',
        'fabricante',
        'modelo',
        'fecha_adquisicion',
        'costo_adquisicion',
        'estado',
        'tags',
        'atributos',
      ].join(',') +
      '\n' +
      'GEN-001,Generador Norte,"Generador principal de planta",Generador,Generador 100kVA,Planta Norte,SN-12345,Caterpillar,3406,15/03/2024,45000000,OPERATIONAL,"backup,critico","potencia:100kVA,combustible:diesel"\n' +
      'EXC-002,Excavadora 320,"Excavadora hidráulica grande",Excavadora,,Faena Sur,EX-98765,Caterpillar,320D,01/06/2023,120000000,IN_MAINTENANCE,"pesada","peso:20ton,capacidad:1.2m3"\n'
    );
  }

  /* Loads the catalogs (types/subtypes/locations) and the set of existing
     codes once — these are the lookups the row validator needs and they
     don't change during a single import. */
  private async buildResolveContext(companyId: string): Promise<ResolveCtx> {
    const [types, subtypes, locations, existing] = await Promise.all([
      this.prisma.assetType.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.assetSubtype.findMany({
        where: { assetType: { companyId }, isActive: true },
        select: { id: true, name: true, assetTypeId: true },
      }),
      this.prisma.location.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.operationalAsset.findMany({
        where: { companyId },
        select: { code: true },
      }),
    ]);

    const typesByName = new Map(types.map((t) => [t.name.toLowerCase(), t]));
    const subtypesByCompound = new Map(
      subtypes.map((s) => [`${s.assetTypeId}::${s.name.toLowerCase()}`, s]),
    );
    const locationsByName = new Map(locations.map((l) => [l.name.toLowerCase(), l]));
    const existingCodes = new Set(existing.map((e) => e.code.toUpperCase()));

    return { typesByName, subtypesByCompound, locationsByName, existingCodes };
  }
}

/* ----------------------------------------------------------------------- */

function pickString(row: RawRow, keys: string[]): string {
  for (const k of keys) {
    if (k in row) {
      const v = row[k];
      if (v !== undefined && v !== null) return String(v).trim();
    }
  }
  /* Headers might be lowercased differently (e.g. accented variants from
     Excel). Try a case-insensitive match too. */
  const lowerKeys = keys.map((k) => k.toLowerCase());
  for (const rk of Object.keys(row)) {
    if (lowerKeys.includes(rk.toLowerCase())) {
      const v = row[rk];
      if (v !== undefined && v !== null) return String(v).trim();
    }
  }
  return '';
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  /* Excel serial number — only treat as such if there are no separators. */
  if (!trimmed.includes('/') && !trimmed.includes('-') && !trimmed.includes('.')) {
    const serial = Number(trimmed);
    if (!Number.isNaN(serial) && serial > 30000 && serial < 100000) {
      const epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + serial);
      return epoch;
    }
  }

  /* DD/MM/YYYY (or with - or . separators). */
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /* YYYY-MM-DD (ISO short). */
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/* "key1:value1,key2:value2" → { key1: "value1", key2: "value2" }
   Returns `null` if any pair is malformed. */
function parseAttributes(raw: string): Record<string, string> | null {
  if (!raw) return {};
  const out: Record<string, string> = {};
  const pairs = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const idx = pair.indexOf(':');
    if (idx === -1) return null;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return null;
    out[key] = value;
  }
  return out;
}
