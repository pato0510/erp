import { randomBytes } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssetStatus, DocumentCriticality, DocumentRecordStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RlsService } from '../../common/rls/rls.service';

/* OPS-035 — public-scan QR codes per operational asset.
   The token printed on the sticker is independent of the internal
   asset id; rotating it (regenerate) invalidates the old sticker
   without losing the asset's history. The scan endpoint is open
   (no auth) but returns a deliberately limited view; signed-in
   callers from the same company get an extended payload through a
   sibling endpoint. */

/* PNG canvas — slightly oversized so the printed sticker stays
   crisp at 5 cm. */
const QR_PNG_WIDTH = 400;

/* SVG viewBox is intentionally smaller than the PNG so consumers
   can scale freely without rasterizing the source. */
const QR_SVG_SIZE = 200;

/* 24 bytes → 32 base64url chars. Effectively zero collision
   probability across all assets ever. */
const TOKEN_BYTES = 24;

/* Bulk generation parallelism. Each token generation is a single
   UPDATE — keep the fan-out modest so we don't fight ourselves on
   the connection pool. */
const BULK_CONCURRENCY = 10;

const STATUS_LABELS: Record<AssetStatus, string> = {
  OPERATIONAL: 'Operativo',
  WITH_OBSERVATIONS: 'Con observaciones',
  NON_OPERATIONAL: 'No operativo',
  IN_MAINTENANCE: 'En mantenimiento',
  BLOCKED_DOCUMENTAL: 'Bloqueado por documentos',
  BLOCKED_PERMIT: 'Bloqueado por permisos',
  OUT_OF_SERVICE: 'Fuera de servicio',
  DECOMMISSIONED: 'Dado de baja',
};

type StatusColor = 'green' | 'yellow' | 'red' | 'gray';
const STATUS_COLORS: Record<AssetStatus, StatusColor> = {
  OPERATIONAL: 'green',
  WITH_OBSERVATIONS: 'yellow',
  NON_OPERATIONAL: 'red',
  IN_MAINTENANCE: 'yellow',
  BLOCKED_DOCUMENTAL: 'red',
  BLOCKED_PERMIT: 'red',
  OUT_OF_SERVICE: 'gray',
  DECOMMISSIONED: 'gray',
};

/* Derived per-document status the public view exposes. Mirrors the
   labels DocumentStatusBadge already renders on the dashboard. */
type DerivedDocStatus = 'VIGENTE' | 'POR_VENCER' | 'VENCIDO' | 'FALTANTE';

interface PublicDocumentEntry {
  typeName: string;
  typeCode: string;
  criticality: DocumentCriticality;
  status: DerivedDocStatus;
  expirationDate: string | null;
  daysRemaining: number | null;
}

interface AuthenticatedDocumentEntry extends PublicDocumentEntry {
  documentRecordId: string | null;
  downloadUrl: string | null;
}

export interface PublicAssetView {
  code: string;
  name: string;
  status: AssetStatus;
  statusLabel: string;
  statusColor: StatusColor;
  type: { name: string; icon: string | null };
  subtype: { name: string } | null;
  location: { name: string } | null;
  photo: { url: string } | null;
  documentCompliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    compliancePercentage: number;
    documents: PublicDocumentEntry[];
  };
  activeAlerts: number;
  hasActiveException: boolean;
  exceptionExpiresAt: string | null;
  scannedAt: string;
  scanCount: number;
  meta: {
    publicView: true;
    canSeeMore: false;
    company: { name: string };
  };
}

export interface AuthenticatedAssetView
  extends Omit<PublicAssetView, 'documentCompliance' | 'meta'> {
  documentCompliance: {
    totalRequired: number;
    valid: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    compliancePercentage: number;
    documents: AuthenticatedDocumentEntry[];
  };
  activeAlertsList: Array<{
    id: string;
    title: string;
    severity: string;
    triggeredAt: string;
  }>;
  meta: {
    publicView: false;
    canSeeMore: true;
    fullDetailUrl: string;
    assetId: string;
  };
}

export interface BulkGenerateResult {
  generated: number;
  skipped: number;
  errors: Array<{ assetId: string; reason: string }>;
}

@Injectable()
export class AssetQrService {
  private readonly logger = new Logger(AssetQrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsService: RlsService,
  ) {}

  /* Idempotent — returns the existing token if the asset already
     has one. Concurrent calls for the same asset can race; we
     guard with a re-read after the UPDATE. */
  async ensureQrToken(companyId: string, assetId: string): Promise<string> {
    const existing = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { qrToken: true },
    });
    if (!existing) {
      throw new NotFoundException('Activo no encontrado.');
    }
    if (existing.qrToken) return existing.qrToken;

    const token = await this.generateUniqueToken();
    await this.rlsService.executeWithRls(companyId, null, (tx) =>
      tx.operationalAsset.update({
        where: { id: assetId },
        data: { qrToken: token, qrGeneratedAt: new Date() },
      }),
    );
    return token;
  }

  /* Issues a new token unconditionally. The previous one becomes
     unfindable, so any stickers in the field stop resolving — that
     is the point: revocation. Resets the scan counter. */
  async regenerateQrToken(companyId: string, assetId: string, userId: string): Promise<string> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');

    const token = await this.generateUniqueToken();
    await this.rlsService.executeWithRls(companyId, userId, (tx) =>
      tx.operationalAsset.update({
        where: { id: assetId },
        data: {
          qrToken: token,
          qrGeneratedAt: new Date(),
          qrLastScannedAt: null,
          qrScanCount: 0,
        },
      }),
    );
    return token;
  }

  async generateQrPng(companyId: string, assetId: string): Promise<Buffer> {
    const url = await this.publicUrlFor(companyId, assetId);
    return QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: QR_PNG_WIDTH,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }

  async generateQrSvg(companyId: string, assetId: string): Promise<string> {
    const url = await this.publicUrlFor(companyId, assetId);
    return QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: QR_SVG_SIZE,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }

  /* 10×10 cm or 5×5 cm printable label. Layout (10 cm version):
     ┌──────────────────────────┐
     │    ▲ EXCELSIA            │  header strip (~15%)
     │ ─────────────────────── │
     │                          │
     │      [QR CODE]           │  centered (~65%)
     │                          │
     │                          │
     │ ────────────────────── │
     │ ABC-001                  │  asset code (mono, large)
     │ Compresor de tornillo    │  asset name (smaller)
     │ app.excelsia.cl/p/asset… │  fallback URL (tiny)
     └──────────────────────────┘ */
  async generateQrPdfLabel(
    companyId: string,
    assetId: string,
    size: '10cm' | '5cm' = '10cm',
  ): Promise<Buffer> {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { id: true, code: true, name: true, qrToken: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado.');
    const token = asset.qrToken ?? (await this.ensureQrToken(companyId, assetId));
    const url = this.buildPublicUrl(token);

    /* PDF point math: 1 cm = 28.346pt. Stay defensive — if a caller
       passes something unexpected, fall back to 10 cm. */
    const sidePt = size === '5cm' ? 141.73 : 283.46;
    const margin = sidePt * 0.05;
    const innerW = sidePt - margin * 2;

    /* Render the QR ahead of the PDF so we can embed it as a PNG
       buffer (pdfkit can rasterize PNGs natively, no extra deps). */
    const qrPng = await QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: Math.round(innerW * 4),
      color: { dark: '#000000', light: '#ffffff' },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: [sidePt, sidePt], margin });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const headerH = sidePt * 0.15;
      const footerH = sidePt * 0.2;
      const qrAreaY = margin + headerH;
      const qrAreaH = sidePt - headerH - footerH - margin * 2;

      /* Header — the logo is an SVG component on the frontend. We
         draw a simplified mark + wordmark directly here so the PDF
         stays self-contained (no asset bundling at build time). */
      doc.save();
      doc
        .strokeColor('#2563EB')
        .lineWidth(1.4)
        .polygon(
          [margin + 2, margin + headerH * 0.65],
          [margin + (headerH * 0.55) / 2 + headerH * 0.15, margin + headerH * 0.15],
          [margin + headerH * 0.55, margin + headerH * 0.65],
        )
        .stroke();
      doc.restore();
      doc
        .font('Courier-Bold')
        .fontSize(size === '5cm' ? 8 : 10)
        .fillColor('#1C1C1E')
        .text('EXCELSIA.', margin + headerH * 0.7, margin + headerH * 0.35, {
          characterSpacing: 1.4,
        });

      /* Hairline under the header */
      doc
        .moveTo(margin, margin + headerH)
        .lineTo(sidePt - margin, margin + headerH)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();

      /* QR code centered in its area */
      const qrSize = Math.min(qrAreaH, innerW);
      const qrX = (sidePt - qrSize) / 2;
      const qrY = qrAreaY + (qrAreaH - qrSize) / 2;
      doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

      /* Footer block — code, name, URL */
      const footerY = sidePt - footerH - margin / 2;
      doc
        .moveTo(margin, footerY)
        .lineTo(sidePt - margin, footerY)
        .strokeColor('#e2e8f0')
        .stroke();

      doc
        .font('Courier-Bold')
        .fontSize(size === '5cm' ? 11 : 16)
        .fillColor('#0f172a')
        .text(asset.code, margin, footerY + 4, {
          width: innerW,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fontSize(size === '5cm' ? 7 : 9)
        .fillColor('#475569')
        .text(asset.name, margin, doc.y + 1, {
          width: innerW,
          align: 'center',
          ellipsis: true,
        });

      doc
        .font('Courier')
        .fontSize(size === '5cm' ? 5 : 6.5)
        .fillColor('#94a3b8')
        .text(this.urlForLabel(token), margin, sidePt - margin - (size === '5cm' ? 7 : 9), {
          width: innerW,
          align: 'center',
        });

      doc.end();
    });
  }

  /* Public scan — no companyId in scope. Resolves the token, builds
     the limited view, atomically increments the scan counter. The
     unique constraint on qrToken means the lookup is O(1) on the
     index. */
  async resolvePublicScan(qrToken: string): Promise<PublicAssetView | null> {
    if (!qrToken || qrToken.length < 8) return null;
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { qrToken, isActive: true },
      include: {
        assetType: { select: { name: true, icon: true } },
        assetSubtype: { select: { name: true } },
        location: { select: { name: true } },
      },
    });
    if (!asset) return null;

    /* Counter increment runs in its own transaction with the
       company's RLS context so the audit trigger captures it
       correctly. We deliberately do NOT pass userId — the public
       scan has no actor. */
    const now = new Date();
    let updatedScanCount = asset.qrScanCount + 1;
    try {
      const updated = await this.rlsService.executeWithRls(asset.companyId, null, (tx) =>
        tx.operationalAsset.update({
          where: { id: asset.id },
          data: {
            qrLastScannedAt: now,
            qrScanCount: { increment: 1 },
          },
          select: { qrScanCount: true },
        }),
      );
      updatedScanCount = updated.qrScanCount;
    } catch (err) {
      /* Counter update failure must not break the public view — log
         and serve the response with the pre-increment count. */
      this.logger.warn(
        `resolvePublicScan: scan counter update failed for ${asset.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const compliance = await this.computeAssetCompliance(asset.companyId, asset.id);
    const activeAlerts = await this.prisma.alertInstance.count({
      where: { companyId: asset.companyId, assetId: asset.id, status: 'ACTIVE' },
    });
    const exception = await this.prisma.assetException.findFirst({
      where: {
        companyId: asset.companyId,
        assetId: asset.id,
        status: 'APPROVED',
        validUntil: { gt: now },
      },
      select: { validUntil: true },
      orderBy: { validUntil: 'desc' },
    });
    const company = await this.prisma.company.findUnique({
      where: { id: asset.companyId },
      select: { name: true },
    });

    return {
      code: asset.code,
      name: asset.name,
      status: asset.status,
      statusLabel: STATUS_LABELS[asset.status],
      statusColor: STATUS_COLORS[asset.status],
      type: { name: asset.assetType.name, icon: asset.assetType.icon ?? null },
      subtype: asset.assetSubtype ? { name: asset.assetSubtype.name } : null,
      location: asset.location ? { name: asset.location.name } : null,
      photo: null,
      documentCompliance: {
        totalRequired: compliance.totalRequired,
        valid: compliance.valid,
        expiringSoon: compliance.expiringSoon,
        expired: compliance.expired,
        missing: compliance.missing,
        compliancePercentage: compliance.compliancePercentage,
        documents: compliance.documents.map((d) => ({
          typeName: d.typeName,
          typeCode: d.typeCode,
          criticality: d.criticality,
          status: d.status,
          expirationDate: d.expirationDate ? d.expirationDate.toISOString() : null,
          daysRemaining: d.daysRemaining,
        })),
      },
      activeAlerts,
      hasActiveException: !!exception,
      exceptionExpiresAt: exception?.validUntil?.toISOString() ?? null,
      scannedAt: now.toISOString(),
      scanCount: updatedScanCount,
      meta: {
        publicView: true,
        canSeeMore: false,
        company: { name: company?.name ?? '—' },
      },
    };
  }

  /* Authenticated extension — same shape as the public view plus
     internal IDs and download URLs. The visitor's company must
     match the asset's company; cross-tenant scans degrade to the
     public view (caller decides). */
  async getAuthenticatedScanView(
    qrToken: string,
    companyId: string,
  ): Promise<AuthenticatedAssetView | null> {
    if (!qrToken || qrToken.length < 8) return null;
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { qrToken, companyId, isActive: true },
      include: {
        assetType: { select: { name: true, icon: true, category: true } },
        assetSubtype: { select: { name: true } },
        location: { select: { name: true } },
        vehicle: { select: { id: true } },
      },
    });
    if (!asset) return null;

    const now = new Date();
    /* Same counter increment as the public path. We do it here too
       so that a logged-in scan still bumps the audit numbers. */
    let updatedScanCount = asset.qrScanCount + 1;
    try {
      const updated = await this.rlsService.executeWithRls(companyId, null, (tx) =>
        tx.operationalAsset.update({
          where: { id: asset.id },
          data: { qrLastScannedAt: now, qrScanCount: { increment: 1 } },
          select: { qrScanCount: true },
        }),
      );
      updatedScanCount = updated.qrScanCount;
    } catch (err) {
      this.logger.warn(
        `getAuthenticatedScanView: scan counter update failed for ${asset.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const compliance = await this.computeAssetCompliance(companyId, asset.id);
    const [alerts, exception, company] = await Promise.all([
      this.prisma.alertInstance.findMany({
        where: { companyId, assetId: asset.id, status: 'ACTIVE' },
        select: { id: true, title: true, severity: true, triggeredAt: true },
        orderBy: { triggeredAt: 'desc' },
        take: 20,
      }),
      this.prisma.assetException.findFirst({
        where: {
          companyId,
          assetId: asset.id,
          status: 'APPROVED',
          validUntil: { gt: now },
        },
        select: { validUntil: true },
        orderBy: { validUntil: 'desc' },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
    ]);

    /* Vehicles get a different detail URL than equipment. Match the
       sidebar routing so the "Ver detalle completo" link lands the
       user on the right ficha 360. */
    const isVehicle = asset.assetType.category === 'VEHICLE';
    const fullDetailUrl = isVehicle
      ? `/operaciones/vehiculos/${asset.id}`
      : `/operaciones/equipos/${asset.id}`;

    return {
      code: asset.code,
      name: asset.name,
      status: asset.status,
      statusLabel: STATUS_LABELS[asset.status],
      statusColor: STATUS_COLORS[asset.status],
      type: { name: asset.assetType.name, icon: asset.assetType.icon ?? null },
      subtype: asset.assetSubtype ? { name: asset.assetSubtype.name } : null,
      location: asset.location ? { name: asset.location.name } : null,
      photo: null,
      documentCompliance: {
        totalRequired: compliance.totalRequired,
        valid: compliance.valid,
        expiringSoon: compliance.expiringSoon,
        expired: compliance.expired,
        missing: compliance.missing,
        compliancePercentage: compliance.compliancePercentage,
        documents: compliance.documents.map((d) => ({
          typeName: d.typeName,
          typeCode: d.typeCode,
          criticality: d.criticality,
          status: d.status,
          expirationDate: d.expirationDate ? d.expirationDate.toISOString() : null,
          daysRemaining: d.daysRemaining,
          documentRecordId: d.documentRecordId,
          downloadUrl: d.documentRecordId
            ? `/api/operations/documents/${d.documentRecordId}/file`
            : null,
        })),
      },
      activeAlerts: alerts.length,
      activeAlertsList: alerts.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        triggeredAt: a.triggeredAt.toISOString(),
      })),
      hasActiveException: !!exception,
      exceptionExpiresAt: exception?.validUntil?.toISOString() ?? null,
      scannedAt: now.toISOString(),
      scanCount: updatedScanCount,
      meta: {
        publicView: false,
        canSeeMore: true,
        fullDetailUrl,
        assetId: asset.id,
      },
    };
  }

  /* Bulk seed — generates tokens for every active asset that
     doesn't have one yet. Skips already-tokened assets and
     captures per-asset failures so the admin sees what (if
     anything) needs follow-up. */
  async bulkGenerateForCompany(companyId: string): Promise<BulkGenerateResult> {
    const targets = await this.prisma.operationalAsset.findMany({
      where: { companyId, isActive: true, qrToken: null },
      select: { id: true },
    });
    const result: BulkGenerateResult = {
      generated: 0,
      skipped: 0,
      errors: [],
    };
    /* Run in chunks to keep the connection pool healthy. */
    for (let i = 0; i < targets.length; i += BULK_CONCURRENCY) {
      const slice = targets.slice(i, i + BULK_CONCURRENCY);
      await Promise.all(
        slice.map(async (a) => {
          try {
            await this.ensureQrToken(companyId, a.id);
            result.generated++;
          } catch (err) {
            result.errors.push({
              assetId: a.id,
              reason: err instanceof Error ? err.message : 'Error desconocido',
            });
          }
        }),
      );
    }
    return result;
  }

  /* Aggregate counts for the admin "Códigos QR" card. */
  async getCompanyQrStats(
    companyId: string,
  ): Promise<{ totalAssets: number; withQr: number; withoutQr: number }> {
    const [total, withQr] = await Promise.all([
      this.prisma.operationalAsset.count({
        where: { companyId, isActive: true },
      }),
      this.prisma.operationalAsset.count({
        where: { companyId, isActive: true, qrToken: { not: null } },
      }),
    ]);
    return { totalAssets: total, withQr, withoutQr: total - withQr };
  }

  /* ---- helpers --------------------------------------------------- */

  private async generateUniqueToken(): Promise<string> {
    /* Probability of collision is astronomically low, but the unique
       constraint will throw if it ever happens. Retry a handful of
       times before giving up. */
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomBytes(TOKEN_BYTES).toString('base64url');
      const exists = await this.prisma.operationalAsset.findUnique({
        where: { qrToken: token },
        select: { id: true },
      });
      if (!exists) return token;
    }
    throw new Error('No se pudo generar un token único después de 5 intentos.');
  }

  private async publicUrlFor(companyId: string, assetId: string): Promise<string> {
    const token = await this.ensureQrToken(companyId, assetId);
    return this.buildPublicUrl(token);
  }

  private buildPublicUrl(token: string): string {
    const base =
      process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://app.excelsia.cl';
    return `${base.replace(/\/+$/, '')}/p/asset/${token}`;
  }

  /* Shorter form printed under the QR — strips the protocol so the
     fallback URL fits on a 5 cm sticker. */
  private urlForLabel(token: string): string {
    return this.buildPublicUrl(token).replace(/^https?:\/\//, '');
  }

  /* Per-asset compliance — same matrix logic the dashboard service
     uses (asset > subtype > type), tailored to one asset so the
     query stays cheap. Returns the per-document breakdown plus
     aggregated counts. */
  private async computeAssetCompliance(companyId: string, assetId: string) {
    const asset = await this.prisma.operationalAsset.findFirst({
      where: { id: assetId, companyId },
      select: { id: true, assetTypeId: true, assetSubtypeId: true },
    });
    if (!asset) {
      return {
        totalRequired: 0,
        valid: 0,
        expiringSoon: 0,
        expired: 0,
        missing: 0,
        compliancePercentage: 100,
        documents: [] as Array<{
          documentTypeId: string;
          typeName: string;
          typeCode: string;
          criticality: DocumentCriticality;
          status: DerivedDocStatus;
          expirationDate: Date | null;
          daysRemaining: number | null;
          documentRecordId: string | null;
        }>,
      };
    }

    const requirements = await this.prisma.documentRequirement.findMany({
      where: {
        companyId,
        OR: [
          { assetId: asset.id },
          { assetId: null, assetSubtypeId: asset.assetSubtypeId, assetTypeId: null },
          {
            assetId: null,
            assetSubtypeId: null,
            assetTypeId: asset.assetTypeId,
          },
        ],
      },
      select: {
        documentTypeId: true,
        assetId: true,
        assetSubtypeId: true,
        documentType: {
          select: {
            id: true,
            code: true,
            name: true,
            criticality: true,
            alertDaysBefore: true,
          },
        },
      },
    });

    /* Most-specific wins. Walk in priority order so an asset-level
       override masks a subtype/type-level requirement for the same
       documentTypeId. */
    type ReqEntry = {
      documentTypeId: string;
      typeCode: string;
      typeName: string;
      criticality: DocumentCriticality;
      alertDaysBefore: number;
    };
    const required = new Map<string, ReqEntry>();
    /* Pass 1: type-level */
    for (const r of requirements) {
      if (r.assetId || r.assetSubtypeId) continue;
      required.set(r.documentTypeId, {
        documentTypeId: r.documentTypeId,
        typeCode: r.documentType.code,
        typeName: r.documentType.name,
        criticality: r.documentType.criticality,
        alertDaysBefore: r.documentType.alertDaysBefore,
      });
    }
    /* Pass 2: subtype-level (overrides type) */
    for (const r of requirements) {
      if (r.assetId || !r.assetSubtypeId) continue;
      required.set(r.documentTypeId, {
        documentTypeId: r.documentTypeId,
        typeCode: r.documentType.code,
        typeName: r.documentType.name,
        criticality: r.documentType.criticality,
        alertDaysBefore: r.documentType.alertDaysBefore,
      });
    }
    /* Pass 3: asset-level (overrides everything) */
    for (const r of requirements) {
      if (!r.assetId) continue;
      required.set(r.documentTypeId, {
        documentTypeId: r.documentTypeId,
        typeCode: r.documentType.code,
        typeName: r.documentType.name,
        criticality: r.documentType.criticality,
        alertDaysBefore: r.documentType.alertDaysBefore,
      });
    }

    const docTypeIds = Array.from(required.keys());
    const records = docTypeIds.length
      ? await this.prisma.documentRecord.findMany({
          where: {
            companyId,
            assetId: asset.id,
            isActive: true,
            documentTypeId: { in: docTypeIds },
            status: { not: DocumentRecordStatus.REPLACED },
          },
          select: {
            id: true,
            documentTypeId: true,
            status: true,
            expirationDate: true,
            version: true,
            createdAt: true,
          },
          orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    /* Latest non-replaced record per documentTypeId */
    const latestByType = new Map<
      string,
      { id: string; status: DocumentRecordStatus; expirationDate: Date | null }
    >();
    for (const r of records) {
      if (!latestByType.has(r.documentTypeId)) {
        latestByType.set(r.documentTypeId, {
          id: r.id,
          status: r.status,
          expirationDate: r.expirationDate,
        });
      }
    }

    const now = new Date();
    let valid = 0;
    let expiringSoon = 0;
    let expired = 0;
    let missing = 0;
    const documents: Array<{
      documentTypeId: string;
      typeName: string;
      typeCode: string;
      criticality: DocumentCriticality;
      status: DerivedDocStatus;
      expirationDate: Date | null;
      daysRemaining: number | null;
      documentRecordId: string | null;
    }> = [];

    for (const [docTypeId, req] of required.entries()) {
      const rec = latestByType.get(docTypeId);
      if (!rec || rec.status !== 'APPROVED') {
        missing++;
        documents.push({
          documentTypeId: docTypeId,
          typeName: req.typeName,
          typeCode: req.typeCode,
          criticality: req.criticality,
          status: 'FALTANTE',
          expirationDate: null,
          daysRemaining: null,
          documentRecordId: rec?.id ?? null,
        });
        continue;
      }
      const exp = rec.expirationDate;
      if (!exp) {
        valid++;
        documents.push({
          documentTypeId: docTypeId,
          typeName: req.typeName,
          typeCode: req.typeCode,
          criticality: req.criticality,
          status: 'VIGENTE',
          expirationDate: null,
          daysRemaining: null,
          documentRecordId: rec.id,
        });
        continue;
      }
      const daysRemaining = Math.floor((exp.getTime() - now.getTime()) / 86_400_000);
      if (daysRemaining < 0) {
        expired++;
        documents.push({
          documentTypeId: docTypeId,
          typeName: req.typeName,
          typeCode: req.typeCode,
          criticality: req.criticality,
          status: 'VENCIDO',
          expirationDate: exp,
          daysRemaining,
          documentRecordId: rec.id,
        });
      } else if (daysRemaining <= req.alertDaysBefore) {
        expiringSoon++;
        documents.push({
          documentTypeId: docTypeId,
          typeName: req.typeName,
          typeCode: req.typeCode,
          criticality: req.criticality,
          status: 'POR_VENCER',
          expirationDate: exp,
          daysRemaining,
          documentRecordId: rec.id,
        });
      } else {
        valid++;
        documents.push({
          documentTypeId: docTypeId,
          typeName: req.typeName,
          typeCode: req.typeCode,
          criticality: req.criticality,
          status: 'VIGENTE',
          expirationDate: exp,
          daysRemaining,
          documentRecordId: rec.id,
        });
      }
    }

    /* Sort: critical/blocking first, then by status severity. The
       UI relies on this ordering — surface the worst news first. */
    const statusOrder: Record<DerivedDocStatus, number> = {
      FALTANTE: 0,
      VENCIDO: 1,
      POR_VENCER: 2,
      VIGENTE: 3,
    };
    const criticalityOrder: Record<DocumentCriticality, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    documents.sort((a, b) => {
      const sa = statusOrder[a.status];
      const sb = statusOrder[b.status];
      if (sa !== sb) return sa - sb;
      return criticalityOrder[a.criticality] - criticalityOrder[b.criticality];
    });

    const totalRequired = required.size;
    const compliancePercentage =
      totalRequired === 0 ? 100 : Math.round((valid / totalRequired) * 1000) / 10;

    return {
      totalRequired,
      valid,
      expiringSoon,
      expired,
      missing,
      compliancePercentage,
      documents,
    };
  }
}
