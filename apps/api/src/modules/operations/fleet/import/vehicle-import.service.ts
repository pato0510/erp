import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AssetStatus, FuelType, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RlsService } from '../../../common/rls/rls.service';
import { StorageService } from '../../../common/storage/storage.service';
import {
  ParsedVehicleRow,
  VehicleImportPreviewRow,
  VehicleImportRowError,
} from './dto/vehicle-import-row.dto';

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

const MAX_YEAR = new Date().getUTCFullYear() + 1;

/* Maps the user-facing fuel labels (Spanish + English + raw enum) onto the
   FuelType enum. Comparison is case-insensitive after trimming. */
const FUEL_ALIASES: Record<string, FuelType> = {
  bencina: 'GASOLINE',
  gasolina: 'GASOLINE',
  gasoline: 'GASOLINE',
  diesel: 'DIESEL',
  diésel: 'DIESEL',
  electric: 'ELECTRIC',
  electrico: 'ELECTRIC',
  eléctrico: 'ELECTRIC',
  hibrido: 'HYBRID',
  híbrido: 'HYBRID',
  hybrid: 'HYBRID',
  gas: 'LPG',
  glp: 'LPG',
  lpg: 'LPG',
  otro: 'OTHER',
  other: 'OTHER',
};

interface RawRow {
  [key: string]: unknown;
}

interface ResolveCtx {
  /* Asset types limited to category=VEHICLE so the lookup itself enforces the
     "must be a vehicle type" rule. Non-vehicle names won't match — and we
     surface the right error. */
  vehicleTypesByName: Map<string, { id: string; name: string }>;
  /* Type names of any category, used to detect "exists but wrong category" so
     we can give a precise error instead of a generic "not found". */
  allTypesByName: Map<string, { id: string; name: string; category: string }>;
  subtypesByCompound: Map<string, { id: string; name: string; assetTypeId: string }>;
  locationsByName: Map<string, { id: string; name: string }>;
  existingCodes: Set<string>;
  existingPlates: Set<string>;
}

interface PreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: VehicleImportPreviewRow[];
  /* Internal payload reused by the import endpoint so we don't re-parse. */
  parsedValid: ParsedVehicleRow[];
}

@Injectable()
export class VehicleImportService {
  private readonly logger = new Logger(VehicleImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
    private readonly storage: StorageService,
  ) {}

  /* xlsx handles both CSV and XLSX uniformly. raw:true preserves numbers and
     Excel date serials, which we re-parse below. */
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
    const seenPlates = new Map<string, number>();
    const previews: VehicleImportPreviewRow[] = [];
    const parsedValid: ParsedVehicleRow[] = [];
    let validCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const rowNumber = i + 2; // +1 header, +1 1-indexed
      const errors: VehicleImportRowError[] = [];

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

      /* Vehicle-specific */
      const licensePlateRaw = pickString(row, ['patente', 'license_plate', 'plate']);
      const licensePlate = licensePlateRaw.trim().toUpperCase();
      const vin = pickString(row, ['vin', 'numero_chasis', 'chassis']).trim().toUpperCase();
      const yearRaw = pickString(row, ['año', 'ano', 'year']);
      const kilometersRaw = pickString(row, [
        'kilometraje',
        'km',
        'current_kilometers',
        'kilometers',
      ]);
      const fuelRaw = pickString(row, ['combustible', 'fuel', 'fuel_type']);
      const registrationDateRaw = pickString(row, [
        'fecha_inscripcion',
        'fecha_inscripción',
        'registration_date',
      ]);
      const color = pickString(row, ['color']);

      if (!code) errors.push({ field: 'codigo', message: 'El código es obligatorio.' });
      if (!name) errors.push({ field: 'nombre', message: 'El nombre es obligatorio.' });
      if (!typeName) {
        errors.push({ field: 'tipo_activo', message: 'El tipo de activo es obligatorio.' });
      }
      if (!licensePlate) {
        errors.push({ field: 'patente', message: 'La patente es obligatoria.' });
      }
      if (!fuelRaw) {
        errors.push({ field: 'combustible', message: 'El tipo de combustible es obligatorio.' });
      }

      /* Asset type lookup — must exist AND have category=VEHICLE. We split the
         "exists" check from the "is vehicle" check so the error is precise. */
      let type: { id: string; name: string } | undefined;
      if (typeName) {
        const candidate = ctx.allTypesByName.get(typeName.toLowerCase());
        if (!candidate) {
          errors.push({
            field: 'tipo_activo',
            message: `Tipo de activo "${typeName}" no existe. Crea el tipo en Configuración antes de importar.`,
          });
        } else if (candidate.category !== 'VEHICLE') {
          errors.push({
            field: 'tipo_activo',
            message: `El tipo "${candidate.name}" no es un vehículo. Categoría requerida: VEHICLE`,
          });
        } else {
          type = ctx.vehicleTypesByName.get(typeName.toLowerCase());
        }
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

      /* Vehicle-specific validation */
      if (licensePlate && !/^[A-Z0-9-]+$/.test(licensePlate)) {
        errors.push({
          field: 'patente',
          message: `Patente "${licensePlateRaw}" inválida. Sólo letras, números y guiones.`,
        });
      }

      if (vin && vin.length > 17) {
        errors.push({
          field: 'vin',
          message: `VIN "${vin}" excede 17 caracteres.`,
        });
      }

      let year: number | undefined;
      if (yearRaw) {
        const y = Number(String(yearRaw).trim());
        if (!Number.isInteger(y) || y < 1900 || y > MAX_YEAR) {
          errors.push({
            field: 'año',
            message: `Año "${yearRaw}" fuera de rango. Debe estar entre 1900 y ${MAX_YEAR}.`,
          });
        } else {
          year = y;
        }
      }

      let currentKilometers: number | undefined;
      if (kilometersRaw) {
        const cleaned = String(kilometersRaw).replace(/\./g, '').replace(/,/g, '');
        const n = Number(cleaned);
        if (!Number.isInteger(n) || n < 0) {
          errors.push({
            field: 'kilometraje',
            message: `Kilometraje "${kilometersRaw}" inválido. Debe ser un entero ≥ 0.`,
          });
        } else {
          currentKilometers = n;
        }
      }

      let fuelType: FuelType | undefined;
      if (fuelRaw) {
        const key = fuelRaw.trim().toLowerCase();
        const mapped = FUEL_ALIASES[key];
        if (!mapped) {
          errors.push({
            field: 'combustible',
            message: `Combustible "${fuelRaw}" no reconocido. Valores: Bencina, Diésel, Eléctrico, Híbrido, Gas, Otro.`,
          });
        } else {
          fuelType = mapped;
        }
      }

      let registrationDate: Date | undefined;
      if (registrationDateRaw) {
        const parsed = parseDate(registrationDateRaw);
        if (!parsed) {
          errors.push({
            field: 'fecha_inscripcion',
            message: `Fecha inválida "${registrationDateRaw}". Usa formato DD/MM/YYYY.`,
          });
        } else {
          registrationDate = parsed;
        }
      }

      /* Within-file duplicates: surface as errors so the user fixes the file.
         DB duplicates are tracked separately so the wizard can offer "skip
         duplicates" (upsert by code). License plate dup-against-DB is always a
         hard error — we never auto-update a vehicle just because plates match,
         since plates can be reassigned and that would corrupt history. */
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

      if (licensePlate) {
        const seenAtPlate = seenPlates.get(licensePlate);
        if (seenAtPlate !== undefined) {
          errors.push({
            field: 'patente',
            message: `Patente "${licensePlate}" duplicada en este archivo (también en fila ${seenAtPlate}).`,
          });
        } else {
          seenPlates.set(licensePlate, rowNumber);
        }
        /* Plate already in DB but the asset code is new → conflict. We can't
           upsert because the relationship is "one vehicle per plate". */
        if (ctx.existingPlates.has(licensePlate) && !isDuplicate) {
          errors.push({
            field: 'patente',
            message: `Patente "${licensePlate}" ya está registrada en otro vehículo.`,
          });
        }
      }

      const isValid =
        errors.length === 0 && !!code && !!name && !!type && !!licensePlate && !!fuelType;
      if (isValid) validCount++;
      if (isDuplicate && isValid) duplicateCount++;

      previews.push({
        rowNumber,
        data: {
          code,
          name,
          licensePlate,
          assetTypeName: typeName || undefined,
          subtypeName: subtypeName || undefined,
          locationName: locationName || undefined,
          fuelType: fuelRaw || undefined,
          status: statusRaw || undefined,
        },
        errors,
        isDuplicate,
        isValid,
      });

      if (isValid && type && fuelType) {
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
          licensePlate,
          vin: vin || undefined,
          year,
          currentKilometers,
          fuelType,
          registrationDate,
          color: color || undefined,
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

    /* When skipDuplicates is on we drop DB-duplicate codes; otherwise they get
       upserted onto the existing OperationalAsset row (the underlying Vehicle
       row keeps its plate — re-importing is for fixing asset metadata, not
       reissuing plates). */
    const toProcess = options.skipDuplicates
      ? preview.parsedValid.filter((r) => !r.isDuplicate)
      : preview.parsedValid;
    const skippedDuplicates = options.skipDuplicates
      ? preview.parsedValid.filter((r) => r.isDuplicate).length
      : 0;

    let imported = 0;
    let updated = 0;
    const importedVehicles: Array<{
      id: string;
      code: string;
      name: string;
      licensePlate: string;
    }> = [];

    if (toProcess.length > 0) {
      await this.rlsService.executeWithRls(companyId, userId, async (tx) => {
        for (const row of toProcess) {
          const status: AssetStatus =
            (row.status as AssetStatus | undefined) ?? options.defaultStatus ?? 'OPERATIONAL';

          if (row.isDuplicate) {
            /* Asset already exists. Update OperationalAsset metadata and the
               Vehicle extension (plate-by-asset is 1:1). The lastKmUpdate
               timestamp is bumped only if the kilometers actually changed —
               same rule as the manual update flow. */
            const existingAsset = await tx.operationalAsset.findUnique({
              where: { companyId_code: { companyId, code: row.code } },
              select: {
                id: true,
                vehicle: { select: { id: true, currentKilometers: true } },
              },
            });
            if (!existingAsset) {
              /* Race condition / concurrent delete — fall through to create. */
              imported += await this.createVehicle(tx, companyId, userId, row, status);
              const v = await tx.vehicle.findFirst({
                where: { asset: { companyId, code: row.code } },
                select: {
                  id: true,
                  licensePlate: true,
                  asset: { select: { code: true, name: true } },
                },
              });
              if (v) {
                importedVehicles.push({
                  id: v.id,
                  code: v.asset.code,
                  name: v.asset.name,
                  licensePlate: v.licensePlate,
                });
              }
              continue;
            }

            await tx.operationalAsset.update({
              where: { id: existingAsset.id },
              data: {
                assetTypeId: row.assetTypeId,
                assetSubtypeId: row.assetSubtypeId ?? null,
                locationId: row.locationId ?? null,
                name: row.name,
                description: row.description,
                serialNumber: row.serialNumber,
                manufacturer: row.manufacturer,
                model: row.model,
                acquisitionDate: row.acquisitionDate ?? null,
                acquisitionCost: row.acquisitionCost ?? null,
                status,
                tags: row.tags,
              },
            });

            const kmChanged =
              row.currentKilometers != null &&
              existingAsset.vehicle != null &&
              row.currentKilometers !== existingAsset.vehicle.currentKilometers;

            if (existingAsset.vehicle) {
              const v = await tx.vehicle.update({
                where: { id: existingAsset.vehicle.id },
                data: {
                  licensePlate: row.licensePlate,
                  vin: row.vin ?? null,
                  year: row.year ?? null,
                  ...(row.currentKilometers != null
                    ? { currentKilometers: row.currentKilometers }
                    : {}),
                  ...(kmChanged ? { lastKmUpdate: new Date() } : {}),
                  fuelType: row.fuelType,
                  registrationDate: row.registrationDate ?? null,
                  color: row.color ?? null,
                },
                select: {
                  id: true,
                  licensePlate: true,
                  asset: { select: { code: true, name: true } },
                },
              });
              importedVehicles.push({
                id: v.id,
                code: v.asset.code,
                name: v.asset.name,
                licensePlate: v.licensePlate,
              });
            } else {
              /* Asset existed but had no Vehicle row (legacy data). Attach a
                 fresh Vehicle extension. */
              const v = await tx.vehicle.create({
                data: {
                  assetId: existingAsset.id,
                  licensePlate: row.licensePlate,
                  vin: row.vin ?? null,
                  year: row.year ?? null,
                  currentKilometers: row.currentKilometers ?? 0,
                  lastKmUpdate: row.currentKilometers != null ? new Date() : null,
                  fuelType: row.fuelType,
                  registrationDate: row.registrationDate ?? null,
                  color: row.color ?? null,
                },
                select: {
                  id: true,
                  licensePlate: true,
                  asset: { select: { code: true, name: true } },
                },
              });
              importedVehicles.push({
                id: v.id,
                code: v.asset.code,
                name: v.asset.name,
                licensePlate: v.licensePlate,
              });
            }
            updated++;
          } else {
            const created = await this.createVehicleAndCollect(tx, companyId, userId, row, status);
            importedVehicles.push(created);
            imported++;
          }
        }
      });
    }

    /* Best-effort upload of the source file for audit. Failures are logged
       but don't fail the import. */
    const timestamp = Date.now();
    const storagePath = `imports/operations/vehicles/${companyId}/${timestamp}-${file.originalname}`;
    const bucket = process.env.MINIO_BUCKET || 'excelsia-documents';
    if (this.storage.isConfigured()) {
      try {
        await this.storage.uploadFile(bucket, storagePath, file.buffer, file.mimetype);
      } catch (err) {
        this.logger.warn(`Failed to upload vehicle import file to storage: ${err}`);
      }
    }

    const errorsForLog = preview.rows
      .filter((r) => !r.isValid)
      .map((r) => ({ row: r.rowNumber, errors: r.errors }));

    const log = await this.prisma.importLog.create({
      data: {
        companyId,
        userId,
        entityType: 'VEHICLE',
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
      vehicles: importedVehicles,
    };
  }

  buildTemplateCsv(): string {
    /* The header set matches the spec's example. Two example rows demonstrate
       both OPERATIONAL and IN_MAINTENANCE plus tags with commas (hence the
       quoted CSV fields). Note: 'codigo','nombre','patente' come first so a
       user scanning the file sees the most-required columns immediately. */
    return (
      [
        'codigo',
        'nombre',
        'descripcion',
        'tipo_activo',
        'subtipo',
        'ubicacion',
        'patente',
        'vin',
        'año',
        'combustible',
        'kilometraje',
        'fecha_inscripcion',
        'color',
        'fabricante',
        'modelo',
        'numero_serie',
        'fecha_adquisicion',
        'costo_adquisicion',
        'estado',
        'tags',
      ].join(',') +
      '\n' +
      'VEH-001,Camioneta Marketing,"Hilux para visitas a clientes",Camioneta,,Oficina Central,AABB12,1HGBH41JXMN109186,2023,Diésel,15000,15/03/2023,Blanco,Toyota,Hilux,SN-12345,15/03/2023,28000000,OPERATIONAL,"comercial,4x4"\n' +
      'VEH-002,Camión Mina #3,"Camión de extracción",Camión,Camión 4x4,Faena Norte,CCDD34,2HGBH41JXMN109187,2022,Diésel,85000,01/06/2022,Amarillo,Mercedes-Benz,Atego,SN-67890,01/06/2022,75000000,IN_MAINTENANCE,"pesado,mineria"\n'
    );
  }

  /* Loads vehicle-only AssetTypes (filtered server-side), all-category
     AssetTypes (for friendlier "wrong category" errors), subtypes, locations,
     and the existing-codes/existing-plates indexes. */
  private async buildResolveContext(companyId: string): Promise<ResolveCtx> {
    const [allTypes, vehicleTypes, subtypes, locations, existing, existingVehicles] =
      await Promise.all([
        this.prisma.assetType.findMany({
          where: { companyId, isActive: true },
          select: { id: true, name: true, category: true },
        }),
        this.prisma.assetType.findMany({
          where: { companyId, isActive: true, category: 'VEHICLE' },
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
        this.prisma.vehicle.findMany({
          where: { asset: { companyId } },
          select: { licensePlate: true },
        }),
      ]);

    return {
      allTypesByName: new Map(allTypes.map((t) => [t.name.toLowerCase(), t])),
      vehicleTypesByName: new Map(vehicleTypes.map((t) => [t.name.toLowerCase(), t])),
      subtypesByCompound: new Map(
        subtypes.map((s) => [`${s.assetTypeId}::${s.name.toLowerCase()}`, s]),
      ),
      locationsByName: new Map(locations.map((l) => [l.name.toLowerCase(), l])),
      existingCodes: new Set(existing.map((e) => e.code.toUpperCase())),
      existingPlates: new Set(existingVehicles.map((v) => v.licensePlate.toUpperCase())),
    };
  }

  /* Helper for the rare "duplicate code disappeared between preview and
     import" race — performs the create+attach inside the import transaction
     and returns 1 so the caller can bump the imported counter. */
  private async createVehicle(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    row: ParsedVehicleRow,
    status: AssetStatus,
  ): Promise<number> {
    const asset = await tx.operationalAsset.create({
      data: {
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
        tags: row.tags,
      },
      select: { id: true },
    });
    await tx.vehicle.create({
      data: {
        assetId: asset.id,
        licensePlate: row.licensePlate,
        vin: row.vin ?? null,
        year: row.year ?? null,
        currentKilometers: row.currentKilometers ?? 0,
        lastKmUpdate: row.currentKilometers != null ? new Date() : null,
        fuelType: row.fuelType,
        registrationDate: row.registrationDate ?? null,
        color: row.color ?? null,
      },
    });
    return 1;
  }

  /* Same as createVehicle but returns the freshly-created identifiers so the
     caller can include them in the import response. */
  private async createVehicleAndCollect(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    row: ParsedVehicleRow,
    status: AssetStatus,
  ): Promise<{ id: string; code: string; name: string; licensePlate: string }> {
    const asset = await tx.operationalAsset.create({
      data: {
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
        tags: row.tags,
      },
      select: { id: true, code: true, name: true },
    });
    const vehicle = await tx.vehicle.create({
      data: {
        assetId: asset.id,
        licensePlate: row.licensePlate,
        vin: row.vin ?? null,
        year: row.year ?? null,
        currentKilometers: row.currentKilometers ?? 0,
        lastKmUpdate: row.currentKilometers != null ? new Date() : null,
        fuelType: row.fuelType,
        registrationDate: row.registrationDate ?? null,
        color: row.color ?? null,
      },
      select: { id: true, licensePlate: true },
    });
    return {
      id: vehicle.id,
      code: asset.code,
      name: asset.name,
      licensePlate: vehicle.licensePlate,
    };
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
  /* Case-insensitive fallback for accented/lowercased headers. */
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
  /* Excel serial — only accept when there are no separators. */
  if (!trimmed.includes('/') && !trimmed.includes('-') && !trimmed.includes('.')) {
    const serial = Number(trimmed);
    if (!Number.isNaN(serial) && serial > 30000 && serial < 100000) {
      const epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + serial);
      return epoch;
    }
  }

  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}
