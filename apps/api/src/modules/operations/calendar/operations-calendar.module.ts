import { Module } from '@nestjs/common';
import { OperationsCalendarController } from './operations-calendar.controller';
import { OperationsCalendarService } from './operations-calendar.service';

/* OPS-030 — calendar feed. Reads directly from Prisma (PrismaService
   is provided globally) so the module has no extra imports. */
@Module({
  controllers: [OperationsCalendarController],
  providers: [OperationsCalendarService],
})
export class OperationsCalendarModule {}
