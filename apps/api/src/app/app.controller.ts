import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppService } from './app.service';
import { SYNC_QUEUE } from '../modules/jobs/queues.constant';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectQueue(SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('jobs/test')
  async addTestJob() {
    const job = await this.syncQueue.add('test-job', {
      test: true,
      timestamp: Date.now(),
    });
    return { message: 'Job added to queue', jobId: job.id };
  }
}
