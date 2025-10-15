// Environment Configuration Template
// Provides .env.example and README for Web3 applications

export const envExampleTemplate = `
# Web3 Application Environment Configuration
# Copy this file to .env.local and fill in your values

# REQUIRED: WalletConnect Project ID
# Get yours at: https://cloud.walletconnect.com/
WALLETCONNECT_PROJECT_ID=your-project-id-here

# RPC Endpoints (at least one recommended)
# Option 1: Alchemy - https://www.alchemy.com/
RPC_URL_MAINNET=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
RPC_URL_POLYGON=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
RPC_URL_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_API_KEY=your-alchemy-api-key

# Option 2: QuickNode - https://www.quicknode.com/
QUICKNODE_ENDPOINT=https://your-endpoint.quiknode.pro/YOUR_KEY/

# Option 3: Infura - https://infura.io/
RPC_URL_MAINNET=https://mainnet.infura.io/v3/YOUR_KEY
RPC_URL_POLYGON=https://polygon-mainnet.infura.io/v3/YOUR_KEY

# Option 4: Public RPCs (less reliable, no key needed)
# RPC_URL_MAINNET=https://eth.llamarpc.com
# RPC_URL_POLYGON=https://polygon-rpc.com

# Portfolio & Balance Indexers (choose one)
# Covalent - https://www.covalenthq.com/
COVALENT_API_KEY=your-covalent-key

# Moralis - https://moralis.io/
MORALIS_API_KEY=your-moralis-key

# Bitquery - https://bitquery.io/
BITQUERY_API_KEY=your-bitquery-key

# Price Data Providers (optional, enhances price accuracy)
# CoinGecko Pro - https://www.coingecko.com/api/pricing
COINGECKO_API_KEY=your-coingecko-key

# CryptoCompare - https://min-api.cryptocompare.com/
CRYPTOCOMPARE_API_KEY=your-cryptocompare-key

# CoinMarketCap - https://coinmarketcap.com/api/
COINMARKETCAP_API_KEY=your-coinmarketcap-key

# Messari - https://messari.io/api
MESSARI_API_KEY=your-messari-key

# Optional: Analytics
ANALYTICS_ID=your-analytics-id

# Demo Mode Settings
# When true, shows demo data even with API keys configured
FORCE_DEMO_MODE=false
`;

export const readmeTemplate = `
# Web3 Application Setup

## Quick Start

1. **Clone and Install**
   \`\`\`bash
   npm install
   # or
   yarn install
   \`\`\`

2. **Configure Environment**
   - Copy \`.env.example\` to \`.env.local\`
   - Fill in your API keys (see below for obtaining keys)

3. **Run Development Server**
   \`\`\`bash
   npm run dev
   # or
   yarn dev
   \`\`\`

## Getting API Keys

### Required: WalletConnect Project ID
1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. Sign up or log in
3. Create a new project
4. Copy your Project ID

### Recommended: RPC Provider (choose one)

#### Alchemy (Recommended)
1. Visit [Alchemy](https://www.alchemy.com/)
2. Create free account
3. Create an app for each network you need
4. Copy the API keys

#### QuickNode
1. Visit [QuickNode](https://www.quicknode.com/)
2. Create free account
3. Create an endpoint
4. Copy the HTTP provider URL

#### Infura
1. Visit [Infura](https://infura.io/)
2. Create free account
3. Create a project
4. Copy the project ID

### Optional: Portfolio Indexers

#### Covalent
- Free tier: 100,000 credits/month
- Sign up at [Covalent](https://www.covalenthq.com/)
- Good for multi-chain portfolio data

#### Moralis
- Free tier: 3,000 requests/day
- Sign up at [Moralis](https://moralis.io/)
- Fast Web3 data API

### Optional: Price Data

#### CoinGecko
- Free tier: 10,000 calls/month
- Pro features at [CoinGecko](https://www.coingecko.com/api/pricing)
- Most comprehensive crypto data

## Features

### When Configured (Production Mode)
- ✅ Real wallet connections (MetaMask, WalletConnect, etc.)
- ✅ Live blockchain data from your RPC provider
- ✅ Real-time portfolio balances
- ✅ Live price feeds
- ✅ Transaction signing and sending
- ✅ Multi-chain support

### Demo Mode (No Configuration)
- ✅ UI fully functional
- ✅ Wallet connection UI works (but doesn't connect)
- ⚠️ Shows sample data instead of real data
- ⚠️ Transactions disabled
- ℹ️ Banner shows "Demo Mode"

## Architecture

### Tech Stack
- Frontend: [Vanilla JS / React]
- Web3: Reown AppKit / wagmi + viem
- Styling: CSS Variables with Pattern System
- State: LocalStorage / React Context

### Services
- **Web3 Service**: Handles wallet connections and blockchain interactions
- **Portfolio Service**: Fetches and caches token balances
- **Price Service**: Real-time price updates with caching
- **Navigation**: Multi-page (MPA) or Single-page (SPA) routing

### Caching Strategy
- Portfolio data: 60 second cache
- Price data: 30 second cache
- LocalStorage for persistence
- Automatic retry on API failure

## Deployment

### Vercel
\`\`\`bash
vercel --prod
\`\`\`

### Netlify
\`\`\`bash
netlify deploy --prod
\`\`\`

### Railway
\`\`\`bash
railway up
\`\`\`

## Security Notes

⚠️ **Never commit .env.local or expose API keys**
- Add \`.env.local\` to \`.gitignore\`
- Use environment variables in production
- Rotate keys regularly
- Use read-only RPC endpoints
- Implement rate limiting for production

## Troubleshooting

### Wallet Won't Connect
- Check WalletConnect Project ID is valid
- Ensure you're on HTTPS (or localhost)
- Try different wallet (MetaMask vs WalletConnect)

### No Balance Data
- Verify indexer API key is correct
- Check rate limits haven't been exceeded
- Try different indexer service

### Prices Not Updating
- Price provider API might be down
- Check browser console for errors
- Falls back to demo prices automatically

## Support

- Documentation: [Link to docs]
- Issues: [GitHub Issues]
- Discord: [Community Discord]

## License

MIT
`;

export const envLoaderTemplate = `
// Environment Variable Loader
// /scripts/env-loader.js

(function loadEnvironment() {
  // In production, these would be injected by your build process
  // For development, load from .env.local / Vite env

  window.ENV = {
    WALLETCONNECT_PROJECT_ID: process.env.WALLETCONNECT_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',
    RPC_URL_MAINNET: process.env.RPC_URL_MAINNET || import.meta.env.VITE_RPC_URL_MAINNET || '',
    RPC_URL_POLYGON: process.env.RPC_URL_POLYGON || import.meta.env.VITE_RPC_URL_POLYGON || '',
    RPC_URL_ARBITRUM: process.env.RPC_URL_ARBITRUM || import.meta.env.VITE_RPC_URL_ARBITRUM || '',
    RPC_URL_BASE: process.env.RPC_URL_BASE || import.meta.env.VITE_RPC_URL_BASE || '',
    ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || import.meta.env.VITE_ALCHEMY_API_KEY || '',
    COVALENT_API_KEY: process.env.COVALENT_API_KEY || import.meta.env.VITE_COVALENT_API_KEY || '',
    MORALIS_API_KEY: process.env.MORALIS_API_KEY || import.meta.env.VITE_MORALIS_API_KEY || '',
    QUICKNODE_ENDPOINT: process.env.QUICKNODE_ENDPOINT || import.meta.env.VITE_QUICKNODE_ENDPOINT || '',
    BITQUERY_API_KEY: process.env.BITQUERY_API_KEY || import.meta.env.VITE_BITQUERY_API_KEY || '',
    COINGECKO_API_KEY: process.env.COINGECKO_API_KEY || import.meta.env.VITE_COINGECKO_API_KEY || '',
    FORCE_DEMO_MODE: process.env.FORCE_DEMO_MODE === 'true' || import.meta.env.VITE_FORCE_DEMO_MODE === 'true'
  };

  const hasWalletConnect = !!(window.ENV.WALLETCONNECT_PROJECT_ID && window.ENV.WALLETCONNECT_PROJECT_ID !== 'your-project-id-here');

  const hasIndexerOrRpc = !!(
    window.ENV.COVALENT_API_KEY ||
    window.ENV.MORALIS_API_KEY ||
    window.ENV.ALCHEMY_API_KEY ||
    window.ENV.BITQUERY_API_KEY ||
    window.ENV.QUICKNODE_ENDPOINT ||
    window.ENV.RPC_URL_MAINNET ||
    window.ENV.RPC_URL_POLYGON ||
    window.ENV.RPC_URL_ARBITRUM ||
    window.ENV.RPC_URL_BASE
  );

  // Portfolio can be "limited live" with RPC (native balance only) without an indexer
  window.IS_PORTFOLIO_LIVE = hasIndexerOrRpc;
  window.IS_DEMO_MODE = !(hasWalletConnect && hasIndexerOrRpc) || window.ENV.FORCE_DEMO_MODE;

  if (window.IS_DEMO_MODE) {
    console.log('%c Running in Demo Mode ', 'background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px;');
    console.log('Configure .env.local with your API keys for production features');
  } else {
    console.log('%c Running in Production Mode ', 'background: #10b981; color: white; padding: 4px 8px; border-radius: 4px;');
  }
})();
`;
