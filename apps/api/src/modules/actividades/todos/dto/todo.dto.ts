import { PartialType } from '@nestjs/mapped-types';
import { TodoPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTodoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200, { message: 'El título debe tener entre 1 y 200 caracteres.' })
  title: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(2000, { message: 'La descripción admite hasta 2000 caracteres.' })
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha límite debe tener el formato YYYY-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'La fecha límite no es válida.' })
  dueDate?: string | null;

  @IsUUID()
  assigneeId: string;
}

export class UpdateTodoDto extends PartialType(CreateTodoDto, { skipNullProperties: false }) {}

export class FilterTodosDto {
  @IsIn(['mine', 'all'])
  scope: 'mine' | 'all' = 'mine';

  @IsIn(['PENDING', 'DONE', 'ALL'])
  status: 'PENDING' | 'DONE' | 'ALL' = 'PENDING';

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueBefore?: string;
}
