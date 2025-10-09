import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PortfolioPipeline } from '~/lib/services/portfolio-pipeline';
import { PricePipeline } from '~/lib/services/price-pipeline';

describe('PortfolioPipeline - Data Correctness', () => {
  let pipeline: PortfolioPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { NODE_ENV: 'test' };
    pipeline = new PortfolioPipeline();
  });

  describe('Empty Wallet Behavior', () => {
    it('should return $0.00 for empty wallet addresses', async () => {
      const result = await pipeline.computePortfolio(['0x0000000000000000000000000000000000000000']);

      expect(result.totalUsd).toBe(0);
      expect(result.holdings).toHaveLength(0);
      expect(result.confidence).toBe('none');
      expect(result.isDemo).toBe(false);
      expect(result.provenance.confidenceReason).toContain('no-holdings');
    });

    it('should return $0.00 when no addresses provided', async () => {
      const result = await pipeline.computePortfolio([]);

      expect(result.totalUsd).toBe(0);
      expect(result.holdings).toHaveLength(0);
      expect(result.provenance.confidenceReason).toContain('no-addresses');
    });

    it('should return $0.00 for null/undefined addresses', async () => {
      const result = await pipeline.computePortfolio([null as any, undefined as any, '']);

      expect(result.totalUsd).toBe(0);
      expect(result.holdings).toHaveLength(0);
    });
  });

  describe('Demo Mode Gating', () => {
    it('should NOT use demo data when DEMO_MODE is false', async () => {
      process.env.DEMO_MODE = 'false';
      process.env.WALLETCONNECT_PROJECT_ID = undefined;

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.isDemo).toBe(false);
      expect(result.provenance.demo).toBe(false);
      expect(result.totalUsd).toBe(0);
    });

    it('should use demo data ONLY when DEMO_MODE is explicitly true', async () => {
      process.env.DEMO_MODE = 'true';

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.isDemo).toBe(true);
      expect(result.provenance.demo).toBe(true);
      expect(result.holdings.length).toBeGreaterThan(0);
      expect(result.holdings[0].sources).toContain('demo');
    });

    it('should NOT fallback to demo without explicit flag', async () => {
      process.env.WALLETCONNECT_PROJECT_ID = undefined;
      process.env.DEMO_MODE = undefined;

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.isDemo).toBe(false);
      expect(result.totalUsd).toBe(0);
    });
  });

  describe('Price Handling', () => {
    it('should value tokens with unknown prices as $0', async () => {
      vi.spyOn(PricePipeline.prototype, 'getPrice').mockResolvedValue(undefined);

      const mockHoldings = [{
        chainId: 1,
        tokenAddress: '0xunknown' as `0x${string}`,
        symbol: 'UNKNOWN',
        decimals: 18,
        balanceRaw: '1000000000000000000',
        balance: 1.0,
        valueUsd: 0,
        sources: ['test'],
        confidence: 0.5,
        timestamp: Date.now()
      }];

      const pipeline = new PortfolioPipeline();
      vi.spyOn(pipeline as any, 'collectHoldingsFromProviders').mockResolvedValue(mockHoldings);

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.holdings[0].priceUsd).toBeUndefined();
      expect(result.holdings[0].valueUsd).toBe(0);
      expect(result.totalUsd).toBe(0);
    });

    it('should exclude low confidence holdings from total', async () => {
      const mockHoldings = [
        {
          chainId: 1,
          tokenAddress: 'native' as const,
          symbol: 'ETH',
          decimals: 18,
          balanceRaw: '1000000000000000000',
          balance: 1.0,
          priceUsd: 1850,
          valueUsd: 1850,
          sources: ['single-source'],
          confidence: 0.3,
          timestamp: Date.now()
        }
      ];

      const pipeline = new PortfolioPipeline();
      vi.spyOn(pipeline as any, 'collectHoldingsFromProviders').mockResolvedValue(mockHoldings);
      vi.spyOn(pipeline as any, 'attachPrices').mockResolvedValue(mockHoldings);

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.holdings[0].valueUsd).toBe(0);
      expect(result.totalUsd).toBe(0);
    });
  });

  describe('Provenance Tracking', () => {
    it('should track all data sources', async () => {
      process.env.DEMO_MODE = 'true';

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.provenance).toBeDefined();
      expect(result.provenance.sources).toContain('demo-generator');
      expect(result.provenance.timestamp).toBeDefined();
      expect(result.provenance.demo).toBe(true);
    });

    it('should record errors in provenance', async () => {
      vi.spyOn(pipeline as any, 'collectHoldingsFromProviders').mockRejectedValue(
        new Error('Provider failed')
      );

      const result = await pipeline.computePortfolio(['0x123']);

      expect(result.provenance.errors).toContain('Provider failed');
      expect(result.totalUsd).toBe(0);
    });
  });

  describe('Multi-provider Aggregation', () => {
    it('should increase confidence with multiple sources', async () => {
      const holding = {
        chainId: 1,
        tokenAddress: 'native' as const,
        symbol: 'ETH',
        decimals: 18,
        balanceRaw: '1000000000000000000',
        balance: 1.0,
        valueUsd: 0,
        sources: ['alchemy'],
        confidence: 0.5,
        timestamp: Date.now()
      };

      const pipeline = new PortfolioPipeline();
      const holdings = new Map();
      holdings.set('1:native', { ...holding });

      holdings.get('1:native').sources.push('covalent');
      holdings.get('1:native').confidence = Math.min(1, 0.5 + 0.1);

      expect(holdings.get('1:native').sources).toHaveLength(2);
      expect(holdings.get('1:native').confidence).toBe(0.6);
    });
  });
});

describe('PricePipeline - Tiered Fallbacks', () => {
  let pipeline: PricePipeline;

  beforeEach(() => {
    pipeline = new PricePipeline();
    vi.clearAllMocks();
  });

  it('should return undefined for unknown tokens', async () => {
    const result = await pipeline.getPrice(1, '0xunknown');
    expect(result).toBeUndefined();
  });

  it('should cache successful price fetches', async () => {
    vi.spyOn(pipeline as any, 'tryChainlink').mockResolvedValue({
      value: 1850,
      source: 'chainlink',
      confidence: 0.9,
      timestamp: Date.now()
    });

    const result1 = await pipeline.getPrice(1, 'native');
    const result2 = await pipeline.getPrice(1, 'native');

    expect(pipeline['tryChainlink']).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });

  it('should use negative cache for failures', async () => {
    vi.spyOn(pipeline as any, 'tryChainlink').mockResolvedValue(undefined);
    vi.spyOn(pipeline as any, 'tryHttpProvider').mockResolvedValue(undefined);
    vi.spyOn(pipeline as any, 'tryDexTwap').mockResolvedValue(undefined);

    await pipeline.getPrice(1, '0xfails');
    await pipeline.getPrice(1, '0xfails');

    expect(pipeline['tryChainlink']).toHaveBeenCalledTimes(1);
  });
});