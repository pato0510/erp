import { Global, Module } from '@nestjs/common';
import { DomainEventsController } from './domain-events.controller';
import { DomainEventsService } from './domain-events.service';

/* OPS-032 — global so any operations service can inject
   DomainEventsService without each feature module having to import
   this one. EventEmitter2 is registered at the AppModule level via
   EventEmitterModule.forRoot(), so it's also globally available. */
@Global()
@Module({
  controllers: [DomainEventsController],
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
