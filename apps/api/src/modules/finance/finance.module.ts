import { Module } from '@nestjs/common';
import { OperationsListenersService } from './operations-listeners.service';

/* OPS-032 — placeholder Finance module that hosts the operations
   event listeners. The legacy financial code lives under
   /modules/cashflow, /modules/movements, etc — this module's job
   today is to register the @OnEvent handlers so the EventEmitter2
   discovery pass picks them up at boot.

   When OPS-033 lands real handler logic (creating commitments) the
   service here will gain a CommitmentsService dependency. */
@Module({
  providers: [OperationsListenersService],
  exports: [OperationsListenersService],
})
export class FinanceModule {}
