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
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { FilterAssetsDto } from './dto/filter-assets.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

@Controller('operations/assets')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

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
