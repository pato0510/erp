import 'multer';
import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SiiConnectionService } from './sii-connection.service';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard';
import { PoliciesGuard } from '../common/guards/policies.guard';
import { CheckPolicies } from '../common/decorators/check-policies.decorator';
import { CurrentCompany } from '../common/decorators/current-company.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CompanySubject } from '../common/casl/casl-ability.factory';

// 1MB is plenty for a PKCS#12 — the guard here is primarily to prevent upload
// of arbitrary large files disguised as certificates.
const MAX_CERT_SIZE = 1 * 1024 * 1024;

@Controller('sii/connection')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SiiConnectionController {
  constructor(private readonly service: SiiConnectionService) {}

  @Post('certificate')
  // `manage` on CompanySubject is only granted to ADMIN and SUPER_ADMIN in
  // the CASL factory — other roles (MANAGER/ACCOUNTANT/etc.) cannot upload
  // certificates even though they can read tax data.
  @CheckPolicies((ability) => ability.can('manage', CompanySubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CERT_SIZE } }))
  uploadCertificate(
    @UploadedFile() file: Express.Multer.File,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body('password') password: string,
    @Body('rut') rut: string,
  ) {
    return this.service.uploadCertificate(companyId, user.id, file, password, rut);
  }

  @Post('test')
  @CheckPolicies((ability) => ability.can('manage', CompanySubject))
  testConnection(@CurrentCompany() companyId: string, @CurrentUser() user: { id: string }) {
    return this.service.testConnection(companyId, user.id);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('manage', CompanySubject))
  getConnection(@CurrentCompany() companyId: string) {
    return this.service.getConnection(companyId);
  }
}
