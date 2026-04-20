import { Injectable } from '@nestjs/common';
import { IBankProvider } from './bank-provider.interface';
import { MockBankProvider } from './mock/mock-bank.provider';

@Injectable()
export class BankProviderFactory {
  private readonly providers: Map<string, IBankProvider> = new Map();

  constructor() {
    this.providers.set('mock', new MockBankProvider());
  }

  getProvider(name: string): IBankProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `Unknown bank provider: ${name}. Available: ${[...this.providers.keys()].join(', ')}`,
      );
    }
    return provider;
  }
}
