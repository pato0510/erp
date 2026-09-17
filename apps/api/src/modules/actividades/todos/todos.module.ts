import { Module } from '@nestjs/common';
import { NotificationModule } from '../../operations/notifications/notification.module';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';

@Module({
  imports: [NotificationModule],
  controllers: [TodosController],
  providers: [TodosService],
})
export class TodosModule {}
