import { Injectable } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { calcularFiniquito } from './payroll/payroll.calculator';
import { CalculateFiniquitoDto } from './dto/calculate-finiquito.dto';

@Injectable()
export class FiniquitoService {
  constructor(private readonly payroll: PayrollService) {}

  async calculate(companyId: string, dto: CalculateFiniquitoDto) {
    const param = await this.payroll.getActiveParameter(companyId);
    return calcularFiniquito(
      {
        sueldo: dto.sueldo,
        aniosServicio: dto.aniosServicio,
        mesesUltimoPeriodo: dto.mesesUltimoPeriodo,
        causal: dto.causal,
        dioAvisoPrevio: dto.dioAvisoPrevio ?? false,
      },
      Number(param.ufValue),
    );
  }
}
