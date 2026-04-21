import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JobsProcessor } from './jobs.processor';
import { SYNC_QUEUE } from './queues.constant';

// Managed hosts like Railway expose a single REDIS_URL; local dev/Docker uses
// REDIS_HOST + REDIS_PORT. BullMQ accepts either form.
const redisConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnection,
    }),
    BullModule.registerQueue({
      name: SYNC_QUEUE,
    }),
  ],
  providers: [JobsProcessor],
  exports: [BullModule],
})
export class JobsModule {}
