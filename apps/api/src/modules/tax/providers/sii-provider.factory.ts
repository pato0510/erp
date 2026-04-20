import { Injectable } from '@nestjs/common';
import { ISiiProvider } from './sii-provider.interface';
import { MockSiiProvider } from './mock/mock-sii.provider';

@Injectable()
export class SiiProviderFactory {
  private readonly providers: Map<string, ISiiProvider> = new Map();

  constructor() {
    this.providers.set('mock-sii', new MockSiiProvider());
  }

  getProvider(name: string): ISiiProvider {
    if (name === 'sii') {
      throw new Error('Real SII integration not yet implemented — use "mock-sii"');
    }

    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `Unknown SII provider: ${name}. Available: ${[...this.providers.keys()].join(', ')}`,
      );
    }
    return provider;
  }
}
