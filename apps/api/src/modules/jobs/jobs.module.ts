import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { JobsProcessor } from './jobs.processor';
import { SYNC_QUEUE } from './queues.constant';

// ioredis only parses a URL when it is passed as a string constructor arg —
// a `{ url }` field in the options object is silently dropped and the client
// falls back to localhost:6379. Managed hosts (Railway, Upstash, Heroku)
// expose a single REDIS_URL; local dev/Docker uses REDIS_HOST + REDIS_PORT.
// maxRetriesPerRequest: null is required by BullMQ workers.
const getRedisConnection = () =>
  process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      });

@Module({
  imports: [
    BullModule.forRoot({
      connection: getRedisConnection(),
    }),
    BullModule.registerQueue({
      name: SYNC_QUEUE,
    }),
  ],
  providers: [JobsProcessor],
  exports: [BullModule],
})
export class JobsModule {}
