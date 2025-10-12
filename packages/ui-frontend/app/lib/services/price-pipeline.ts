import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PricePipeline');

export interface PriceResult {
  value: number;
  source: string;
  confidence: number;
  timestamp: number;
}

interface CacheEntry {
  data: PriceResult;
  expires: number;
}

export class PricePipeline {
  private cache = new Map<string, CacheEntry>();
  private cacheTTL = 60 * 1000; // 60 seconds
  private negativeCacheTTL = 15 * 1000; // 15 seconds for failures

  async getPrice(
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    const cacheKey = `${chainId}:${tokenAddress}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.debug(`Price cache hit for ${cacheKey}`);
      return cached;
    }

    const tiers = [
      () => this.tryChainlink(chainId, tokenAddress),
      () => this.tryHttpProvider(chainId, tokenAddress),
      () => this.tryDexTwap(chainId, tokenAddress)
    ];

    for (const [index, tier] of tiers.entries()) {
      try {
        const result = await tier();
        if (result) {
          logger.info(`Price found via tier ${index} for ${cacheKey}: $${result.value}`);
          this.setCache(cacheKey, result);
          return result;
        }
      } catch (error) {
        logger.debug(`Price tier ${index} failed for ${cacheKey}:`, error);
      }
    }

    logger.warn(`No price found for ${cacheKey} across all tiers`);
    this.setNegativeCache(cacheKey);
    return undefined;
  }

  private async tryChainlink(
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    if (!this.isChainlinkSupported(chainId)) {
      return undefined;
    }

    const feeds: Record<string, string> = {
      '1:native': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD on mainnet
      '1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', // USDC/USD
      '137:native': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0', // MATIC/USD on Polygon
    };

    const feedAddress = feeds[`${chainId}:${tokenAddress}`];
    if (!feedAddress) {
      return undefined;
    }

    // For now, fallback to CoinGecko since we don't have direct RPC access to Chainlink
    // In production, this would query the Chainlink oracle contract
    logger.debug(`Chainlink feed ${feedAddress} found, falling back to CoinGecko for price`);
    return this.fetchFromCoinGecko(chainId, tokenAddress);
  }

  private async tryHttpProvider(
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    const providers = this.getAvailableHttpProviders();

    for (const provider of providers) {
      try {
        const result = await this.fetchFromProvider(provider, chainId, tokenAddress);
        if (result) {
          return {
            ...result,
            confidence: 0.7
          };
        }
      } catch (error) {
        logger.debug(`HTTP provider ${provider} failed:`, error);
      }
    }

    return undefined;
  }

  private async tryDexTwap(
    chainId: number,
    tokenAddress: string,
    timeoutMs = 1500
  ): Promise<PriceResult | undefined> {
    const timeout = new Promise<undefined>(resolve =>
      setTimeout(() => resolve(undefined), timeoutMs)
    );

    const twapPromise = this.fetchDexTwap(chainId, tokenAddress);

    const result = await Promise.race([twapPromise, timeout]);

    if (result) {
      return {
        ...result,
        confidence: 0.5
      };
    }

    return undefined;
  }

  private async fetchFromProvider(
    provider: string,
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    switch (provider) {
      case 'coingecko':
        return this.fetchFromCoinGecko(chainId, tokenAddress);
      case 'cryptocompare':
        return this.fetchFromCryptoCompare(chainId, tokenAddress);
      default:
        return undefined;
    }
  }

  private async fetchFromCoinGecko(
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    const platformMap: Record<number, string> = {
      1: 'ethereum',
      137: 'polygon-pos',
      56: 'binance-smart-chain',
      42161: 'arbitrum-one'
    };

    const platform = platformMap[chainId];
    if (!platform) return undefined;

    try {
      let apiUrl: string;
      let id: string;

      if (tokenAddress === 'native') {
        const nativeIds: Record<number, string> = {
          1: 'ethereum',
          137: 'matic-network',
          56: 'binancecoin',
          42161: 'ethereum'
        };

        id = nativeIds[chainId];
        if (!id) return undefined;
      } else {
        // For non-native tokens, use contract address
        id = tokenAddress.toLowerCase();
      }

      // Use CoinGecko free API
      const baseUrl = 'https://api.coingecko.com/api/v3';

      if (tokenAddress === 'native') {
        // For native tokens, use simple price endpoint
        apiUrl = `${baseUrl}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
      } else {
        // For contract addresses, use token price endpoint
        apiUrl = `${baseUrl}/simple/token_price/${platform}?contract_addresses=${tokenAddress}&vs_currencies=usd&include_24hr_change=true`;
      }

      const headers: HeadersInit = {
        'Accept': 'application/json'
      };

      if (process.env.COINGECKO_API_KEY) {
        headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
      }

      const response = await fetch(apiUrl, {
        headers,
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        logger.warn(`CoinGecko API returned ${response.status} for ${tokenAddress}`);
        return undefined;
      }

      const data = await response.json();

      let priceData;
      if (tokenAddress === 'native') {
        priceData = data[id];
      } else {
        priceData = data[tokenAddress.toLowerCase()];
      }

      if (!priceData || !priceData.usd) {
        logger.warn(`No price data found for ${tokenAddress} from CoinGecko`);
        return undefined;
      }

      return {
        value: priceData.usd,
        source: 'coingecko',
        confidence: 0.8,
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error(`CoinGecko API error for ${tokenAddress}:`, error);
      return undefined;
    }
  }

  private async fetchFromCryptoCompare(
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    return undefined;
  }

  private async fetchDexTwap(
    chainId: number,
    tokenAddress: string
  ): Promise<PriceResult | undefined> {
    return undefined;
  }

  private isChainlinkSupported(chainId: number): boolean {
    const supportedChains = [1, 137, 56, 42161, 10, 43114];
    return supportedChains.includes(chainId);
  }

  private getAvailableHttpProviders(): string[] {
    const providers: string[] = [];

    if (process.env.COINGECKO_API_KEY) {
      providers.push('coingecko');
    }
    if (process.env.CRYPTOCOMPARE_API_KEY) {
      providers.push('cryptocompare');
    }
    if (process.env.COINMARKETCAP_API_KEY) {
      providers.push('coinmarketcap');
    }

    if (!providers.length) {
      providers.push('coingecko');
    }

    return providers;
  }

  private getFromCache(key: string): PriceResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  private setCache(key: string, data: PriceResult): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheTTL
    });
  }

  private setNegativeCache(key: string): void {
    this.cache.set(key, {
      data: {
        value: 0,
        source: 'none',
        confidence: 0,
        timestamp: Date.now()
      },
      expires: Date.now() + this.negativeCacheTTL
    });
  }
}