import { IBankProvider, BankBalanceResult, BankMovementResult } from '../bank-provider.interface';

const DESCRIPTIONS_CREDIT = [
  'TRANSFERENCIA RECIBIDA',
  'ABONO VENTA',
  'DEPOSITO EFECTIVO',
  'PAGO CLIENTE',
  'TRANSFERENCIA TEF',
];

const DESCRIPTIONS_DEBIT = [
  'PAGO PROVEEDOR',
  'CARGO SERVICIOS',
  'COMISION BANCARIA',
  'IVA DECLARACION',
  'ABONO SUELDO',
  'PAGO ARRIENDO',
  'CARGO AUTOMATICO',
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export class MockBankProvider implements IBankProvider {
  async getAccountBalance(): Promise<BankBalanceResult> {
    const base = 15000000;
    const variation = Math.round((Math.random() - 0.5) * 2000000);
    return {
      balance: base + variation,
      currency: 'CLP',
      accountNumber: '****1234',
      retrievedAt: new Date(),
    };
  }

  async getMovements(_credentials: unknown, from: Date, to: Date): Promise<BankMovementResult[]> {
    const movements: BankMovementResult[] = [];
    const current = new Date(from);
    let runningBalance = 15000000;
    let index = 0;

    while (current <= to) {
      const dayHash =
        current.getFullYear() * 10000 + (current.getMonth() + 1) * 100 + current.getDate();
      const movementsPerDay = Math.floor(seededRandom(dayHash) * 3); // 0-2 per day

      for (let i = 0; i < movementsPerDay; i++) {
        const seed = dayHash * 100 + i;
        const isCredit = seededRandom(seed + 1) > 0.45;
        const descriptions = isCredit ? DESCRIPTIONS_CREDIT : DESCRIPTIONS_DEBIT;
        const desc = descriptions[Math.floor(seededRandom(seed + 2) * descriptions.length)];
        const amount = Math.round(50000 + seededRandom(seed + 3) * 4950000);

        runningBalance += isCredit ? amount : -amount;

        movements.push({
          externalId: `MOCK-${dayHash}-${i}`,
          date: new Date(current),
          description: desc,
          amount,
          currency: 'CLP',
          type: isCredit ? 'CREDIT' : 'DEBIT',
          balance: runningBalance,
          metadata: { provider: 'mock', dayHash, index: i },
        });
        index++;
      }
      current.setDate(current.getDate() + 1);
    }

    return movements;
  }

  async validateConnection(): Promise<boolean> {
    return true;
  }

  getProviderName(): string {
    return 'mock';
  }
}
