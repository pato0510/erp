import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JobsProcessor } from './jobs.processor';
import { SYNC_QUEUE } from './queues.constant';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      },
    }),
    BullModule.registerQueue({
      name: SYNC_QUEUE,
    }),
  ],
  providers: [JobsProcessor],
  exports: [BullModule],
})
export class JobsModule {}
