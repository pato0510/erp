import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../modules/common/prisma/prisma.module';
import { CaslModule } from '../modules/common/casl/casl.module';
import { IamModule } from '../modules/iam/iam.module';
import { JobsModule } from '../modules/jobs/jobs.module';
import { TenancyModule } from '../modules/tenancy/tenancy.module';

@Module({
  imports: [SentryModule.forRoot(), PrismaModule, CaslModule, IamModule, JobsModule, TenancyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
