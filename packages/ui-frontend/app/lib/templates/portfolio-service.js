// Portfolio Service Template
// Provides live portfolio data with fallback to demo mode

export const portfolioServiceTemplate = `
// Portfolio Service - Fetches token balances and portfolio data
// /scripts/services/portfolio.js

class PortfolioService {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = 60 * 1000; // 1 minute
    this.isDemo = !this.hasApiKeys();
    this.supportedIndexers = this.detectAvailableIndexers();
  }

  hasApiKeys() {
    const E = window.ENV || {};
    return Boolean(
      E.COVALENT_API_KEY ||
      E.MORALIS_API_KEY ||
      E.ALCHEMY_API_KEY ||
      E.QUICKNODE_ENDPOINT ||
      E.BITQUERY_API_KEY ||
      E.RPC_URL_MAINNET || E.RPC_URL_POLYGON || E.RPC_URL_ARBITRUM || E.RPC_URL_BASE
    );
  }

  detectAvailableIndexers() {
    const E = window.ENV || {};
    const indexers = [];
    if (E.COVALENT_API_KEY) indexers.push('covalent');
    if (E.MORALIS_API_KEY) indexers.push('moralis');
    if (E.ALCHEMY_API_KEY) indexers.push('alchemy');
    if (E.QUICKNODE_ENDPOINT) indexers.push('quicknode');
    if (E.BITQUERY_API_KEY) indexers.push('bitquery');
    // RPC fallback (native balance only)
    if (E.RPC_URL_MAINNET || E.RPC_URL_POLYGON || E.RPC_URL_ARBITRUM || E.RPC_URL_BASE) indexers.push('rpc');
    return indexers;
  }

  async getPortfolio(address, chainId = 1) {
    if (!address) return this.getDemoPortfolio();

    const cacheKey = \`portfolio-\${address}-\${chainId}\`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const portfolio = await this.fetchPortfolio(address, chainId);
      this.setCache(cacheKey, portfolio);
      return portfolio;
    } catch (error) {
      console.error('Portfolio fetch failed:', error);
      return this.getDemoPortfolio();
    }
  }

  async fetchPortfolio(address, chainId) {
    if (this.isDemo) return this.getDemoPortfolio();

    // Try available indexers in order of preference
    for (const indexer of this.supportedIndexers) {
      try {
        switch (indexer) {
          case 'covalent':
            return await this.fetchFromCovalent(address, chainId);
          case 'moralis':
            return await this.fetchFromMoralis(address, chainId);
          case 'alchemy':
            return await this.fetchFromAlchemy(address, chainId);
          case 'quicknode':
            return await this.fetchFromQuickNode(address, chainId);
          case 'bitquery':
            return await this.fetchFromBitquery(address, chainId);
          case 'rpc':
            return await this.fetchFromRPC(address, chainId);
        }
      } catch (error) {
        console.warn(\`Indexer \${indexer} failed, trying next...\`);
        continue;
      }
    }

    return this.getDemoPortfolio();
  }

  getRpcUrl(chainId) {
    const E = window.ENV || {};
    switch (Number(chainId)) {
      case 1:
        return E.RPC_URL_MAINNET || E.QUICKNODE_ENDPOINT || E.ALCHEMY_RPC || 'https://eth.llamarpc.com';
      case 137:
        return E.RPC_URL_POLYGON || 'https://polygon-rpc.com';
      case 42161:
        return E.RPC_URL_ARBITRUM || 'https://arb1.arbitrum.io/rpc';
      case 8453:
        return E.RPC_URL_BASE || 'https://mainnet.base.org';
      default:
        return E.RPC_URL_MAINNET || 'https://eth.llamarpc.com';
    }
  }

  getNativeSymbol(chainId) {
    switch (Number(chainId)) {
      case 1:
        return 'ETH';
      case 137:
        return 'MATIC';
      case 42161:
        return 'ETH';
      case 8453:
        return 'ETH';
      default:
        return 'ETH';
    }
  }

  async jsonRpc(url, method, params) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params })
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'RPC Error');
    return j.result;
  }

  async fetchFromRPC(address, chainId) {
    const url = this.getRpcUrl(chainId);
    if (!url) throw new Error('No RPC URL configured');

    const balanceHex = await this.jsonRpc(url, 'eth_getBalance', [address, 'latest']);
    const balance = this.formatBalanceHex(balanceHex);
    const symbol = this.getNativeSymbol(chainId);

    const holdings = [{
      chainId,
      symbol,
      name: symbol,
      address: 'native',
      decimals: 18,
      balance,
      valueUSD: null
    }];

    holdings.__limited = true;
    return holdings;
  }

  async fetchFromCovalent(address, chainId) {
    const apiKey = window.ENV.COVALENT_API_KEY;
    const url = \`https://api.covalenthq.com/v1/\${chainId}/address/\${address}/balances_v2/?key=\${apiKey}\`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Covalent API error');

    const data = await response.json();
    return this.parseCovalentData(data);
  }

  async fetchFromMoralis(address, chainId) {
    const apiKey = window.ENV.MORALIS_API_KEY;
    const chainMap = { 1: 'eth', 137: 'polygon', 56: 'bsc', 43114: 'avalanche' };
    const chain = chainMap[chainId] || 'eth';

    const response = await fetch(
      \`https://deep-index.moralis.io/api/v2.2/\${address}/erc20?chain=\${chain}\`,
      {
        headers: { 'X-API-Key': apiKey }
      }
    );

    if (!response.ok) throw new Error('Moralis API error');
    const data = await response.json();
    return this.parseMoralisData(data);
  }

  async fetchFromAlchemy(address, chainId) {
    const apiKey = window.ENV.ALCHEMY_API_KEY;
    const networks = { 1: 'eth-mainnet', 137: 'polygon-mainnet', 42161: 'arb-mainnet' };
    const network = networks[chainId] || 'eth-mainnet';

    const url = \`https://\${network}.g.alchemy.com/v2/\${apiKey}\`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alchemy_getTokenBalances',
        params: [address],
        id: 1
      })
    });

    if (!response.ok) throw new Error('Alchemy API error');
    const data = await response.json();
    return this.parseAlchemyData(data);
  }

  async fetchFromQuickNode(address, chainId) {
    const endpoint = window.ENV.QUICKNODE_ENDPOINT;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'qn_getWalletTokenBalance',
        params: { wallet: address },
        id: 1,
        jsonrpc: '2.0'
      })
    });

    if (!response.ok) throw new Error('QuickNode API error');
    const data = await response.json();
    return this.parseQuickNodeData(data);
  }

  async fetchFromBitquery(address, chainId) {
    const apiKey = window.ENV.BITQUERY_API_KEY;
    const networks = { 1: 'ethereum', 56: 'bsc', 137: 'matic' };
    const network = networks[chainId] || 'ethereum';

    const query = \`
      {
        \${network}(network: \${network}) {
          address(address: {is: "\${address}"}) {
            balances {
              currency {
                symbol
                name
                address
                decimals
              }
              value
            }
          }
        }
      }
    \`;

    const response = await fetch('https://graphql.bitquery.io', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) throw new Error('Bitquery API error');
    const data = await response.json();
    return this.parseBitqueryData(data, network);
  }

  parseCovalentData(data) {
    if (!data?.data?.items) return [];

    return data.data.items
      .filter(item => Number(item.balance) > 0)
      .map(item => ({
        symbol: item.contract_ticker_symbol || 'Unknown',
        name: item.contract_name || 'Unknown Token',
        address: item.contract_address,
        balance: this.formatBalance(item.balance, item.contract_decimals),
        valueUSD: item.quote || 0,
        price: item.quote_rate || 0,
        change24h: item.quote_24h || 0,
        logo: item.logo_url || null
      }));
  }

  parseMoralisData(data) {
    if (!Array.isArray(data)) return [];

    return data
      .filter(token => Number(token.balance) > 0)
      .map(token => ({
        symbol: token.symbol || 'Unknown',
        name: token.name || 'Unknown Token',
        address: token.token_address,
        balance: this.formatBalance(token.balance, token.decimals),
        valueUSD: 0, // Moralis doesn't provide USD value directly
        price: 0,
        change24h: 0,
        logo: token.logo || null
      }));
  }

  parseAlchemyData(data) {
    if (!data?.result?.tokenBalances) return [];

    return data.result.tokenBalances
      .filter(token => token.tokenBalance !== '0x0')
      .map(token => ({
        symbol: 'TOKEN', // Alchemy requires additional calls for metadata
        name: 'Token',
        address: token.contractAddress,
        balance: this.formatBalanceHex(token.tokenBalance),
        valueUSD: 0,
        price: 0,
        change24h: 0,
        logo: null
      }));
  }

  parseQuickNodeData(data) {
    if (!data?.result?.result) return [];

    return data.result.result.map(token => ({
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      balance: this.formatBalance(token.amount, token.decimals),
      valueUSD: token.totalBalance || 0,
      price: 0,
      change24h: 0,
      logo: null
    }));
  }

  parseBitqueryData(data, network) {
    if (!data?.data?.[network]?.address?.[0]?.balances) return [];

    return data.data[network].address[0].balances
      .filter(item => Number(item.value) > 0)
      .map(item => ({
        symbol: item.currency.symbol,
        name: item.currency.name,
        address: item.currency.address,
        balance: item.value,
        valueUSD: 0,
        price: 0,
        change24h: 0,
        logo: null
      }));
  }

  formatBalance(balance, decimals) {
    const divisor = Math.pow(10, Number(decimals) || 18);
    return (Number(balance) / divisor).toFixed(4);
  }

  formatBalanceHex(hexBalance) {
    const balance = parseInt(hexBalance, 16);
    return this.formatBalance(balance.toString(), 18);
  }

  getDemoPortfolio() {
    const holdings = [
      {
        symbol: 'ETH',
        name: 'Ethereum',
        address: '0x0000000000000000000000000000000000000000',
        balance: (Math.random() * 5 + 1).toFixed(4),
        valueUSD: 0,
        price: 1850.25,
        change24h: 2.34,
        logo: '/assets/ethereum_logo.png'
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        balance: (Math.random() * 5000 + 1000).toFixed(2),
        valueUSD: 0,
        price: 1.00,
        change24h: 0.01,
        logo: '/assets/usdc_logo.png'
      },
      {
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        balance: (Math.random() * 0.1 + 0.01).toFixed(6),
        valueUSD: 0,
        price: 35420.50,
        change24h: 3.12,
        logo: '/assets/wbtc_logo.png'
      },
      {
        symbol: 'LINK',
        name: 'Chainlink',
        address: '0x514910771af9ca656af840dff83e8264ecf986ca',
        balance: (Math.random() * 100 + 10).toFixed(2),
        valueUSD: 0,
        price: 14.85,
        change24h: -1.23,
        logo: '/assets/link_logo.png'
      }
    ];

    // Calculate USD values
    holdings.forEach(token => {
      token.valueUSD = Number(token.balance) * token.price;
    });

    return holdings;
  }

  async getPerformanceHistory(address, days = 30) {
    const cacheKey = \`performance-\${address}-\${days}\`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    if (this.isDemo || !address) {
      return this.getDemoPerformance(days);
    }

    try {
      // Fetch historical data from indexer
      const history = await this.fetchHistoricalData(address, days);
      this.setCache(cacheKey, history);
      return history;
    } catch (error) {
      console.error('Failed to fetch performance history:', error);
      return this.getDemoPerformance(days);
    }
  }

  getDemoPerformance(days) {
    const data = [];
    const now = Date.now();
    const interval = 24 * 60 * 60 * 1000; // 1 day in ms
    let value = 10000;

    for (let i = days; i >= 0; i--) {
      const change = (Math.random() - 0.5) * 500;
      value = Math.max(value + change, 1000);
      data.push({
        timestamp: now - (i * interval),
        value: value,
        date: new Date(now - (i * interval)).toLocaleDateString()
      });
    }

    return data;
  }

  async fetchHistoricalData(address, days) {
    // Implementation depends on the indexer being used
    // This would fetch historical balance snapshots
    return this.getDemoPerformance(days);
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheDuration) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

// Export for use
const portfolioService = new PortfolioService();
window.portfolioService = portfolioService;
`;
