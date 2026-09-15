import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { OpportunityDocumentSubject } from '../../common/casl/casl-ability.factory';
import type { AppAbility } from '../../common/casl/casl-ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentAbility } from '../../common/decorators/current-ability.decorator';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PoliciesGuard } from '../../common/guards/policies.guard';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard';
import { CreateOpportunityDocumentDto } from './dto/create-opportunity-document.dto';
import { FILE_MAX_BYTES, OpportunityDocumentsService } from './opportunity-documents.service';

/* COM-017 — opportunity documents (files attached to a deal). EVERY endpoint declares
 * @CheckPolicies on OpportunityDocumentSubject (PoliciesGuard fails OPEN). Grants mirror
 * OpportunityNoteSubject line for line — READ: MANAGER/ADMIN/SUPER_ADMIN + ACCOUNTANT;
 * WRITE (create/delete): MANAGER/ADMIN/SUPER_ADMIN. The list is scoped by opportunity
 * (required). Upload is SERVER-STREAMED multipart (FileInterceptor('file') with the
 * same size cap the service enforces — the RRHH documents mechanism); download STREAMS
 * the bytes through the API with the same headers RRHH sets (no signed URLs — that path
 * was never exercised in this codebase). On top of the CASL gate the service
 * enforces author-or-ADMIN soft delete (via `manage` on the subject, read from the
 * ability PoliciesGuard built). Writes run through executeWithRls. */
@Controller('comercial/opportunity-documents')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class OpportunityDocumentsController {
  constructor(private readonly service: OpportunityDocumentsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', OpportunityDocumentSubject))
  findAll(@CurrentCompany() companyId: string, @Query('opportunityId') opportunityId?: string) {
    if (!opportunityId) throw new BadRequestException('Debes indicar opportunityId.');
    return this.service.findAllByOpportunity(companyId, opportunityId);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', OpportunityDocumentSubject))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_MAX_BYTES } }))
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOpportunityDocumentDto,
  ) {
    return this.service.create(companyId, user.id, dto, file);
  }

  @Get(':id/download')
  @CheckPolicies((ability) => ability.can('read', OpportunityDocumentSubject))
  async download(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadFile(companyId, id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    res.send(file.buffer);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', OpportunityDocumentSubject))
  remove(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: { id: string },
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.service.remove(companyId, user.id, id, ability);
  }
}
