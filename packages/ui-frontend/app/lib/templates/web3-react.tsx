// Web3 Service Template for React
// Using wagmi + viem + Reown AppKit

export const web3ReactTemplate = `
// Web3 Configuration for React
// /src/lib/web3.ts

import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';
import { QueryClient } from '@tanstack/react-query';
import { http, createConfig } from 'wagmi';

const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

const metadata = {
  name: 'Web3 Application',
  description: 'Production-ready Web3 app with wallet connection',
  url: window.location.origin,
  icons: ['/logo.png']
};

const chains = [mainnet, polygon, arbitrum, optimism, base] as const;

const wagmiAdapter = new WagmiAdapter({
  chains,
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_RPC_URL_MAINNET || 'https://eth.llamarpc.com'),
    [polygon.id]: http(import.meta.env.VITE_RPC_URL_POLYGON || 'https://polygon-rpc.com'),
    [arbitrum.id]: http(import.meta.env.VITE_RPC_URL_ARBITRUM || 'https://arb1.arbitrum.io/rpc'),
    [optimism.id]: http(import.meta.env.VITE_RPC_URL_OPTIMISM || 'https://mainnet.optimism.io'),
    [base.id]: http(import.meta.env.VITE_RPC_URL_BASE || 'https://mainnet.base.org')
  },
  projectId
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  chains,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: false
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#6366F1',
    '--w3m-border-radius-master': '12px'
  }
});

export { wagmiAdapter, queryClient };

// /src/hooks/useWeb3.ts
import { useAccount, useBalance, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import { useState, useEffect } from 'react';

export interface Web3State {
  address?: string;
  chainId?: number;
  balance?: string;
  isConnected: boolean;
  isConnecting: boolean;
  isDemo: boolean;
}

export function useWeb3() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balanceData } = useBalance({ address });

  const [isDemo] = useState(!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID);

  const balance = balanceData ? formatEther(balanceData.value) : undefined;

  const formatAddress = (addr?: string) => {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  };

  const handleSwitchNetwork = async (newChainId: number) => {
    try {
      await switchChain({ chainId: newChainId });
    } catch (error) {
      console.error('Failed to switch network:', error);
    }
  };

  return {
    address,
    chainId,
    balance,
    isConnected,
    isConnecting,
    isDemo,
    disconnect,
    switchNetwork: handleSwitchNetwork,
    formatAddress
  };
}

// /src/components/ConnectButton.tsx
import React from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useWeb3 } from '../hooks/useWeb3';

export function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected, disconnect, formatAddress, isDemo } = useWeb3();

  const handleClick = () => {
    if (isConnected) {
      disconnect();
    } else {
      open();
    }
  };

  return (
    <>
      {isDemo && (
        <div className="demo-banner">
          Demo Mode - Configure VITE_WALLETCONNECT_PROJECT_ID for live connections
        </div>
      )}
      <button
        onClick={handleClick}
        className="btn btn-primary connect-wallet"
      >
        {isConnected && address ? formatAddress(address) : 'Connect Wallet'}
      </button>
    </>
  );
}

// /src/components/NetworkSelector.tsx
import React from 'react';
import { useWeb3 } from '../hooks/useWeb3';

const networks = [
  { id: 1, name: 'Ethereum', icon: '⟠' },
  { id: 137, name: 'Polygon', icon: '⬡' },
  { id: 42161, name: 'Arbitrum', icon: '◈' },
  { id: 10, name: 'Optimism', icon: '⭕' },
  { id: 8453, name: 'Base', icon: '🔵' }
];

export function NetworkSelector() {
  const { chainId, switchNetwork, isConnected } = useWeb3();

  if (!isConnected) return null;

  return (
    <select
      value={chainId}
      onChange={(e) => switchNetwork(Number(e.target.value))}
      className="network-selector"
    >
      {networks.map((network) => (
        <option key={network.id} value={network.id}>
          {network.name}
        </option>
      ))}
    </select>
  );
}

// /src/services/portfolio.ts
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

export interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  valueUSD: number;
  price: number;
}

export class PortfolioService {
  private client;
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheDuration = 60 * 1000; // 1 minute

  constructor() {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(import.meta.env.VITE_RPC_URL_MAINNET)
    });
  }

  async getTokenBalances(address: string): Promise<TokenBalance[]> {
    const cacheKey = \`balances-\${address}\`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Use a token indexer API like Covalent, Alchemy, or Moralis
      const response = await this.fetchFromIndexer(address);
      const balances = this.parseTokenBalances(response);

      this.setCache(cacheKey, balances);
      return balances;
    } catch (error) {
      console.error('Failed to fetch token balances:', error);
      return this.getDemoBalances();
    }
  }

  private async fetchFromIndexer(address: string) {
    const apiKey = import.meta.env.VITE_COVALENT_API_KEY;
    if (!apiKey) return this.getDemoBalances();

    const url = \`https://api.covalenthq.com/v1/1/address/\${address}/balances_v2/?key=\${apiKey}\`;
    const response = await fetch(url);
    return response.json();
  }

  private parseTokenBalances(data: any): TokenBalance[] {
    if (!data?.data?.items) return [];

    return data.data.items
      .filter((item: any) => item.balance > 0)
      .map((item: any) => ({
        symbol: item.contract_ticker_symbol,
        name: item.contract_name,
        balance: (Number(item.balance) / Math.pow(10, item.contract_decimals)).toFixed(4),
        valueUSD: item.quote || 0,
        price: item.quote_rate || 0
      }));
  }

  private getDemoBalances(): TokenBalance[] {
    return [
      { symbol: 'ETH', name: 'Ethereum', balance: '2.4567', valueUSD: 4500, price: 1832.45 },
      { symbol: 'USDC', name: 'USD Coin', balance: '1250.00', valueUSD: 1250, price: 1.00 },
      { symbol: 'WBTC', name: 'Wrapped Bitcoin', balance: '0.0543', valueUSD: 2150, price: 39592.12 }
    ];
  }

  private getFromCache(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheDuration) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}

// /src/services/prices.ts
export class PriceService {
  private cache = new Map<string, { price: number; timestamp: number }>();
  private cacheDuration = 30 * 1000; // 30 seconds

  async getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};
    const toFetch: string[] = [];

    for (const symbol of symbols) {
      const cached = this.getFromCache(symbol);
      if (cached) {
        prices[symbol] = cached;
      } else {
        toFetch.push(symbol);
      }
    }

    if (toFetch.length > 0) {
      const fetched = await this.fetchPrices(toFetch);
      Object.assign(prices, fetched);
    }

    return prices;
  }

  private async fetchPrices(symbols: string[]): Promise<Record<string, number>> {
    try {
      const ids = symbols.map(s => this.symbolToCoingeckoId(s)).join(',');
      const url = \`https://api.coingecko.com/api/v3/simple/price?ids=\${ids}&vs_currencies=usd\`;

      const response = await fetch(url);
      const data = await response.json();

      const prices: Record<string, number> = {};
      for (const symbol of symbols) {
        const id = this.symbolToCoingeckoId(symbol);
        if (data[id]) {
          prices[symbol] = data[id].usd;
          this.setCache(symbol, data[id].usd);
        }
      }

      return prices;
    } catch (error) {
      console.error('Failed to fetch prices:', error);
      return this.getDemoPrices(symbols);
    }
  }

  private symbolToCoingeckoId(symbol: string): string {
    const mapping: Record<string, string> = {
      'ETH': 'ethereum',
      'BTC': 'bitcoin',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'MATIC': 'matic-network'
    };
    return mapping[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  private getDemoPrices(symbols: string[]): Record<string, number> {
    const basePrices: Record<string, number> = {
      'ETH': 1850 + Math.random() * 100,
      'BTC': 35000 + Math.random() * 1000,
      'USDC': 1.00,
      'USDT': 1.00
    };

    const prices: Record<string, number> = {};
    for (const symbol of symbols) {
      prices[symbol] = basePrices[symbol] || Math.random() * 100;
    }
    return prices;
  }

  private getFromCache(symbol: string): number | null {
    const cached = this.cache.get(symbol);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheDuration) {
      this.cache.delete(symbol);
      return null;
    }

    return cached.price;
  }

  private setCache(symbol: string, price: number) {
    this.cache.set(symbol, { price, timestamp: Date.now() });
  }
}
`;