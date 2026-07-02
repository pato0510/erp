import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../modules/common/prisma/prisma.module';
import { CaslModule } from '../modules/common/casl/casl.module';
import { RlsModule } from '../modules/common/rls/rls.module';
import { StorageModule } from '../modules/common/storage/storage.module';
import { TenantMiddleware } from '../modules/common/rls/rls.middleware';
import { NullByteSanitizerMiddleware } from '../modules/common/middleware/null-byte-sanitizer.middleware';
import { AlertsModule } from '../modules/alerts/alerts.module';
import { AuditModule } from '../modules/audit/audit.module';
import { BankingModule } from '../modules/banking/banking.module';
import { CashflowModule } from '../modules/cashflow/cashflow.module';
import { ClosingModule } from '../modules/closing/closing.module';
import { ComercialModule } from '../modules/comercial/comercial.module';
import { DashboardModule } from '../modules/dashboard/dashboard.module';
import { CatalogsModule } from '../modules/catalogs/catalogs.module';
import { CompaniesModule } from '../modules/companies/companies.module';
import { HealthModule } from '../modules/health/health.module';
import { IamModule } from '../modules/iam/iam.module';
import { JobsModule } from '../modules/jobs/jobs.module';
import { MovementsModule } from '../modules/movements/movements.module';
import { DomainEventsModule } from '../modules/operations/events/domain-events.module';
import { FinanceModule } from '../modules/finance/finance.module';
import { OperationsModule } from '../modules/operations/operations.module';
import { ReconciliationModule } from '../modules/reconciliation/reconciliation.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { RrhhModule } from '../modules/rrhh/rrhh.module';
import { TaxModule } from '../modules/tax/tax.module';
import { TenancyModule } from '../modules/tenancy/tenancy.module';

// Rate-limiting defaults are env-driven so ops can tighten them per
// environment without a deploy. Values are in ms (ttl) and # of requests.
const RATE_LIMIT_TTL_MS = (Number(process.env.RATE_LIMIT_TTL) || 60) * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

@Module({
  imports: [
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    /* OPS-032 — in-process domain bus. `wildcard:false` keeps event
       names dotted strings (e.g. "document.renewal-imminent") and
       lets handlers register via `@OnEvent('document.renewal-imminent')`
       without surprises. */
    EventEmitterModule.forRoot({ wildcard: false, verboseMemoryLeak: true, maxListeners: 50 }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: RATE_LIMIT_TTL_MS,
        limit: RATE_LIMIT_MAX,
      },
    ]),
    PrismaModule,
    CaslModule,
    RlsModule,
    StorageModule,
    AlertsModule,
    AuditModule,
    BankingModule,
    CashflowModule,
    ClosingModule,
    ComercialModule,
    DashboardModule,
    CatalogsModule,
    CompaniesModule,
    HealthModule,
    IamModule,
    JobsModule,
    DomainEventsModule,
    FinanceModule,
    MovementsModule,
    OperationsModule,
    ReconciliationModule,
    ReportsModule,
    RrhhModule,
    TaxModule,
    TenancyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register ThrottlerGuard globally — returns 429 Too Many Requests when
    // any endpoint's per-IP rate is exceeded. Use @Throttle() on specific
    // handlers to override limits, or @SkipThrottle() to opt out.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Strip null bytes from all request bodies/queries before anything else
    // processes the payload. Cheap defense against pg "invalid byte sequence"
    // errors and a class of injection tricks that rely on \0 terminators.
    consumer.apply(NullByteSanitizerMiddleware).forRoutes('*');

    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/auth/*path', method: RequestMethod.ALL },
        { path: 'api/health', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
