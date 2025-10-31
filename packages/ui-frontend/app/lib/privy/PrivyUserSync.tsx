import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

/**
 * Component that syncs Privy user data with backend database
 * Automatically syncs when user authenticates via Privy
 */
export function PrivyUserSync() {
  const { ready, authenticated, user } = usePrivy();

  useEffect(() => {
    // Only sync when Privy is ready, user is authenticated, and we have user data
    if (!ready || !authenticated || !user) {
      return;
    }

    console.log('🔄 [Privy] Syncing user data with backend...', user.id);

    // Extract user data from Privy
    const privyUserId = user.id;

    // Get display name from Google OAuth if available
    const googleAccount = user.linkedAccounts.find(
      (account) => account.type === 'google_oauth'
    );
    const displayName = googleAccount && 'name' in googleAccount ? googleAccount.name : undefined;

    // Extract wallets
    const wallets = user.linkedAccounts
      .filter((account) => account.type === 'wallet' || account.type === 'smart_wallet')
      .map((account) => {
        if ('address' in account) {
          return {
            address: account.address,
            type: account.type === 'smart_wallet' ? 'privy_embedded' : 'metamask',
            chainType: account.chainType || 'ethereum',
            isEmbedded: account.type === 'smart_wallet',
            isPrimary: false,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Extract emails
    const emails = user.linkedAccounts
      .filter((account) => account.type === 'email' || account.type === 'google_oauth')
      .map((account, index) => {
        if (account.type === 'email' && 'address' in account) {
          return {
            address: account.address,
            isPrimary: index === 0,
          };
        }
        if (account.type === 'google_oauth' && 'email' in account) {
          return {
            address: account.email,
            isPrimary: index === 0,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Extract OAuth accounts
    const oauthAccounts = user.linkedAccounts
      .filter((account) => account.type === 'google_oauth')
      .map((account, index) => {
        if ('email' in account && 'subject' in account) {
          return {
            provider: 'google',
            providerUserId: account.subject,
            email: account.email,
            username: undefined,
            name: 'name' in account ? account.name : undefined,
            isPrimary: index === 0,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Sync with backend
    fetch('https://localhost:3001/api/privy/sync-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        privyUserId,
        displayName,
        wallets,
        emails,
        oauthAccounts,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          console.log('✅ [Privy] User data synced successfully', data.user);
          // Store user ID in localStorage for session persistence
          localStorage.setItem('privy_user_id', privyUserId);
          if (data.user?.id) {
            localStorage.setItem('db_user_id', data.user.id);
          }
        } else {
          console.error('❌ [Privy] Failed to sync user data:', data.error);
        }
      })
      .catch((error) => {
        console.error('❌ [Privy] Error syncing user data:', error);
      });
  }, [ready, authenticated, user]);

  return null; // This component doesn't render anything
}
