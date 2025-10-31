import { PrivyProvider } from '@privy-io/react-auth';
import React from 'react';

interface PrivyAuthProviderProps {
  children: React.ReactNode;
}

/**
 * PrivyAuthProvider wraps the application with Privy authentication
 * Supports Web2 (email, OAuth) and Web3 (wallet) authentication methods
 */
export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID;

  if (!appId) {
    console.error('VITE_PRIVY_APP_ID is not set in environment variables');
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Appearance configuration
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
          logo: undefined,
        },
        // Login methods configuration
        loginMethods: ['email', 'wallet', 'google'],
        // Embedded wallet configuration
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
        },
        // External wallet configuration
        externalWallets: {
          coinbaseWallet: {
            connectionOptions: 'all',
          },
        },
        // Legal and UI configuration
        legal: {
          termsAndConditionsUrl: undefined,
          privacyPolicyUrl: undefined,
        },
        // Supported chains for wallet connections
        supportedChains: [
          // Ethereum Mainnet
          {
            id: 1,
            name: 'Ethereum',
            network: 'mainnet',
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ['https://eth-mainnet.g.alchemy.com/v2/d-y4foWYwD_C-LCGojY8I'],
              },
            },
            blockExplorers: {
              default: {
                name: 'Etherscan',
                url: 'https://etherscan.io',
              },
            },
          },
          // Binance Smart Chain
          {
            id: 56,
            name: 'BNB Smart Chain',
            network: 'bsc',
            nativeCurrency: {
              name: 'BNB',
              symbol: 'BNB',
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ['https://bsc-dataseed1.binance.org'],
              },
            },
            blockExplorers: {
              default: {
                name: 'BscScan',
                url: 'https://bscscan.com',
              },
            },
          },
          // Arbitrum
          {
            id: 42161,
            name: 'Arbitrum One',
            network: 'arbitrum',
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ['https://arb1.arbitrum.io/rpc'],
              },
            },
            blockExplorers: {
              default: {
                name: 'Arbiscan',
                url: 'https://arbiscan.io',
              },
            },
          },
        ],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
