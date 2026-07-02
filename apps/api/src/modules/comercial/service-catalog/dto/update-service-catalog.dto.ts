import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceCatalogDto } from './create-service-catalog.dto';

export class UpdateServiceCatalogDto extends PartialType(CreateServiceCatalogDto) {}
