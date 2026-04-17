import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule } from '../modules/jobs/jobs.module';

@Module({
  imports: [SentryModule.forRoot(), JobsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
