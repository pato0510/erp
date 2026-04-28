import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentRequirementDto } from './create-document-requirement.dto';

export class UpdateDocumentRequirementDto extends PartialType(CreateDocumentRequirementDto) {}
