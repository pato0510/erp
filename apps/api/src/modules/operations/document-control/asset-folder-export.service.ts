import { Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../common/prisma/prisma.service';

/* OPS-017 — PDF + ZIP renderers for the asset documents folder. Inputs are
   the structures returned by DocumentRecordsService.getAssetFolder /
   getAssetFolderExport so this file stays free of Prisma queries beyond
   the company-name lookup needed for the cover page. */

interface FolderAsset {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  statusReason?: string | null;
  assetType?: { name: string; category: string } | null;
  assetSubtype?: { name: string } | null;
  location?: { name: string; code?: string | null; address?: string | null } | null;
}

interface ComplianceSummary {
  totalRequired: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  missing: number;
  pendingReview: number;
  rejected: number;
  compliancePercentage: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
}

interface RequiredDocumentEntry {
  documentType: {
    name: string;
    code: string;
    category: string;
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    blocksOperation: boolean;
  };
  latestRecord: {
    fileName: string;
    issueDate?: Date | string | null;
    expirationDate?: Date | string | null;
    version: number;
  } | null;
  derivedStatus: string;
  daysUntilExpiration: number | null;
  /* The upstream resolveRequirementsForAsset returns this as a plain
     string (no `as const`), so we accept that here and switch on it
     defensively. */
  resolvedFrom: string;
}

interface AdditionalDocumentEntry {
  fileName: string;
  documentType: { name: string; code: string };
  issueDate?: Date | string | null;
  expirationDate?: Date | string | null;
  derivedStatus: string;
  version: number;
}

export interface FolderData {
  asset: FolderAsset;
  compliance: ComplianceSummary;
  requiredDocuments: RequiredDocumentEntry[];
  additionalDocuments: AdditionalDocumentEntry[];
  generatedAt: string;
}

interface ExportFile {
  documentTypeCode: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

const STATUS_LABELS: Record<string, string> = {
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
  FALTANTE: 'Faltante',
  PENDIENTE_REVISION: 'Pendiente revisión',
  RECHAZADO: 'Rechazado',
  BORRADOR: 'Borrador',
  APROBADO: 'Aprobado',
  REEMPLAZADO: 'Reemplazado',
  ARCHIVADO: 'Archivado',
};

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

const CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: 'Equipo',
  VEHICLE: 'Vehículo',
  TOOL: 'Herramienta',
  INFRASTRUCTURE: 'Infraestructura',
  LEGAL: 'Legal',
  SAFETY: 'Seguridad',
  OPERATIONAL: 'Operacional',
  FINANCIAL: 'Financiero',
  TECHNICAL: 'Técnico',
  ADMINISTRATIVE: 'Administrativo',
};

@Injectable()
export class AssetFolderExportService {
  private readonly logger = new Logger(AssetFolderExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* Build the compliance PDF report. Returns a single Buffer ready to be
     streamed to the response. We collect chunks in-memory because reports
     are small (a few pages); larger payloads should switch to a streamed
     response. */
  async generateCompliancePdf(companyId: string, folder: FolderData): Promise<Buffer> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, taxId: true },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, company?.name ?? 'Empresa');
      this.renderAssetInfo(doc, folder.asset);
      this.renderComplianceSummary(doc, folder.compliance);
      this.renderRequiredTable(doc, folder.requiredDocuments);
      this.renderAdditionalTable(doc, folder.additionalDocuments);
      this.renderFooter(doc, folder.generatedAt);

      doc.end();
    });
  }

  /* Build the ZIP bundle containing the compliance PDF plus every
     APPROVED current document. archiver streams chunks; we accumulate
     them into a Buffer for the controller response. */
  async generateZipBundle(
    companyId: string,
    folder: FolderData,
    files: ExportFile[],
  ): Promise<Buffer> {
    const pdf = await this.generateCompliancePdf(companyId, folder);

    return new Promise<Buffer>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      /* archiver also emits 'warning' for non-fatal issues like ENOENT;
         we log and let the bundle continue. */
      archive.on('warning', (err: Error & { code?: string }) => {
        this.logger.warn(`ZIP warning: ${err.message}`);
      });

      archive.append(pdf, { name: 'informe.pdf' });

      /* Filenames inside the documentos/ folder are normalized so different
         filesystems don't choke on accents/spaces. We keep the original
         extension so the ZIP consumer's OS picks the right viewer. */
      const usedNames = new Set<string>();
      for (const f of files) {
        const base = `${f.documentTypeCode}-${f.fileName}`.replace(/[^\w.\- ]+/g, '_');
        let entryName = `documentos/${base}`;
        let i = 1;
        while (usedNames.has(entryName)) {
          const lastDot = base.lastIndexOf('.');
          const stem = lastDot >= 0 ? base.slice(0, lastDot) : base;
          const ext = lastDot >= 0 ? base.slice(lastDot) : '';
          entryName = `documentos/${stem}-${++i}${ext}`;
        }
        usedNames.add(entryName);
        archive.append(f.buffer, { name: entryName });
      }

      archive.finalize();
    });
  }

  /* ----- PDF section renderers ------------------------------------- */

  private renderHeader(doc: PDFKit.PDFDocument, companyName: string) {
    doc
      .fontSize(10)
      .fillColor('#64748b')
      .text(companyName, 50, 50, { align: 'left' })
      .text(`Generado: ${new Date().toLocaleString('es-CL')}`, { align: 'right' });

    doc
      .moveDown(1.2)
      .fontSize(20)
      .fillColor('#0f172a')
      .text('Carpeta documental del activo', { align: 'left' });

    doc
      .moveTo(50, doc.y + 6)
      .lineTo(545, doc.y + 6)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.moveDown(1.5);
  }

  private renderAssetInfo(doc: PDFKit.PDFDocument, asset: FolderAsset) {
    doc.fontSize(13).fillColor('#0f172a').text('Activo', { underline: false });
    doc.moveDown(0.4);
    const lines: Array<[string, string]> = [
      ['Código', asset.code],
      ['Nombre', asset.name],
      ['Tipo', asset.assetType?.name ?? '—'],
      [
        'Categoría',
        asset.assetType?.category
          ? (CATEGORY_LABELS[asset.assetType.category] ?? asset.assetType.category)
          : '—',
      ],
      ['Subtipo', asset.assetSubtype?.name ?? '—'],
      [
        'Ubicación',
        asset.location
          ? `${asset.location.name}${asset.location.address ? ` · ${asset.location.address}` : ''}`
          : '—',
      ],
      ['Estado', asset.status],
    ];
    doc.fontSize(10).fillColor('#0f172a');
    for (const [k, v] of lines) {
      const y = doc.y;
      doc.font('Helvetica-Bold').text(k, 50, y, { width: 100, continued: false });
      doc.font('Helvetica').text(v, 160, y, { width: 380 });
      doc.moveDown(0.2);
    }
    doc.moveDown(1);
  }

  private renderComplianceSummary(doc: PDFKit.PDFDocument, c: ComplianceSummary) {
    doc.fontSize(13).fillColor('#0f172a').text('Cumplimiento');
    doc.moveDown(0.4);

    const pct = c.compliancePercentage;
    const pctColor = pct >= 90 ? '#15803d' : pct >= 70 ? '#a16207' : '#b91c1c';
    doc
      .fontSize(36)
      .fillColor(pctColor)
      .text(`${pct.toFixed(1)}%`, 50, doc.y, { continued: false });
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text(`${c.valid + c.expiringSoon} de ${c.totalRequired} documentos al día`);
    doc.moveDown(0.6);

    const rows: Array<[string, number, string]> = [
      ['Vigentes', c.valid, '#15803d'],
      ['Por vencer', c.expiringSoon, '#a16207'],
      ['Vencidos', c.expired, '#b91c1c'],
      ['Faltantes', c.missing, '#b91c1c'],
      ['Pendientes de revisión', c.pendingReview, '#1d4ed8'],
      ['Rechazados', c.rejected, '#b91c1c'],
    ];
    doc.fontSize(10);
    for (const [label, n, color] of rows) {
      const y = doc.y;
      doc.fillColor(color).text(`■ ${label}`, 50, y, { width: 220, continued: false });
      doc.fillColor('#0f172a').text(String(n), 270, y, { width: 60 });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.4);
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(
        `Brechas por severidad — Crítica: ${c.bySeverity.critical} · Alta: ${c.bySeverity.high} · Media: ${c.bySeverity.medium} · Baja: ${c.bySeverity.low}`,
      );
    doc.moveDown(1);
  }

  private renderRequiredTable(doc: PDFKit.PDFDocument, rows: RequiredDocumentEntry[]) {
    doc.fontSize(13).fillColor('#0f172a').text('Documentos requeridos');
    doc.moveDown(0.4);

    if (rows.length === 0) {
      doc
        .fontSize(10)
        .fillColor('#64748b')
        .text('No hay requerimientos documentales para este activo.');
      doc.moveDown(1);
      return;
    }

    /* Group by criticality so auditors see CRITICAL gaps first. */
    const order: RequiredDocumentEntry['documentType']['criticality'][] = [
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW',
    ];
    const groups = new Map<string, RequiredDocumentEntry[]>();
    for (const r of rows) {
      const k = r.documentType.criticality;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    for (const crit of order) {
      const group = groups.get(crit);
      if (!group || group.length === 0) continue;
      doc
        .fontSize(11)
        .fillColor('#1f2937')
        .text(`Criticidad ${SEVERITY_LABELS[crit]} (${group.length})`);
      doc.moveDown(0.2);

      this.renderTableHeader(doc, [
        { label: 'Tipo', width: 180 },
        { label: 'Estado', width: 90 },
        { label: 'Vencimiento', width: 90 },
        { label: 'Versión', width: 50 },
        { label: 'Origen', width: 70 },
      ]);
      for (const r of group) {
        const exp = r.latestRecord?.expirationDate
          ? new Date(r.latestRecord.expirationDate).toLocaleDateString('es-CL')
          : '—';
        this.renderTableRow(doc, [
          { text: `${r.documentType.code} · ${r.documentType.name}`, width: 180 },
          { text: STATUS_LABELS[r.derivedStatus] ?? r.derivedStatus, width: 90 },
          { text: exp, width: 90 },
          { text: r.latestRecord ? `v${r.latestRecord.version}` : '—', width: 50 },
          {
            text:
              r.resolvedFrom === 'asset'
                ? 'Activo'
                : r.resolvedFrom === 'subtype'
                  ? 'Subtipo'
                  : 'Tipo',
            width: 70,
          },
        ]);
      }
      doc.moveDown(0.6);
    }
  }

  private renderAdditionalTable(doc: PDFKit.PDFDocument, rows: AdditionalDocumentEntry[]) {
    doc.fontSize(13).fillColor('#0f172a').text('Documentos complementarios');
    doc.moveDown(0.4);
    if (rows.length === 0) {
      doc.fontSize(10).fillColor('#64748b').text('No hay documentos complementarios cargados.');
      doc.moveDown(1);
      return;
    }
    this.renderTableHeader(doc, [
      { label: 'Tipo', width: 180 },
      { label: 'Archivo', width: 180 },
      { label: 'Estado', width: 80 },
      { label: 'Vencimiento', width: 60 },
    ]);
    for (const r of rows) {
      const exp = r.expirationDate ? new Date(r.expirationDate).toLocaleDateString('es-CL') : '—';
      this.renderTableRow(doc, [
        { text: `${r.documentType.code} · ${r.documentType.name}`, width: 180 },
        { text: r.fileName, width: 180 },
        { text: STATUS_LABELS[r.derivedStatus] ?? r.derivedStatus, width: 80 },
        { text: exp, width: 60 },
      ]);
    }
    doc.moveDown(1);
  }

  private renderTableHeader(
    doc: PDFKit.PDFDocument,
    cols: Array<{ label: string; width: number }>,
  ) {
    /* Page-break guard: if we're too close to the bottom, push a fresh
       page so the header doesn't end up orphaned from its rows. */
    if (doc.y > 700) doc.addPage();
    let x = 50;
    const y = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
    for (const c of cols) {
      doc.text(c.label.toUpperCase(), x, y, { width: c.width });
      x += c.width;
    }
    doc.font('Helvetica').fillColor('#0f172a');
    doc.moveDown(0.2);
    doc
      .moveTo(50, doc.y)
      .lineTo(50 + cols.reduce((s, c) => s + c.width, 0), doc.y)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.moveDown(0.2);
  }

  private renderTableRow(doc: PDFKit.PDFDocument, cells: Array<{ text: string; width: number }>) {
    if (doc.y > 760) doc.addPage();
    let x = 50;
    const y = doc.y;
    let rowHeight = 0;
    doc.fontSize(9).fillColor('#0f172a');
    for (const c of cells) {
      doc.text(c.text, x, y, { width: c.width - 6 });
      const used = doc.y - y;
      if (used > rowHeight) rowHeight = used;
      doc.y = y;
      x += c.width;
    }
    doc.y = y + Math.max(rowHeight, 12);
  }

  private renderFooter(doc: PDFKit.PDFDocument, generatedAt: string) {
    /* pdfkit pages are 0-indexed; we draw the footer on every page once
       the doc is complete. We add a fresh footer line at the bottom of
       the current page rather than walking pages. */
    const pageBottom = doc.page.height - 40;
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(
        `Generado por Excelsia ERP el ${new Date(generatedAt).toLocaleString('es-CL')}`,
        50,
        pageBottom,
        { width: 495, align: 'center' },
      );
  }
}
