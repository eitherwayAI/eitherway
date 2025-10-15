import { createAppKit } from '@reown/appkit/react';
import { mainnet, arbitrum, bsc, solana } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import type { AppKitNetwork } from '@reown/appkit/networks';

const projectId =
  (typeof process !== 'undefined' && process.env && (process.env.WALLETCONNECT_PROJECT_ID as string)) ||
  '0ab3f2c9a30c1add3cff35eadf12cfc7';

const metadata = {
  name: 'EITHERWAY',
  description: 'Build dApps with AI in 5 minutes',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: ['/icons/logo.svg'],
};

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, bsc, solana, arbitrum];

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  metadata,
  projectId,
  features: {
    analytics: true,
  },
});

export { wagmiAdapter };
