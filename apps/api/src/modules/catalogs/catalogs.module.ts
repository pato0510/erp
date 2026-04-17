import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CounterpartiesController } from './counterparties.controller';
import { CounterpartiesService } from './counterparties.service';
import { CostCentersController } from './cost-centers.controller';
import { CostCentersService } from './cost-centers.service';
import { FiscalPeriodsController } from './fiscal-periods.controller';
import { FiscalPeriodsService } from './fiscal-periods.service';

@Module({
  controllers: [
    CategoriesController,
    CounterpartiesController,
    CostCentersController,
    FiscalPeriodsController,
  ],
  providers: [CategoriesService, CounterpartiesService, CostCentersService, FiscalPeriodsService],
  exports: [CategoriesService, CounterpartiesService, CostCentersService, FiscalPeriodsService],
})
export class CatalogsModule {}
