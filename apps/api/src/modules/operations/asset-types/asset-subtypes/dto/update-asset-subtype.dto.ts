import { PartialType } from '@nestjs/mapped-types';
import { CreateAssetSubtypeDto } from './create-asset-subtype.dto';

export class UpdateAssetSubtypeDto extends PartialType(CreateAssetSubtypeDto) {}
