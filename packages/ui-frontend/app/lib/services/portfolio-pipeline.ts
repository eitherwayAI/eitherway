import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PortfolioPipeline');

export interface Holding {
  chainId: number;
  tokenAddress: `0x${string}` | 'native';
  symbol: string;
  decimals: number;
  balanceRaw: string;
  balance: number;
  priceUsd?: number;
  valueUsd: number;
  sources: string[];
  priceSource?: string;
  confidence: number;
  timestamp: number;
}

export interface PortfolioResult {
  totalUsd: number;
  holdings: Holding[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  provenance: ProvenanceData;
  isDemo: boolean;
}

export interface ProvenanceData {
  sources: string[];
  timestamp: number;
  cacheSources: string[];
  fallbacks: string[];
  errors: string[];
  demo: boolean;
  confidenceReason: string;
}

export class PortfolioPipeline {
  private isDemoMode: boolean;
  private confidenceThreshold = 0.5;

  constructor() {
    this.isDemoMode = this.checkDemoMode();
  }

  private checkDemoMode(): boolean {
    const envDemoMode = process.env.DEMO_MODE === 'true';
    const hasRequiredKeys = Boolean(
      process.env.WALLETCONNECT_PROJECT_ID &&
      process.env.WALLETCONNECT_PROJECT_ID !== 'your-project-id-here'
    );

    if (envDemoMode) {
      logger.info('Demo mode explicitly enabled via DEMO_MODE=true');
      return true;
    }

    if (!hasRequiredKeys && process.env.DEMO_MODE !== 'false') {
      logger.warn('No API keys configured and DEMO_MODE not explicitly false - demo disabled');
      return false;
    }

    return false;
  }

  async computePortfolio(addresses: string[]): Promise<PortfolioResult> {
    const provenance: ProvenanceData = {
      sources: [],
      timestamp: Date.now(),
      cacheSources: [],
      fallbacks: [],
      errors: [],
      demo: false,
      confidenceReason: ''
    };

    if (!addresses?.length || addresses.every(addr => !addr)) {
      logger.info('No addresses provided, returning empty portfolio');
      return this.emptyPortfolio('no-addresses', provenance);
    }

    if (this.isDemoMode) {
      logger.info('Demo mode active, returning demo portfolio');
      provenance.demo = true;
      return this.getDemoPortfolio(provenance);
    }

    try {
      const rawHoldings = await this.collectHoldingsFromProviders(addresses, provenance);

      if (!rawHoldings.length) {
        logger.info('No holdings found for addresses, returning empty portfolio');
        return this.emptyPortfolio('no-holdings', provenance);
      }

      const pricedHoldings = await this.attachPrices(rawHoldings, provenance);

      const valuedHoldings = pricedHoldings.map(h => ({
        ...h,
        valueUsd: h.confidence >= this.confidenceThreshold && h.priceUsd
          ? h.priceUsd * h.balance
          : 0
      }));

      const totalUsd = valuedHoldings.reduce((sum, h) => {
        if (h.confidence >= this.confidenceThreshold && h.valueUsd > 0) {
          return sum + h.valueUsd;
        }
        return sum;
      }, 0);

      const overallConfidence = this.calculateOverallConfidence(valuedHoldings);
      provenance.confidenceReason = this.getConfidenceReason(overallConfidence, valuedHoldings);

      return {
        totalUsd,
        holdings: valuedHoldings,
        confidence: overallConfidence,
        provenance,
        isDemo: false
      };
    } catch (error) {
      logger.error('Portfolio computation failed:', error);
      provenance.errors.push(error instanceof Error ? error.message : 'Unknown error');

      if (process.env.ALLOW_FALLBACK_ON_ERROR === 'true') {
        logger.warn('Falling back to demo due to error and ALLOW_FALLBACK_ON_ERROR=true');
        provenance.demo = true;
        return this.getDemoPortfolio(provenance);
      }

      return this.emptyPortfolio('error', provenance);
    }
  }

  private async collectHoldingsFromProviders(
    addresses: string[],
    provenance: ProvenanceData
  ): Promise<Holding[]> {
    const holdings: Map<string, Holding> = new Map();
    const providers = this.getAvailableProviders();

    for (const provider of providers) {
      try {
        const providerHoldings = await this.fetchFromProvider(provider, addresses);
        provenance.sources.push(provider);

        for (const holding of providerHoldings) {
          const key = `${holding.chainId}:${holding.tokenAddress}`;
          const existing = holdings.get(key);

          if (!existing) {
            holdings.set(key, holding);
          } else {
            existing.sources = [...new Set([...existing.sources, ...holding.sources])];
            existing.confidence = Math.min(1, existing.confidence + 0.1);
          }
        }
      } catch (error) {
        logger.warn(`Provider ${provider} failed:`, error);
        provenance.errors.push(`${provider}: ${error instanceof Error ? error.message : 'failed'}`);
      }
    }

    return Array.from(holdings.values());
  }

  private async attachPrices(
    holdings: Holding[],
    provenance: ProvenanceData
  ): Promise<Holding[]> {
    const priceService = await import('./price-pipeline').then(m => new m.PricePipeline());

    return Promise.all(holdings.map(async holding => {
      const priceResult = await priceService.getPrice(
        holding.chainId,
        holding.tokenAddress === 'native' ? 'native' : holding.tokenAddress
      );

      if (priceResult) {
        provenance.sources.push(`price:${priceResult.source}`);
        return {
          ...holding,
          priceUsd: priceResult.value,
          priceSource: priceResult.source,
          confidence: Math.min(1, holding.confidence + priceResult.confidence * 0.3)
        };
      }

      logger.debug(`No price found for ${holding.symbol} on chain ${holding.chainId}`);
      return {
        ...holding,
        priceUsd: undefined,
        confidence: Math.max(0, holding.confidence - 0.3)
      };
    }));
  }

  private getAvailableProviders(): string[] {
    const providers: string[] = [];

    if (process.env.ALCHEMY_API_KEY) providers.push('alchemy');
    if (process.env.COVALENT_API_KEY) providers.push('covalent');
    if (process.env.MORALIS_API_KEY) providers.push('moralis');
    if (process.env.QUICKNODE_ENDPOINT) providers.push('quicknode');
    if (process.env.BITQUERY_API_KEY) providers.push('bitquery');

    if (!providers.length) {
      logger.warn('No portfolio providers configured');
    }

    return providers;
  }

  private async fetchFromProvider(provider: string, addresses: string[]): Promise<Holding[]> {
    switch (provider) {
      case 'alchemy':
        return this.fetchFromAlchemy(addresses);
      case 'covalent':
        return this.fetchFromCovalent(addresses);
      case 'moralis':
        return this.fetchFromMoralis(addresses);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async fetchFromAlchemy(addresses: string[]): Promise<Holding[]> {
    const holdings: Holding[] = [];

    for (const address of addresses) {
      const mockBalance: Holding = {
        chainId: 1,
        tokenAddress: 'native',
        symbol: 'ETH',
        decimals: 18,
        balanceRaw: '0',
        balance: 0,
        valueUsd: 0,
        sources: ['alchemy'],
        confidence: 0.7,
        timestamp: Date.now()
      };
      holdings.push(mockBalance);
    }

    return holdings;
  }

  private async fetchFromCovalent(addresses: string[]): Promise<Holding[]> {
    return [];
  }

  private async fetchFromMoralis(addresses: string[]): Promise<Holding[]> {
    return [];
  }

  private calculateOverallConfidence(holdings: Holding[]): 'high' | 'medium' | 'low' | 'none' {
    if (!holdings.length) return 'none';

    const avgConfidence = holdings.reduce((sum, h) => sum + h.confidence, 0) / holdings.length;

    if (avgConfidence >= 0.7) return 'high';
    if (avgConfidence >= 0.4) return 'medium';
    if (avgConfidence > 0) return 'low';
    return 'none';
  }

  private getConfidenceReason(
    confidence: 'high' | 'medium' | 'low' | 'none',
    holdings: Holding[]
  ): string {
    switch (confidence) {
      case 'high':
        return `Multiple sources confirmed ${holdings.length} holdings`;
      case 'medium':
        return `Single source data for ${holdings.length} holdings`;
      case 'low':
        return 'Limited data available, some prices missing';
      case 'none':
        return 'No reliable data available';
    }
  }

  private emptyPortfolio(reason: string, provenance: ProvenanceData): PortfolioResult {
    provenance.confidenceReason = `Empty portfolio: ${reason}`;
    return {
      totalUsd: 0,
      holdings: [],
      confidence: 'none',
      provenance,
      isDemo: false
    };
  }

  private getDemoPortfolio(provenance: ProvenanceData): PortfolioResult {
    provenance.demo = true;
    provenance.sources.push('demo-generator');
    provenance.confidenceReason = 'Demo data - not real values';

    const demoHoldings: Holding[] = [
      {
        chainId: 1,
        tokenAddress: 'native',
        symbol: 'ETH',
        decimals: 18,
        balanceRaw: '2500000000000000000',
        balance: 2.5,
        priceUsd: 1850.25,
        valueUsd: 4625.625,
        sources: ['demo'],
        priceSource: 'demo',
        confidence: 0.1,
        timestamp: Date.now()
      },
      {
        chainId: 1,
        tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        symbol: 'USDC',
        decimals: 6,
        balanceRaw: '1250000000',
        balance: 1250,
        priceUsd: 1.00,
        valueUsd: 1250,
        sources: ['demo'],
        priceSource: 'demo',
        confidence: 0.1,
        timestamp: Date.now()
      }
    ];

    return {
      totalUsd: demoHoldings.reduce((sum, h) => sum + h.valueUsd, 0),
      holdings: demoHoldings,
      confidence: 'none',
      provenance,
      isDemo: true
    };
  }
}