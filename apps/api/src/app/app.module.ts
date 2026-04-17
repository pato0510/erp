import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../modules/common/prisma/prisma.module';
import { CaslModule } from '../modules/common/casl/casl.module';
import { RlsModule } from '../modules/common/rls/rls.module';
import { TenantMiddleware } from '../modules/common/rls/rls.middleware';
import { AuditModule } from '../modules/audit/audit.module';
import { CatalogsModule } from '../modules/catalogs/catalogs.module';
import { CompaniesModule } from '../modules/companies/companies.module';
import { IamModule } from '../modules/iam/iam.module';
import { JobsModule } from '../modules/jobs/jobs.module';
import { TenancyModule } from '../modules/tenancy/tenancy.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    PrismaModule,
    CaslModule,
    RlsModule,
    AuditModule,
    CatalogsModule,
    CompaniesModule,
    IamModule,
    JobsModule,
    TenancyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude({ path: 'api/auth/*path', method: RequestMethod.ALL })
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
