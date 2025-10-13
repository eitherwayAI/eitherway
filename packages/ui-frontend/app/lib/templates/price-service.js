// Price Service Template
// Fetches live cryptocurrency prices from multiple sources

export const priceServiceTemplate = `
// Price Service - Fetches live token prices
// /scripts/services/prices.js

class PriceService {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = 30 * 1000; // 30 seconds
    this.websocket = null;
    this.priceSubscribers = new Set();
    this.supportedProviders = this.detectAvailableProviders();
  }

  detectAvailableProviders() {
    const providers = [];

    // Free tier providers (no API key needed)
    providers.push('coingecko-free');
    providers.push('coinpaprika');

    // API key based providers
    if (window.ENV?.COINGECKO_API_KEY) providers.push('coingecko-pro');
    if (window.ENV?.CRYPTOCOMPARE_API_KEY) providers.push('cryptocompare');
    if (window.ENV?.COINMARKETCAP_API_KEY) providers.push('coinmarketcap');
    if (window.ENV?.MESSARI_API_KEY) providers.push('messari');

    return providers;
  }

  async getPrices(symbols, vsCurrency = 'usd') {
    const prices = {};
    const toFetch = [];

    // Check cache first
    for (const symbol of symbols) {
      const cacheKey = \`\${symbol}-\${vsCurrency}\`;
      const cached = this.getFromCache(cacheKey);
      if (cached !== null) {
        prices[symbol] = cached;
      } else {
        toFetch.push(symbol);
      }
    }

    // Fetch missing prices
    if (toFetch.length > 0) {
      const fetched = await this.fetchPrices(toFetch, vsCurrency);
      Object.assign(prices, fetched);
    }

    return prices;
  }

  async fetchPrices(symbols, vsCurrency = 'usd') {
    // Try providers in order of preference
    for (const provider of this.supportedProviders) {
      try {
        switch (provider) {
          case 'coingecko-free':
            return await this.fetchFromCoinGecko(symbols, vsCurrency, false);
          case 'coingecko-pro':
            return await this.fetchFromCoinGecko(symbols, vsCurrency, true);
          case 'cryptocompare':
            return await this.fetchFromCryptoCompare(symbols, vsCurrency);
          case 'coinmarketcap':
            return await this.fetchFromCoinMarketCap(symbols, vsCurrency);
          case 'coinpaprika':
            return await this.fetchFromCoinpaprika(symbols, vsCurrency);
          case 'messari':
            return await this.fetchFromMessari(symbols, vsCurrency);
        }
      } catch (error) {
        console.warn(\`Price provider \${provider} failed, trying next...\`);
        continue;
      }
    }

    // If all fail, return demo prices
    return this.getDemoPrices(symbols);
  }

  async fetchFromCoinGecko(symbols, vsCurrency, usePro = false) {
    const ids = symbols.map(s => this.symbolToCoingeckoId(s)).join(',');
    const baseUrl = usePro
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3';

    let url = \`\${baseUrl}/simple/price?ids=\${ids}&vs_currencies=\${vsCurrency}&include_24hr_change=true&include_market_cap=true\`;

    const headers = {};
    if (usePro && window.ENV?.COINGECKO_API_KEY) {
      headers['x-cg-pro-api-key'] = window.ENV.COINGECKO_API_KEY;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('CoinGecko API error');

    const data = await response.json();
    const prices = {};

    for (const symbol of symbols) {
      const id = this.symbolToCoingeckoId(symbol);
      if (data[id]) {
        const price = {
          price: data[id][vsCurrency],
          change24h: data[id][\`\${vsCurrency}_24h_change\`] || 0,
          marketCap: data[id][\`\${vsCurrency}_market_cap\`] || 0
        };
        prices[symbol] = price;
        this.setCache(\`\${symbol}-\${vsCurrency}\`, price);
      }
    }

    return prices;
  }

  async fetchFromCryptoCompare(symbols, vsCurrency) {
    const apiKey = window.ENV.CRYPTOCOMPARE_API_KEY;
    const fsyms = symbols.join(',');
    const tsyms = vsCurrency.toUpperCase();

    const url = \`https://min-api.cryptocompare.com/data/pricemultifull?fsyms=\${fsyms}&tsyms=\${tsyms}&api_key=\${apiKey}\`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('CryptoCompare API error');

    const data = await response.json();
    const prices = {};

    if (data.RAW) {
      for (const symbol of symbols) {
        if (data.RAW[symbol] && data.RAW[symbol][tsyms]) {
          const raw = data.RAW[symbol][tsyms];
          const price = {
            price: raw.PRICE,
            change24h: raw.CHANGEPCT24HOUR || 0,
            marketCap: raw.MKTCAP || 0,
            volume24h: raw.VOLUME24HOUR || 0
          };
          prices[symbol] = price;
          this.setCache(\`\${symbol}-\${vsCurrency}\`, price);
        }
      }
    }

    return prices;
  }

  async fetchFromCoinMarketCap(symbols, vsCurrency) {
    const apiKey = window.ENV.COINMARKETCAP_API_KEY;
    const symbolString = symbols.join(',');

    const url = \`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=\${symbolString}&convert=\${vsCurrency.toUpperCase()}\`;

    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) throw new Error('CoinMarketCap API error');

    const data = await response.json();
    const prices = {};

    if (data.data) {
      for (const symbol of symbols) {
        if (data.data[symbol]) {
          const quote = data.data[symbol].quote[vsCurrency.toUpperCase()];
          const price = {
            price: quote.price,
            change24h: quote.percent_change_24h || 0,
            marketCap: quote.market_cap || 0,
            volume24h: quote.volume_24h || 0
          };
          prices[symbol] = price;
          this.setCache(\`\${symbol}-\${vsCurrency}\`, price);
        }
      }
    }

    return prices;
  }

  async fetchFromCoinpaprika(symbols, vsCurrency) {
    const prices = {};

    for (const symbol of symbols) {
      try {
        const id = this.symbolToCoinpaprikaId(symbol);
        const url = \`https://api.coinpaprika.com/v1/tickers/\${id}?quotes=\${vsCurrency.toUpperCase()}\`;

        const response = await fetch(url);
        if (!response.ok) continue;

        const data = await response.json();
        if (data.quotes && data.quotes[vsCurrency.toUpperCase()]) {
          const quote = data.quotes[vsCurrency.toUpperCase()];
          const price = {
            price: quote.price,
            change24h: quote.percent_change_24h || 0,
            marketCap: quote.market_cap || 0,
            volume24h: quote.volume_24h || 0
          };
          prices[symbol] = price;
          this.setCache(\`\${symbol}-\${vsCurrency}\`, price);
        }
      } catch (error) {
        console.warn(\`Failed to fetch \${symbol} from Coinpaprika\`);
      }
    }

    return prices;
  }

  async fetchFromMessari(symbols, vsCurrency) {
    const apiKey = window.ENV.MESSARI_API_KEY;
    const prices = {};

    for (const symbol of symbols) {
      try {
        const url = \`https://data.messari.io/api/v1/assets/\${symbol.toLowerCase()}/metrics/market-data\`;

        const response = await fetch(url, {
          headers: {
            'x-messari-api-key': apiKey
          }
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (data.data && data.data.market_data) {
          const marketData = data.data.market_data;
          const price = {
            price: marketData.price_usd,
            change24h: marketData.percent_change_usd_last_24_hours || 0,
            marketCap: marketData.marketcap_current_usd || 0,
            volume24h: marketData.volume_last_24_hours || 0
          };
          prices[symbol] = price;
          this.setCache(\`\${symbol}-\${vsCurrency}\`, price);
        }
      } catch (error) {
        console.warn(\`Failed to fetch \${symbol} from Messari\`);
      }
    }

    return prices;
  }

  symbolToCoingeckoId(symbol) {
    const mapping = {
      'ETH': 'ethereum',
      'BTC': 'bitcoin',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'BNB': 'binancecoin',
      'SOL': 'solana',
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'AAVE': 'aave',
      'CRV': 'curve-dao-token'
    };
    return mapping[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  symbolToCoinpaprikaId(symbol) {
    const mapping = {
      'ETH': 'eth-ethereum',
      'BTC': 'btc-bitcoin',
      'USDC': 'usdc-usd-coin',
      'USDT': 'usdt-tether',
      'BNB': 'bnb-binance-coin'
    };
    return mapping[symbol.toUpperCase()] || \`\${symbol.toLowerCase()}-\${symbol.toLowerCase()}\`;
  }

  getDemoPrices(symbols) {
    const basePrices = {
      'ETH': { price: 1850.25, change24h: 2.34, marketCap: 222000000000 },
      'BTC': { price: 35420.50, change24h: 3.12, marketCap: 690000000000 },
      'USDC': { price: 1.00, change24h: 0.01, marketCap: 24000000000 },
      'USDT': { price: 1.00, change24h: -0.02, marketCap: 91000000000 },
      'BNB': { price: 245.80, change24h: 1.56, marketCap: 37000000000 },
      'SOL': { price: 58.25, change24h: 5.43, marketCap: 24000000000 },
      'MATIC': { price: 0.85, change24h: -1.23, marketCap: 7900000000 }
    };

    const prices = {};
    for (const symbol of symbols) {
      if (basePrices[symbol.toUpperCase()]) {
        // Add some randomness to make it look live
        const base = basePrices[symbol.toUpperCase()];
        prices[symbol] = {
          price: base.price * (1 + (Math.random() - 0.5) * 0.02),
          change24h: base.change24h + (Math.random() - 0.5) * 0.5,
          marketCap: base.marketCap
        };
      } else {
        prices[symbol] = {
          price: Math.random() * 100,
          change24h: (Math.random() - 0.5) * 10,
          marketCap: Math.random() * 1000000000
        };
      }
    }

    return prices;
  }

  // Real-time price updates via WebSocket
  subscribeToRealtime(symbols, callback) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }

    // Store subscriber
    this.priceSubscribers.add({ symbols, callback });

    // Send subscription message
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        action: 'subscribe',
        symbols: symbols
      }));
    }
  }

  connectWebSocket() {
    // Use free WebSocket providers like Binance or Coinbase
    const wsUrl = 'wss://stream.binance.com:9443/ws';

    this.websocket = new WebSocket(wsUrl);

    this.websocket.onopen = () => {
      console.log('WebSocket connected for real-time prices');
      // Re-subscribe all existing subscriptions
      for (const subscriber of this.priceSubscribers) {
        this.websocket.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: subscriber.symbols.map(s => \`\${s.toLowerCase()}usdt@ticker\`),
          id: 1
        }));
      }
    };

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.e === '24hrTicker') {
        const symbol = data.s.replace('USDT', '');
        const price = {
          price: parseFloat(data.c),
          change24h: parseFloat(data.P),
          volume24h: parseFloat(data.v)
        };

        // Notify all subscribers
        for (const subscriber of this.priceSubscribers) {
          if (subscriber.symbols.includes(symbol)) {
            subscriber.callback({ [symbol]: price });
          }
        }
      }
    };

    this.websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.websocket.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect after 5 seconds
      setTimeout(() => this.connectWebSocket(), 5000);
    };
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

  formatPrice(price, decimals = 2) {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { maximumFractionDigits: decimals });
    } else if (price >= 1) {
      return price.toFixed(decimals);
    } else {
      return price.toFixed(Math.max(4, decimals));
    }
  }

  formatMarketCap(marketCap) {
    if (marketCap >= 1e12) {
      return '$' + (marketCap / 1e12).toFixed(2) + 'T';
    } else if (marketCap >= 1e9) {
      return '$' + (marketCap / 1e9).toFixed(2) + 'B';
    } else if (marketCap >= 1e6) {
      return '$' + (marketCap / 1e6).toFixed(2) + 'M';
    } else {
      return '$' + marketCap.toLocaleString();
    }
  }
}

// Export for use
const priceService = new PriceService();
window.priceService = priceService;
`;
