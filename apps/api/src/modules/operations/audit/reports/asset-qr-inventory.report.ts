import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addCompanyFooter,
  addCompanyHeader,
  applyHeaderStyle,
  freezeHeader,
  newWorkbook,
} from '../../reports/excel-helpers';

/* OPS-036 (report 07) — point-in-time inventory of every asset
   that has (or is missing) a QR code for field verification. The
   token itself is only surfaced as its last 8 chars — auditors
   need to know "yes there's a token" without being handed a key
   that resolves the public scan endpoint. The full public URL is
   derived from the token plus the company-wide app base. */

export interface AssetQrInventoryFilters {
  /* Snapshot of *active* assets only by default. Inactive /
     decommissioned ones aren't auditable in the field. */
  includeInactive?: boolean;
}

@Injectable()
export class AssetQrInventoryReportGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async fetchData(companyId: string, filters: AssetQrInventoryFilters) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxId: true },
    });

    const assets = await this.prisma.operationalAsset.findMany({
      where: {
        companyId,
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        qrToken: true,
        qrGeneratedAt: true,
        qrLastScannedAt: true,
        qrScanCount: true,
        assetType: { select: { name: true, category: true } },
        location: { select: { name: true } },
      },
      orderBy: [{ assetType: { name: 'asc' } }, { code: 'asc' }],
    });

    const totalAssets = assets.length;
    const withQr = assets.filter((a) => !!a.qrToken).length;
    const withoutQr = totalAssets - withQr;
    const totalScans = assets.reduce((sum, a) => sum + a.qrScanCount, 0);
    const mostScanned = [...assets]
      .filter((a) => a.qrScanCount > 0)
      .sort((a, b) => b.qrScanCount - a.qrScanCount)[0];

    return {
      company: company ?? { name: '—', taxId: null },
      assets,
      totalAssets,
      withQr,
      withoutQr,
      totalScans,
      mostScanned,
    };
  }

  async generateExcel(companyId: string, filters: AssetQrInventoryFilters): Promise<Buffer> {
    const data = await this.fetchData(companyId, filters);
    const wb = newWorkbook();

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://app.excelsia.cl';
    const cleanBase = baseUrl.replace(/\/+$/, '');

    /* ----- Sheet 1 — Resumen ----- */
    const ws1 = wb.addWorksheet('Resumen');
    addCompanyHeader(ws1, {
      company: data.company,
      reportTitle: 'Inventario QR — verificación en terreno',
      columns: 2,
    });
    ws1.addRow(['Total de activos', data.totalAssets]);
    ws1.addRow(['Con QR generado', data.withQr]);
    ws1.addRow(['Sin QR', data.withoutQr]);
    ws1.addRow([
      'Cobertura (%)',
      data.totalAssets === 0 ? 100 : Math.round((data.withQr / data.totalAssets) * 1000) / 10,
    ]);
    ws1.addRow([]);
    ws1.addRow(['Total de escaneos (vida útil)', data.totalScans]);
    if (data.mostScanned) {
      ws1.addRow([
        'Activo más escaneado',
        `${data.mostScanned.code} — ${data.mostScanned.name} (${data.mostScanned.qrScanCount})`,
      ]);
    } else {
      ws1.addRow(['Activo más escaneado', '—']);
    }
    ws1.getColumn(1).width = 40;
    ws1.getColumn(2).width = 60;
    addCompanyFooter(ws1, { generatedAt: new Date(), columns: 2 });

    /* ----- Sheet 2 — Detalle por activo ----- */
    const ws2 = wb.addWorksheet('Detalle');
    addCompanyHeader(ws2, {
      company: data.company,
      reportTitle: 'Inventario QR detallado',
      columns: 10,
    });
    const headerRow = ws2.addRow([
      'Código',
      'Nombre',
      'Tipo',
      'Categoría',
      'Ubicación',
      'Estado activo',
      'Tiene QR',
      'Token (últimos 8 chars)',
      'URL pública',
      'Generado',
    ]);
    applyHeaderStyle(ws2, headerRow.number);
    freezeHeader(ws2, headerRow.number);

    /* Second header row could expose the scan stats but that
       overflows the column count. Instead we use a follow-up
       block of columns so the auditor sees them in the same row. */
    const ws3 = wb.addWorksheet('Estadísticas de escaneos');
    addCompanyHeader(ws3, {
      company: data.company,
      reportTitle: 'Estadísticas de escaneos por activo',
      columns: 5,
    });
    const ws3Header = ws3.addRow([
      'Código',
      'Nombre',
      'Último escaneo',
      'Total de escaneos',
      'Generado',
    ]);
    applyHeaderStyle(ws3, ws3Header.number);
    freezeHeader(ws3, ws3Header.number);

    for (const a of data.assets) {
      const tokenSuffix = a.qrToken ? `…${a.qrToken.slice(-8)}` : '—';
      const publicUrl = a.qrToken ? `${cleanBase}/p/asset/${a.qrToken}` : '—';
      ws2.addRow([
        a.code,
        a.name,
        a.assetType?.name ?? '—',
        a.assetType?.category ?? '—',
        a.location?.name ?? '—',
        a.status,
        a.qrToken ? 'Sí' : 'No',
        tokenSuffix,
        publicUrl,
        a.qrGeneratedAt ?? '',
      ]);
      ws3.addRow([a.code, a.name, a.qrLastScannedAt ?? '', a.qrScanCount, a.qrGeneratedAt ?? '']);
    }
    ws2.getColumn('J').numFmt = 'dd-mm-yyyy hh:mm';
    ws3.getColumn('C').numFmt = 'dd-mm-yyyy hh:mm';
    ws3.getColumn('E').numFmt = 'dd-mm-yyyy hh:mm';
    addCompanyFooter(ws2, { generatedAt: new Date(), columns: 10 });
    addCompanyFooter(ws3, { generatedAt: new Date(), columns: 5 });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
