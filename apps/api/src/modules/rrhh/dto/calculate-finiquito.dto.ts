import { IsBoolean, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import type { FiniquitoCausal } from '../payroll/payroll.calculator';

const CAUSALES: FiniquitoCausal[] = [
  'necesidades_empresa',
  'desahucio',
  'renuncia',
  'mutuo_acuerdo',
  'caducidad',
];

export class CalculateFiniquitoDto {
  @IsNumber()
  @Min(0)
  sueldo: number;

  @IsNumber()
  @Min(0)
  aniosServicio: number;

  @IsNumber()
  @Min(0)
  mesesUltimoPeriodo: number;

  @IsIn(CAUSALES)
  causal: FiniquitoCausal;

  @IsOptional()
  @IsBoolean()
  dioAvisoPrevio?: boolean;
}
