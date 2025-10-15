import { useAppKitAccount } from '@reown/appkit/react';
import { appKit } from './config';

export function useWalletConnection() {
  const { isConnected, address } = useAppKitAccount();

  const connectWallet = async () => {
    console.log('connectWallet called, appKit:', appKit);

    try {
      await appKit.open({ view: isConnected ? 'Account' : 'Connect' });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const disconnectWallet = async () => {
    try {
      await appKit.open({ view: 'Account' });
    } catch (error) {
      console.error('Failed to open account modal:', error);
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return {
    connectWallet,
    disconnectWallet,
    isConnected,
    address,
    formatAddress,
  };
}
