import { Module } from '@nestjs/common';
import { AccountAttributionReadService } from './attribution-read.service';

/* MKT-006 — a small Comercial module that EXPORTS AccountAttributionReadService and
 * imports NOTHING (it uses the global PrismaService). Marketing's CampaignsModule
 * imports it for the delete guard. Keeping it separate from AccountsModule is what keeps
 * the graph acyclic: AccountsModule → CampaignsModule → AttributionReadModule, with no
 * back-edge, so no forwardRef is needed. */
@Module({
  providers: [AccountAttributionReadService],
  exports: [AccountAttributionReadService],
})
export class AttributionReadModule {}
