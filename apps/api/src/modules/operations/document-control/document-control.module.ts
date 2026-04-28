import { Module } from '@nestjs/common';
import { DocumentRecordsController } from './document-records.controller';
import { DocumentRecordsService } from './document-records.service';

@Module({
  controllers: [DocumentRecordsController],
  providers: [DocumentRecordsService],
  exports: [DocumentRecordsService],
})
export class DocumentControlModule {}
