import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CounterpartiesController } from './counterparties.controller';
import { CounterpartiesService } from './counterparties.service';

@Module({
  controllers: [CategoriesController, CounterpartiesController],
  providers: [CategoriesService, CounterpartiesService],
  exports: [CategoriesService, CounterpartiesService],
})
export class CatalogsModule {}
