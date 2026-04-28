import { Module } from '@nestjs/common';
import { DocumentRequirementsController } from './document-requirements.controller';
import { DocumentRequirementsService } from './document-requirements.service';

@Module({
  controllers: [DocumentRequirementsController],
  providers: [DocumentRequirementsService],
  exports: [DocumentRequirementsService],
})
export class DocumentRequirementsModule {}
