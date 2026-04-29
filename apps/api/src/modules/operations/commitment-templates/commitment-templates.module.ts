import { Module } from '@nestjs/common';
import { CommitmentTemplatesController } from './commitment-templates.controller';
import { CommitmentTemplatesService } from './commitment-templates.service';

/* OPS-033 — exports the templates service so the Finance listener
   can call into it for renewal-imminent estimations. PrismaService
   is global; RlsService is in CommonModule and globally available
   via injection. */
@Module({
  controllers: [CommitmentTemplatesController],
  providers: [CommitmentTemplatesService],
  exports: [CommitmentTemplatesService],
})
export class CommitmentTemplatesModule {}
