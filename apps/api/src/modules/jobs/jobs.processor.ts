import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_QUEUE } from './queues.constant';

@Processor(SYNC_QUEUE)
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.log(
      `Processing job ${job.id} of type "${job.name}" from queue "${SYNC_QUEUE}"`,
    );
    this.logger.log(`Job data: ${JSON.stringify(job.data)}`);
    this.logger.log(`Job ${job.id} completed successfully`);
  }
}
