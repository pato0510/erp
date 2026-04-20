export interface BankBalanceResult {
  balance: number;
  currency: string;
  accountNumber: string;
  retrievedAt: Date;
}

export interface BankMovementResult {
  externalId: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  type: 'CREDIT' | 'DEBIT';
  balance?: number;
  metadata?: Record<string, unknown>;
}

export interface IBankProvider {
  getAccountBalance(credentials: unknown): Promise<BankBalanceResult>;
  getMovements(credentials: unknown, from: Date, to: Date): Promise<BankMovementResult[]>;
  validateConnection(credentials: unknown): Promise<boolean>;
  getProviderName(): string;
}
