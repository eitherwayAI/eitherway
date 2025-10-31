import { usePrivy } from '@privy-io/react-auth';

/**
 * Custom hook that wraps Privy's usePrivy hook
 * Provides authentication state and methods for the application
 */
export function usePrivyAuth() {
  const {
    ready,
    authenticated,
    user,
    login,
    logout,
    linkEmail,
    linkWallet,
    unlinkEmail,
    unlinkWallet,
    exportWallet,
  } = usePrivy();

  /**
   * Get the user's primary wallet address
   * Checks linked wallets first, then embedded wallet
   */
  const getWalletAddress = (): string | undefined => {
    if (!user) return undefined;

    // Check for linked external wallets first
    const linkedWallet = user.linkedAccounts.find(
      (account) => account.type === 'wallet'
    );
    if (linkedWallet && 'address' in linkedWallet) {
      return linkedWallet.address;
    }

    // Check for embedded wallet
    const embeddedWallet = user.linkedAccounts.find(
      (account) => account.type === 'smart_wallet' || account.type === 'cross_app_wallet'
    );
    if (embeddedWallet && 'address' in embeddedWallet) {
      return embeddedWallet.address;
    }

    return undefined;
  };

  /**
   * Get the user's email address
   */
  const getEmail = (): string | undefined => {
    if (!user) return undefined;

    const emailAccount = user.linkedAccounts.find(
      (account) => account.type === 'email'
    );
    if (emailAccount && 'address' in emailAccount) {
      return emailAccount.address;
    }

    // Fallback to Google OAuth email
    const googleAccount = user.linkedAccounts.find(
      (account) => account.type === 'google_oauth'
    );
    if (googleAccount && 'email' in googleAccount) {
      return googleAccount.email;
    }

    return undefined;
  };

  /**
   * Get user identifier (email or wallet address)
   * Prioritizes email for Web2 users, wallet for Web3 users
   */
  const getUserIdentifier = (): string => {
    const email = getEmail();
    if (email) return email;

    const wallet = getWalletAddress();
    if (wallet) return wallet;

    // Fallback to Privy user ID
    return user?.id || 'anonymous';
  };

  /**
   * Format wallet address for display (0x1234...5678)
   */
  const formatAddress = (address?: string): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /**
   * Check if user has a wallet connected
   */
  const hasWallet = (): boolean => {
    return getWalletAddress() !== undefined;
  };

  /**
   * Check if user has email linked
   */
  const hasEmail = (): boolean => {
    return getEmail() !== undefined;
  };

  /**
   * Get user's display name
   */
  const getDisplayName = (): string => {
    if (!user) return 'Guest';

    // Try to get name from Google OAuth
    const googleAccount = user.linkedAccounts.find(
      (account) => account.type === 'google_oauth'
    );
    if (googleAccount && 'name' in googleAccount) {
      return googleAccount.name || 'User';
    }

    // Fallback to email or formatted wallet
    const email = getEmail();
    if (email) {
      return email.split('@')[0];
    }

    const wallet = getWalletAddress();
    if (wallet) {
      return formatAddress(wallet);
    }

    return 'User';
  };

  return {
    // Authentication state
    ready,
    authenticated,
    user,

    // Authentication methods
    login,
    logout,

    // Account linking methods
    linkEmail,
    linkWallet,
    unlinkEmail,
    unlinkWallet,
    exportWallet,

    // Helper methods
    getWalletAddress,
    getEmail,
    getUserIdentifier,
    getDisplayName,
    formatAddress,
    hasWallet,
    hasEmail,
  };
}
