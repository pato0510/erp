import { Injectable } from '@nestjs/common';
import { ISiiProvider } from './sii-provider.interface';
import { MockSiiProvider } from './mock/mock-sii.provider';
import { BaseApiSiiProvider } from './baseapi/baseapi-sii.provider';

export const DEFAULT_SII_PROVIDER = 'baseapi';

@Injectable()
export class SiiProviderFactory {
  private readonly providers: Map<string, ISiiProvider> = new Map();
  private readonly baseApi: BaseApiSiiProvider;

  constructor() {
    this.baseApi = new BaseApiSiiProvider();
    this.providers.set('baseapi', this.baseApi);
    this.providers.set('mock-sii', new MockSiiProvider());
  }

  /**
   * Returns a provider by name. Falling back to BaseAPI when the requested
   * name is missing would silently mask config bugs, so we error instead.
   */
  getProvider(name: string = DEFAULT_SII_PROVIDER): ISiiProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `Unknown SII provider: ${name}. Available: ${[...this.providers.keys()].join(', ')}`,
      );
    }
    return provider;
  }

  /** Direct handle to the BaseAPI provider — used by the test-connection endpoint. */
  getBaseApiProvider(): BaseApiSiiProvider {
    return this.baseApi;
  }
}
