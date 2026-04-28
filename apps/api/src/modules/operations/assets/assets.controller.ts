import 'multer';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { OperationalAssetSubject } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { AssetBlockingService } from '../alerts/asset-blocking.service';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { FilterAssetsDto } from './dto/filter-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

@Controller('operations/assets')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly blockingService: AssetBlockingService,
  ) {}

  /* OPS-020 — read-only blocked-assets list. Declared before `:id` so
     the literal /blocked path matches first. */
  @Get('blocked')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  getBlockedAssets(@CurrentCompany() companyId: string) {
    return this.blockingService.getBlockedAssets(companyId);
  }

  @Get(':id/status-history')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  getStatusHistory(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.blockingService.getStatusHistory(companyId, id);
  }

  /* Dry-run: returns the evaluation without applying it so a UI can
     render "if you renew nothing, this asset will be blocked because…"
     without actually flipping the row. */
  @Post(':id/evaluate-blocking')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  evaluateBlocking(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.blockingService.evaluateAssetBlocking(companyId, id);
  }

  /* ADMIN-only escape hatch. The `force-unblock` CASL action is only
     granted via `manage 'all'`, so MANAGER cannot reach this endpoint
     even though it can update assets in general. The next cron pass
     will re-block if conditions persist, so this is a temporary
     override, not a permanent unblock. */
  @Post(':id/force-unblock')
  @CheckPolicies((ability) => ability.can('force-unblock', OperationalAssetSubject))
  forceUnblock(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { reason?: string },
  ) {
    return this.blockingService.forceUnblock(companyId, id, user.id, body?.reason ?? '');
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  findAll(@CurrentCompany() companyId: string, @Query() filters: FilterAssetsDto) {
    return this.assetsService.findAll(companyId, filters);
  }

  /* `:id/photo` is declared before the bare `:id` finder so the literal `photo`
     suffix doesn't get swallowed by the catch-all id route. */
  @Get(':id/photo')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  async getPhoto(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const photo = await this.assetsService.getPhoto(id, companyId);
    res.set('Content-Type', photo.mimeType);
    res.set('Cache-Control', 'private, max-age=300');
    res.send(photo.buffer);
  }

  @Post(':id/photo')
  @CheckPolicies((ability) => ability.can('update', OperationalAssetSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_BYTES } }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assetsService.uploadPhoto(id, companyId, user.id, file);
  }

  @Delete(':id/photo')
  @CheckPolicies((ability) => ability.can('update', OperationalAssetSubject))
  deletePhoto(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assetsService.deletePhoto(id, companyId, user.id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', OperationalAssetSubject))
  findOne(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.assetsService.findOne(id, companyId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', OperationalAssetSubject))
  create(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetsService.create(companyId, user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', OperationalAssetSubject))
  update(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(id, companyId, user.id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', OperationalAssetSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.assetsService.remove(id, companyId, user.id);
  }
}
