import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { OperationalAssetSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AssetQrService } from './asset-qr.service';

/* OPS-035 — QR endpoints. Two halves to this controller:
   - Public scan paths under `/operations/public/...` are
     anonymous and rate-limited (30/min per IP). They reveal
     deliberately limited info.
   - All other endpoints sit under `/operations/assets/...` and
     reuse the existing OperationalAssetSubject CASL gate (read /
     update / manage). */
@Controller('operations')
export class AssetQrController {
  constructor(private readonly qr: AssetQrService) {}

  /* ---- PUBLIC (no auth) ---------------------------------------- */

  /* The scan target. Lives outside any guard — anyone with the
     token resolves it. The throttler keeps scrapers honest; 30/min
     per IP is plenty for a human walking up to a sticker. */
  @Get('public/asset/:qrToken')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async publicScan(@Param('qrToken') qrToken: string) {
    const view = await this.qr.resolvePublicScan(qrToken);
    if (!view) {
      throw new NotFoundException('Código QR no válido o revocado.');
    }
    return view;
  }

  /* Authenticated extension of the same scan. The token proves
     the visitor is at the asset; JWT proves they belong to the
     same company. Cross-tenant scans 404 here (the public path is
     still available to them). */
  @Get('public/asset/:qrToken/authenticated')
  @UseGuards(JwtAuthGuard)
  async authenticatedScan(@Param('qrToken') qrToken: string, @CurrentCompany() companyId: string) {
    const view = await this.qr.getAuthenticatedScanView(qrToken, companyId);
    if (!view) {
      throw new NotFoundException('Código QR no encontrado para tu empresa.');
    }
    return view;
  }

  /* ---- AUTHENTICATED ------------------------------------------- */

  /* Idempotent — returns the existing token if present, otherwise
     creates one. MANAGER+ can do this (uses `update` permission on
     OperationalAssetSubject). */
  @Post('assets/:id/qr')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('update', OperationalAssetSubject))
  async ensureQr(@Param('id') assetId: string, @CurrentCompany() companyId: string) {
    const token = await this.qr.ensureQrToken(companyId, assetId);
    return {
      qrToken: token,
      publicUrl: this.publicUrlFor(token),
    };
  }

  /* Rotate the token. ADMIN-only via the `manage` action — only
     ADMIN/SUPER_ADMIN have `manage all`. The old token is now
     unfindable, so any field stickers stop resolving. */
  @Post('assets/:id/qr/regenerate')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', OperationalAssetSubject))
  async regenerate(
    @Param('id') assetId: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    const token = await this.qr.regenerateQrToken(companyId, assetId, user.id);
    return {
      qrToken: token,
      publicUrl: this.publicUrlFor(token),
    };
  }

  /* Bulk seed for the admin "Códigos QR" card. ADMIN-only. */
  @Post('assets/qr/bulk-generate')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', OperationalAssetSubject))
  async bulkGenerate(@CurrentCompany() companyId: string) {
    return this.qr.bulkGenerateForCompany(companyId);
  }

  /* Counts for the same admin card. Read-level access is enough
     to see the totals. */
  @Get('assets/qr/stats')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  async stats(@CurrentCompany() companyId: string) {
    return this.qr.getCompanyQrStats(companyId);
  }

  /* ---- Image / PDF downloads ----------------------------------- */

  @Get('assets/:id/qr.png')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  async downloadPng(
    @Param('id') assetId: string,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.qr.generateQrPng(companyId, assetId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${assetId}.png"`);
    res.send(buffer);
  }

  @Get('assets/:id/qr.svg')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  async downloadSvg(
    @Param('id') assetId: string,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const svg = await this.qr.generateQrSvg(companyId, assetId);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'private, max-age=300');
    /* The SVG endpoint is also used by the asset detail page to
       inline the preview, so don't force a download. */
    res.send(svg);
  }

  @Get('assets/:id/qr.pdf')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  async downloadPdfLabel(
    @Param('id') assetId: string,
    @CurrentCompany() companyId: string,
    @Query('size') size: '5cm' | '10cm' = '10cm',
    @Res() res: Response,
  ) {
    const safeSize: '5cm' | '10cm' = size === '5cm' ? '5cm' : '10cm';
    const buffer = await this.qr.generateQrPdfLabel(companyId, assetId, safeSize);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="etiqueta-${assetId}-${safeSize}.pdf"`,
    );
    res.send(buffer);
  }

  /* ---- helpers ------------------------------------------------- */

  private publicUrlFor(token: string): string {
    const base =
      process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://app.excelsia.cl';
    return `${base.replace(/\/+$/, '')}/p/asset/${token}`;
  }
}
